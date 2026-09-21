// Purpose: Serve the six workbench modules behind one local authenticated JSON API and static browser interface.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { timingSafeEqual, randomUUID } from "node:crypto";
import {
  evaluate,
  replay,
  validatePack,
  createJevProvider,
  fingerprint,
} from "@gbesse/decisionpacks";
import { experiment } from "@gbesse/question-forge";
import { createJevPredictor } from "@gbesse/question-forge/jev";
import { Store, Conflict } from "../core/store.mjs";
import { acquireWorkspace } from "../core/lease.mjs";
import { ensure, snapshot, bounded } from "../core/contracts.mjs";
import { createRegistry } from "./registry.mjs";
import { examplePack, exampleCsv, syntheticProvider } from "./fixtures.mjs";
import { mapState } from "../statebridge/index.mjs";
import { evaluateRows, exportCsv } from "../sheets/index.mjs";
import { compileForm, validateForm, exportHtml } from "../ui/index.mjs";
import { AgentServer } from "../agent/index.mjs";
import {
  createReviewSet,
  vote,
  resolve,
  exportDataset,
} from "../review/index.mjs";
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export async function createWorkbench({
  database = ":memory:",
  token,
  demo = false,
  provider,
  pluginConfig,
  onError = console.error,
  timeoutMs = 30000,
} = {}) {
  ensure(
    typeof token === "string" && token.length >= 24,
    "Provide a local access token of at least 24 characters",
  );
  const release = acquireWorkspace(database);
  let store, registry;
  try {
    store = new Store(database);
    store.recover();
    registry = await createRegistry(pluginConfig);
  } catch (error) {
    store?.close();
    release();
    throw error;
  }
  const mode = provider
    ? "injected"
    : demo
      ? "synthetic"
      : process.env.TYPESAFE_API_KEY
        ? "live"
        : "unconfigured";
  const actualProvider =
    provider ??
    (demo
      ? syntheticProvider
      : (request) => createJevProvider({ timeoutMs })(request));
  const agent = new AgentServer({
    store,
    registry,
    provider: actualProvider,
    timeoutMs,
  });
  const activeJobs = new Map();
  let activeRequests = 0;
  if (!store.get("pack", "support-triage")) {
    store.put("pack", "support-triage", examplePack);
    store.put("pack-version", "support-triage:" + examplePack.version, {
      pack: examplePack,
      packId: "support-triage",
      revision: 1,
    });
  }
  const report = (error) => {
    store.event("error", { name: error.name, message: error.message });
    onError(error);
  };
  const formFor = (pack, strict = false) => {
    const saved = store.get("form-layout", pack.id);
    const stale = Boolean(
      saved && saved.data.packFingerprint !== fingerprint(pack.data),
    );
    if (strict && stale)
      throw new Conflict(
        "The policy changed. Review and save the form layout before evaluation.",
      );
    return {
      form: compileForm(pack.data, saved && !stale ? saved.data.layout : {}),
      layout: saved,
      stale,
    };
  };
  const requireObject = (kind, id) => {
    const result = store.get(kind, id);
    if (!result) throw new HttpError(404, `Unknown ${kind}`);
    return result;
  };
  const providerReady = () => {
    if (mode === "unconfigured")
      throw new HttpError(
        409,
        "Set TYPESAFE_API_KEY server-side or restart with --demo",
      );
  };
  function launchBatch({ documentId, packId, mapping, rowIds, maxCalls }) {
    providerReady();
    ensure(activeJobs.size < 2, "Two jobs are already running");
    const document = requireObject("document", documentId),
      pack = requireObject("pack", packId);
    mapping = snapshot(mapping);
    ensure(
      Array.isArray(rowIds) &&
        rowIds.length > 0 &&
        new Set(rowIds).size === rowIds.length &&
        Number.isInteger(maxCalls) &&
        rowIds.length <= maxCalls &&
        maxCalls <= 100,
      "Select unique rows within an explicit budget of 1–100 calls",
    );
    rowIds.forEach((id) => mapState(document.data, id, mapping));
    const id = randomUUID(),
      controller = new AbortController();
    let saved = store.put("job", id, {
      status: "running",
      documentId,
      packId,
      packRevision: pack.revision,
      pack: pack.data,
      mapping,
      rowIds,
      maxCalls,
      results: [],
      mode,
    });
    activeJobs.set(id, controller);
    const work = (async () => {
      try {
        const result = await evaluateRows(
          {
            document: document.data,
            mapping,
            pack: pack.data,
            rowIds,
            maxCalls,
          },
          {
            provider: actualProvider,
            timeoutMs,
            signal: controller.signal,
            onRow: async (row) => {
              if (row.status === "failed") report(new Error(row.error));
              const current = requireObject("job", id);
              store.put(
                "job",
                id,
                { ...current.data, results: [...current.data.results, row] },
                current.revision,
              );
            },
          },
        );
        const current = requireObject("job", id);
        store.put(
          "job",
          id,
          {
            ...current.data,
            status: result.failures ? "completed_with_errors" : "completed",
            calls: result.calls,
          },
          current.revision,
        );
      } catch (error) {
        report(error);
        const current = requireObject("job", id);
        store.put(
          "job",
          id,
          {
            ...current.data,
            status: controller.signal.aborted ? "cancelled" : "failed",
            error: error.message,
          },
          current.revision,
        );
      } finally {
        activeJobs.delete(id);
      }
    })();
    controller.work = work;
    return saved;
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "no-referrer");
    res.setHeader("cache-control", "no-store");
    const send = (status, value, type = "application/json") => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status, { "content-type": type });
      res.end(type === "application/json" ? JSON.stringify(value) : value);
    };
    let counted = false;
    try {
      const host = req.headers.host ?? "",
        port = server.address()?.port;
      if (
        ![`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(
          host,
        )
      )
        throw new HttpError(
          403,
          "This local server accepts loopback hosts only",
        );
      const path = new URL(req.url, `http://${host}`).pathname;
      if (!path.startsWith("/api/")) {
        if (req.method !== "GET")
          throw new HttpError(405, "Method not allowed");
        const assets = {
          "/": "index.html",
          "/app.js": "app.js",
          "/review": "review.html",
          "/review.js": "review.js",
          "/styles.css": "styles.css",
        };
        const file = assets[path];
        if (!file) throw new HttpError(404, "Not found");
        res.setHeader(
          "content-security-policy",
          "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
        );
        send(
          200,
          await readFile(new URL("../../web/" + file, import.meta.url), "utf8"),
          file.endsWith(".js")
            ? "text/javascript"
            : file.endsWith(".css")
              ? "text/css"
              : "text/html",
        );
        return;
      }
      const origin = req.headers.origin;
      if (origin && origin !== `http://${host}`)
        throw new HttpError(403, "Cross-origin API requests are not allowed");
      const provided = Buffer.from(req.headers.authorization ?? ""),
        expected = Buffer.from("Bearer " + token);
      if (
        provided.length !== expected.length ||
        !timingSafeEqual(provided, expected)
      )
        throw new HttpError(401, "Local access token required");
      if (activeRequests >= 8) throw new HttpError(429, "Server busy");
      activeRequests++;
      counted = true;
      let body = {};
      if (req.method === "POST") {
        if (!req.headers["content-type"]?.startsWith("application/json"))
          throw new HttpError(415, "Send application/json");
        let bytes = 0;
        const chunks = [];
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 5_000_000)
            throw new HttpError(413, "Request exceeds 5 MB");
          chunks.push(chunk);
        }
        try {
          body = snapshot(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch {
          throw new HttpError(400, "Invalid JSON body");
        }
        if (!body || typeof body !== "object" || Array.isArray(body))
          throw new HttpError(400, "Body must be an object");
      }
      if (req.method === "GET" && path === "/api/workspace") {
        send(200, {
          mode,
          packs: store.list("pack"),
          forms: store
            .list("pack")
            .map((pack) => ({ packId: pack.id, ...formFor(pack) })),
          documents: store.list("document").map((d) => ({
            id: d.id,
            revision: d.revision,
            updated: d.updated,
            source: d.data.source,
            count: d.data.rows.length,
            fields: Object.keys(d.data.rows[0].fields),
          })),
          jobs: store
            .list("job")
            .slice(0, 30)
            .map((j) => ({
              ...j,
              data: {
                ...j.data,
                results: undefined,
                processed: j.data.results.length,
              },
            })),
          runs: store.list("run").slice(0, 30),
          plugins: registry.list(),
          experiments: store.list("experiment").slice(0, 10),
        });
        return;
      }
      if (req.method === "GET" && path === "/api/review-sets") {
        send(200, store.list("review-set"));
        return;
      }
      if (req.method === "POST" && path === "/api/review-sets") {
        let pack, rows;
        if (body.jobId) {
          const job = requireObject("job", body.jobId);
          ensure(!activeJobs.has(job.id), "Wait for the batch to finish");
          pack = job.data.pack;
          rows = job.data.results.filter((r) => r.status === "succeeded");
        } else {
          pack = body.trace?.pack;
          rows = body.trace?.rows;
        }
        send(
          201,
          store.create(
            "review-set",
            createReviewSet({ name: body.name, pack, rows }),
          ),
        );
        return;
      }
      if (
        req.method === "POST" &&
        ["/api/review-vote", "/api/review-resolve"].includes(path)
      ) {
        const set = requireObject("review-set", body.id);
        if (set.revision !== body.revision) throw new Conflict();
        const updated = (path.endsWith("-vote") ? vote : resolve)(
          set.data,
          body,
        );
        send(200, store.put("review-set", set.id, updated, set.revision));
        return;
      }
      if (req.method === "POST" && path === "/api/review-export") {
        const set = requireObject("review-set", body.id);
        if (set.revision !== body.revision) throw new Conflict();
        const dataset = exportDataset(set.data, body);
        // Prevent the same state entering both tuning and holdout exports, even across review sets.
        for (const row of dataset.cases) {
          const previous = store.get("dataset-split", fingerprint(row.state));
          ensure(
            !previous || previous.data.split === dataset.split,
            "This state was already exported in another split",
          );
        }
        for (const row of dataset.cases) {
          const id = fingerprint(row.state);
          if (!store.get("dataset-split", id))
            store.put("dataset-split", id, { split: dataset.split });
        }
        store.put(
          "dataset",
          dataset.fingerprint,
          dataset,
          store.get("dataset", dataset.fingerprint)?.revision ?? 0,
        );
        send(200, dataset);
        return;
      }
      if (req.method === "GET" && path === "/api/example") {
        send(200, { pack: examplePack, csv: exampleCsv });
        return;
      }
      if (
        req.method === "GET" &&
        /^\/api\/(document|job|run)\/[^/]+$/.test(path)
      ) {
        const [, , kind, id] = path.split("/");
        send(200, requireObject(kind, decodeURIComponent(id)));
        return;
      }
      if (req.method === "GET" && path === "/api/events") {
        send(200, store.events());
        return;
      }
      if (req.method === "POST" && path === "/api/import") {
        const document = await registry.execute("statebridge.extract", body, {
          timeoutMs: 20000,
        });
        send(201, store.create("document", document));
        return;
      }
      if (req.method === "POST" && path === "/api/map") {
        send(
          200,
          mapState(
            requireObject("document", body.documentId).data,
            body.rowId,
            body.mapping,
          ),
        );
        return;
      }
      if (req.method === "POST" && path === "/api/pack") {
        validatePack(body.pack);
        ensure(/^[a-zA-Z0-9_-]{1,100}$/.test(body.id), "Invalid pack id");
        const previous = store.get("pack", body.id);
        if (previous && fingerprint(previous.data) !== fingerprint(body.pack))
          ensure(
            previous.data.version !== body.pack.version,
            "Change the semantic version when editing a pack",
          );
        const versionId = body.id + ":" + body.pack.version,
          version = store.get("pack-version", versionId);
        if (
          version &&
          fingerprint(version.data.pack) !== fingerprint(body.pack)
        )
          throw new Conflict(
            "This semantic version already identifies another policy",
          );
        const result = store.put(
          "pack",
          body.id,
          body.pack,
          body.revision ?? 0,
        );
        if (!version)
          store.put("pack-version", versionId, {
            pack: body.pack,
            packId: body.id,
            revision: result.revision,
          });
        send(200, result);
        return;
      }
      if (req.method === "POST" && path === "/api/evaluate") {
        providerReady();
        const pack = requireObject("pack", body.packId);
        const state = validateForm(
          body.formRevision === undefined
            ? compileForm(pack.data)
            : formFor(pack, true).form,
          body.state,
        );
        if (
          body.formRevision !== undefined &&
          (store.get("form-layout", pack.id)?.revision ?? 0) !==
            body.formRevision
        )
          throw new Conflict("Form layout changed. Reload before evaluating.");
        const decision = await evaluate(pack.data, state, {
          provider: actualProvider,
          timeoutMs,
        });
        send(200, store.create("decision", { state, record: decision, mode }));
        return;
      }
      if (req.method === "POST" && path === "/api/jobs") {
        send(202, launchBatch(body));
        return;
      }
      if (req.method === "POST" && path === "/api/jobs/cancel") {
        const controller = activeJobs.get(body.id);
        ensure(controller, "Job is not active");
        controller.abort(new Error("Cancelled by operator"));
        send(200, { status: "cancelling" });
        return;
      }
      if (req.method === "POST" && path === "/api/review") {
        const job = requireObject("job", body.jobId);
        if (job.revision !== body.revision) throw new Conflict();
        ensure(
          !activeJobs.has(job.id),
          "Wait for the batch to finish before reviewing",
        );
        const row = job.data.results.find((r) => r.rowId === body.rowId);
        ensure(
          row?.status === "succeeded",
          "Only successful judgments can be reviewed",
        );
        const allowed = new Set([
          ...job.data.pack.rules.map((r) => r.outcome),
          job.data.pack.fallback,
        ]);
        ensure(allowed.has(body.outcome), "Unknown review outcome");
        const review = {
          outcome: body.outcome,
          note: String(body.note ?? "").slice(0, 2000),
          actor: "local-operator",
          at: new Date().toISOString(),
        };
        const result = store.put(
          "job",
          job.id,
          {
            ...job.data,
            results: job.data.results.map((r) =>
              r.rowId === body.rowId ? { ...r, review } : r,
            ),
          },
          job.revision,
        );
        store.event("decision.reviewed", {
          jobId: job.id,
          rowId: body.rowId,
          review,
        });
        send(200, result);
        return;
      }
      if (req.method === "POST" && path === "/api/replay") {
        const job = requireObject("job", body.jobId);
        validatePack(body.pack);
        send(
          200,
          replay(
            body.pack,
            job.data.results
              .filter((r) => r.status === "succeeded")
              .map((r) => ({ record: r.record, state: r.state })),
          ),
        );
        return;
      }
      if (req.method === "POST" && path === "/api/export/csv") {
        send(
          200,
          exportCsv(requireObject("job", body.jobId).data.results),
          "text/csv",
        );
        return;
      }
      if (req.method === "POST" && path === "/api/form-layout") {
        const pack = requireObject("pack", body.packId);
        if (body.packRevision !== pack.revision)
          throw new Conflict("Policy changed. Reload before saving the form.");
        const form = compileForm(pack.data, body.layout);
        const saved = store.put(
          "form-layout",
          pack.id,
          {
            layout: {
              title: form.title,
              description: form.description,
              fields: form.fields,
            },
            packFingerprint: fingerprint(pack.data),
          },
          body.revision ?? 0,
        );
        send(200, saved);
        return;
      }
      if (req.method === "POST" && path === "/api/form-preview") {
        const pack = requireObject("pack", body.packId);
        send(200, { form: compileForm(pack.data, body.layout) });
        return;
      }
      if (req.method === "POST" && path === "/api/form") {
        const result = formFor(requireObject("pack", body.packId), true);
        send(200, { ...result, html: exportHtml(result.form) });
        return;
      }
      if (req.method === "POST" && path === "/api/experiment") {
        providerReady();
        ensure(
          (body.spec?.maxEvaluations ?? 1000) <= 100,
          "Workbench experiments are limited to 100 predictions",
        );
        const result = await bounded(
          (signal) =>
            experiment(body.spec, {
              predictor: createJevPredictor({ provider: actualProvider }),
              timeoutMs,
              signal,
            }),
          { timeoutMs: 90000 },
        );
        send(200, store.create("experiment", { ...result, mode }));
        return;
      }
      if (req.method === "POST" && path === "/api/plugins/execute") {
        ensure(
          registry.plugins.get(body.id)?.manifest.kind !== "action",
          "Action plugins require a reviewed agent run",
        );
        const result = await registry.execute(body.id, body.input, {
          timeoutMs: 10000,
        });
        send(200, { result });
        return;
      }
      if (req.method === "POST" && path === "/api/runs") {
        providerReady();
        const pack = requireObject("pack", body.packId);
        send(201, await agent.start({ ...body, pack: pack.data }));
        return;
      }
      if (req.method === "POST" && path === "/api/runs/approve") {
        const result = await agent.approve(body.id, body.revision);
        if (result.data.status === "uncertain")
          report(new Error(result.data.error));
        send(200, result);
        return;
      }
      if (req.method === "POST" && path === "/api/runs/reject") {
        send(200, agent.reject(body.id, body.revision));
        return;
      }
      if (req.method === "POST" && path === "/api/runs/replay") {
        send(200, await agent.replay(body.id));
        return;
      }
      throw new HttpError(404, "Unknown API route");
    } catch (error) {
      if (!error.status) report(error);
      send(error.status ?? 400, { error: error.message });
    } finally {
      if (counted) activeRequests--;
    }
  });
  server.requestTimeout = 120000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 1000;
  return {
    server,
    store,
    registry,
    agent,
    mode,
    async close() {
      for (const c of activeJobs.values())
        c.abort(new Error("Server shutting down"));
      await Promise.all([...activeJobs.values()].map((c) => c.work));
      await new Promise((resolve) => server.close(resolve));
      server.closeAllConnections();
      store.close();
      release();
    },
  };
}
