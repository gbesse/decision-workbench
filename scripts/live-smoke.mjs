// Purpose: Exercise all six modules against real Jev with at most six provider calls and no external action writes.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { createJevProvider } from "@gbesse/decisionpacks";
import { createWorkbench } from "../packages/studio/server.mjs";

const key = process.env.TYPESAFE_API_KEY;
if (!key?.trim())
  throw new Error(
    "Set TYPESAFE_API_KEY or fill .local/jev.env before running this opt-in live check.",
  );
const redact = (message) => String(message).replaceAll(key, "[REDACTED]");
const maxCalls = 6;
let calls = 0;
const provider = createJevProvider({ timeoutMs: 30000 });
const token = randomBytes(32).toString("hex");
const errors = [];
const started = performance.now();
const app = await createWorkbench({
  token,
  // Count at the provider boundary: local replays must not consume the remaining budget.
  provider: (request) => {
    assert.ok(calls < maxCalls, "Live smoke call budget exhausted");
    calls++;
    return provider(request);
  },
  onError: (error) => {
    errors.push(redact(error.message));
    console.error("Workbench live check:", redact(error.message));
  },
});
try {
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const base = `http://127.0.0.1:${app.server.address().port}/api/`;
  const call = async (path, body) => {
    const response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(95000),
    });
    const value = await response.json();
    if (!response.ok) throw new Error(`${path}: ${redact(value.error)}`);
    return value;
  };
  const packId = "support-triage";
  const workspace = await call("workspace");
  const pack = workspace.packs.find((p) => p.id === packId).data;
  const form = await call("form", { packId });
  assert.equal(form.form.fields[0].name, "text");
  const savedForm = await call("form-layout", {
    packId,
    packRevision: workspace.packs.find((p) => p.id === packId).revision,
    revision: 0,
    layout: {
      title: "Live custom form",
      fields: [
        {
          name: "text",
          label: "Request",
          control: "select",
          options: ["Please refund this duplicate invoice."],
        },
      ],
    },
  });
  const evaluated = await call("evaluate", {
    formRevision: savedForm.revision,
    packId,
    state: { text: "Please refund this duplicate invoice." },
  });
  assert.equal(evaluated.data.record.model, pack.model);

  const document = await call("import", {
    name: "live-smoke-fixtures.csv",
    format: "csv",
    content:
      'text\n"The API crashes when I log in."\n"I need pricing for twenty seats."',
  });
  const mapping = { text: { source: "text", type: "string" } };
  const mapped = await call("map", {
    documentId: document.id,
    rowId: "1",
    mapping,
  });
  assert.ok(mapped.evidence.text.sourceId);
  let job = await call("jobs", {
    documentId: document.id,
    packId,
    mapping,
    rowIds: ["1", "2"],
    maxCalls: 2,
  });
  const pollDeadline = performance.now() + 70000;
  while (job.data.status === "running") {
    assert.ok(
      performance.now() < pollDeadline,
      "Batch polling deadline exceeded",
    );
    await delay(200);
    job = await call("job/" + job.id);
  }
  assert.equal(job.data.status, "completed");
  assert.equal(job.data.results.length, 2);
  const reviewed = await call("review", {
    jobId: job.id,
    revision: job.revision,
    rowId: "1",
    outcome: pack.fallback,
    note: "Live smoke: verify human correction storage.",
  });
  assert.equal(reviewed.data.results[0].review.outcome, pack.fallback);
  const beforeReplay = calls;
  const replayed = await call("replay", { jobId: job.id, pack });
  assert.equal(replayed.length, 2);
  assert.equal(calls, beforeReplay);

  // Every finite outcome maps to a local annotation so correctness never depends on an assumed prediction.
  const routes = Object.fromEntries(
    form.form.outcomes.map((outcome) => [
      outcome,
      {
        steps: [
          {
            id: "prepare",
            plugin: "annotation.prepare",
            bindings: { queue: { value: outcome }, text: { state: "text" } },
          },
          {
            id: "followup",
            plugin: "annotation.prepare",
            bindings: {
              queue: { value: "followup" },
              text: { step: "prepare", path: "/annotation/text" },
            },
          },
        ],
      },
    ]),
  );
  const run = await call("runs", {
    requestId: "live-smoke-action",
    packId,
    state: { text: "Refund this duplicate charge." },
    routes,
  });
  assert.equal(run.data.status, "awaiting_review");
  const first = await call("runs/approve", {
    id: run.id,
    revision: run.revision,
  });
  assert.equal(first.data.status, "awaiting_review");
  const completed = await call("runs/approve", {
    id: run.id,
    revision: first.revision,
  });
  assert.equal(completed.data.status, "completed");
  assert.equal(completed.data.steps.length, 2);
  assert.equal(completed.data.result.execution, "local_result_only");
  const beforeActionReplay = calls;
  assert.equal((await call("runs/replay", { id: run.id })).reproduced, true);
  assert.equal(calls, beforeActionReplay);
  const transformed = await call("plugins/execute", {
    id: "text.normalize",
    input: { text: "  A   document  " },
  });
  assert.equal(transformed.result.text, "A document");

  const experiment = await call("experiment", {
    spec: {
      model: pack.model,
      maxEvaluations: 2,
      candidates: [
        {
          id: "live-contract",
          instructions: "Which department handles the request in state.text?",
          criteria: {
            billing: "Invoices and refunds",
            technical: "Software bugs",
            sales: "Pricing inquiries",
          },
        },
      ],
      development: [
        { id: "dev", text: "Refund the invoice", label: "billing" },
      ],
      heldout: [
        {
          id: "heldout",
          text: "What is the price for twenty seats?",
          label: "sales",
        },
      ],
    },
  });
  assert.equal(experiment.data.calls, 2);
  assert.equal(calls, maxCalls);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        live: true,
        model: pack.model,
        providerCalls: calls,
        customizedForm: true,
        actionSteps: completed.data.steps.length,
        formOutcome: evaluated.data.record.outcome,
        batchOutcomes: job.data.results.map((row) => row.record.outcome),
        agentOutcome: run.data.decision.outcome,
        actionReplay: true,
        ruleReplay: true,
        questionForgeCalls: experiment.data.calls,
        externalActionWrites: 0,
        elapsedMs: Math.round(performance.now() - started),
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error("Live smoke failed:", redact(error.message));
  process.exitCode = 1;
} finally {
  await app.close();
}
