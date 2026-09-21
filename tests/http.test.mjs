// Purpose: Exercise the authenticated server across source import, sheets, review, replay, form and agent APIs.
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createWorkbench } from "../packages/studio/server.mjs";
import { exampleCsv } from "../packages/studio/fixtures.mjs";
const token = "test-local-operator-token-at-least-24-chars";
async function host(t, options = {}) {
  const errors = [];
  const app = await createWorkbench({
    token,
    demo: true,
    onError: (error) => errors.push(error),
    ...options,
  });
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const url = `http://127.0.0.1:${app.server.address().port}`;
  t.after(() => app.close());
  const call = async (path, body, headers = {}) => {
    const r = await fetch(url + "/api/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization: "Bearer " + token,
        "content-type": "application/json",
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10000),
    });
    return { status: r.status, body: await r.json() };
  };
  return { app, url, call, errors };
}
test("API requires authentication, rejects foreign origins and serves a protected static shell", async (t) => {
  const { url, call } = await host(t);
  assert.equal(
    (await call("workspace", undefined, { authorization: "wrong" })).status,
    401,
  );
  assert.equal(
    (await call("workspace", undefined, { origin: "https://evil.example" }))
      .status,
    403,
  );
  assert.equal((await call("workspace")).body.mode, "synthetic");
  const page = await fetch(url, { signal: AbortSignal.timeout(1000) });
  assert.match(
    page.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  assert.match(await page.text(), /Decision Workbench/);
});
test("complete import → batch → human correction → rule replay remains durable and traceable", async (t) => {
  const { call, app } = await host(t);
  const doc = (
    await call("import", {
      name: "tickets.csv",
      format: "csv",
      content: exampleCsv,
    })
  ).body;
  assert.equal(doc.data.rows.length, 4);
  const mapping = { text: { source: "text", type: "string" } };
  const job = (
    await call("jobs", {
      documentId: doc.id,
      packId: "support-triage",
      mapping,
      rowIds: ["1", "2", "3", "4"],
      maxCalls: 4,
    })
  ).body;
  let result;
  for (let i = 0; i < 100; i++) {
    result = (await call("job/" + job.id)).body;
    if (result.data.status !== "running") break;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.equal(result.data.status, "completed");
  assert.equal(result.data.results[0].record.outcome, "billing");
  assert.equal(result.data.results[3].record.outcome, "review");
  const corrected = await call("review", {
    jobId: job.id,
    revision: result.revision,
    rowId: "1",
    outcome: "review",
    note: "Human fixture correction",
  });
  assert.equal(corrected.body.data.results[0].review.outcome, "review");
  assert.equal(corrected.body.data.results[0].record.outcome, "billing");
  assert.equal(
    (
      await call("review", {
        jobId: job.id,
        revision: result.revision,
        rowId: "1",
        outcome: "billing",
      })
    ).status,
    409,
  );
  const pack = structuredClone(app.store.get("pack", "support-triage").data);
  pack.rules.forEach((r) => (r.all[1].value = 0.99));
  const replay = (await call("replay", { jobId: job.id, pack })).body;
  assert.equal(replay.filter((r) => r.changed).length, 3);
  assert.equal(
    (await call("form", { packId: "support-triage" })).body.form.fields[0].name,
    "text",
  );
});
test("policy edits require a new version and stale writes are rejected", async (t) => {
  const { app, call } = await host(t),
    saved = app.store.get("pack", "support-triage"),
    pack = structuredClone(saved.data);
  pack.fallback = "manual";
  assert.equal(
    (await call("pack", { id: saved.id, revision: saved.revision, pack }))
      .status,
    400,
  );
  pack.version = "0.2.0";
  assert.equal(
    (await call("pack", { id: saved.id, revision: saved.revision, pack }))
      .status,
    200,
  );
  pack.version = "0.3.0";
  assert.equal(
    (await call("pack", { id: saved.id, revision: saved.revision, pack }))
      .status,
    409,
  );
});
test("action execution is only available through an approved JSON run", async (t) => {
  const { call } = await host(t);
  assert.equal(
    (
      await call("plugins/execute", {
        id: "annotation.prepare",
        input: { queue: "x", text: "x" },
      })
    ).status,
    400,
  );
  const run = (
    await call("runs", {
      requestId: "agent-test",
      packId: "support-triage",
      state: { text: "Refund this charge" },
      routes: {
        billing: {
          plugin: "annotation.prepare",
          bindings: { queue: { value: "billing" }, text: { state: "text" } },
        },
      },
    })
  ).body;
  assert.equal(run.data.status, "awaiting_review");
  const approved = (
    await call("runs/approve", { id: run.id, revision: run.revision })
  ).body;
  assert.equal(approved.data.result.annotation.queue, "billing");
  assert.equal(
    (await call("runs/replay", { id: run.id })).body.reproduced,
    true,
  );
});
test("Question Forge is wired through the same provider with development and held-out sets", async (t) => {
  const { call } = await host(t);
  const spec = {
    model: "jev-1.13.0",
    maxEvaluations: 3,
    candidates: [
      {
        id: "one",
        instructions: "Classify the request",
        criteria: { billing: "Charges", technical: "Bugs", sales: "Prices" },
      },
    ],
    development: [{ id: "a", text: "Refund the invoice", label: "billing" }],
    heldout: [{ id: "b", text: "What is the price?", label: "sales" }],
  };
  const result = await call("experiment", { spec });
  assert.equal(result.status, 200);
  assert.equal(result.body.data.calls, 2);
  assert.equal(result.body.data.heldout.accuracy, 1);
});
test("semantic pack versions are immutable even after switching to another version", async (t) => {
  const { app, call } = await host(t),
    initial = app.store.get("pack", "support-triage"),
    pack = structuredClone(initial.data);
  pack.version = "0.2.0";
  pack.fallback = "manual";
  const saved = (
    await call("pack", { id: initial.id, revision: initial.revision, pack })
  ).body;
  pack.version = "0.1.0";
  assert.equal(
    (await call("pack", { id: initial.id, revision: saved.revision, pack }))
      .status,
    409,
  );
});
test("a failed provider is visible as a failed row and an error event, not a fallback outcome", async (t) => {
  const { call, errors } = await host(t, {
    provider: async () => {
      throw Error("Synthetic outage");
    },
  });
  const doc = (
    await call("import", {
      name: "row.json",
      format: "json",
      content: '{"text":"x"}',
    })
  ).body;
  let job = (
    await call("jobs", {
      documentId: doc.id,
      packId: "support-triage",
      mapping: { text: { source: "text", type: "string" } },
      rowIds: ["1"],
      maxCalls: 1,
    })
  ).body;
  for (let i = 0; i < 50 && job.data.status === "running"; i++) {
    await new Promise((r) => setTimeout(r, 10));
    job = (await call("job/" + job.id)).body;
  }
  assert.equal(job.data.status, "completed_with_errors");
  assert.equal(job.data.results[0].record, undefined);
  assert.match(job.data.results[0].error, /outage/);
  assert.ok(errors.length);
  assert.ok((await call("events")).body.some((e) => e.type === "error"));
});

test("a failed reviewed action stays uncertain and reaches the host error reporter", async (t) => {
  const { call, errors } = await host(t);
  const run = (
    await call("runs", {
      requestId: "bad-action",
      packId: "support-triage",
      state: { text: "Refund the invoice" },
      routes: {
        billing: {
          plugin: "annotation.prepare",
          bindings: { queue: { value: 42 }, text: { state: "text" } },
        },
      },
    })
  ).body;
  const result = await call("runs/approve", {
    id: run.id,
    revision: run.revision,
  });
  assert.equal(result.body.data.status, "uncertain");
  assert.match(result.body.data.error, /Plugin input/);
  assert.ok(errors.some((e) => /Plugin input/.test(e.message)));
  assert.equal(
    (await call("runs/approve", { id: run.id, revision: result.body.revision }))
      .status,
    400,
  );
});
test("a non-responsive provider cannot hold an evaluation beyond its configured deadline", async (t) => {
  const { call, errors } = await host(t, {
    provider: () => new Promise(() => {}),
    timeoutMs: 30,
  });
  const result = await call("evaluate", {
    packId: "support-triage",
    state: { text: "Refund" },
  });
  assert.equal(result.status, 400);
  assert.ok(result.body.error);
  assert.equal(errors.length, 1);
});
