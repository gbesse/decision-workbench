// Purpose: Verify persistent concurrency, worker isolation, data provenance, review boundaries and finite form generation.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, Conflict } from "../packages/core/store.mjs";
import { createRegistry } from "../packages/studio/registry.mjs";
import {
  PluginRegistry,
  approveLocalPlugin,
} from "../packages/plugins/index.mjs";
import { extract, mapState } from "../packages/statebridge/index.mjs";
import {
  compileForm,
  validateForm,
  exportHtml,
} from "../packages/ui/index.mjs";
import { evaluateRows, exportCsv } from "../packages/sheets/index.mjs";
import { AgentServer } from "../packages/agent/index.mjs";
import {
  examplePack,
  exampleCsv,
  syntheticProvider,
} from "../packages/studio/fixtures.mjs";
async function temporary(t) {
  const dir = await mkdtemp(join(tmpdir(), "decision-workbench-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
test("SQLite compare-and-swap works across independent connections and survives reopening", async (t) => {
  const path = join(await temporary(t), "workspace.sqlite"),
    a = new Store(path),
    b = new Store(path);
  a.put("pack", "a", { version: 1 });
  assert.throws(() => b.put("pack", "a", { version: 2 }, 0), Conflict);
  b.put("pack", "a", { version: 2 }, 1);
  a.close();
  b.close();
  const c = new Store(path);
  assert.equal(c.get("pack", "a").data.version, 2);
  assert.equal(c.events().length, 2);
  c.close();
});
test("recovery marks interrupted jobs and uncertain actions without replaying them", () => {
  const s = new Store();
  s.put("job", "j", { status: "running" });
  s.put("run", "r", { status: "executing" });
  s.recover();
  assert.equal(s.get("job", "j").data.status, "interrupted");
  assert.equal(s.get("run", "r").data.status, "uncertain");
  s.close();
});
test("CSV quotes and multiline fields retain logical record and source line provenance", async () => {
  const doc = await extract({
    name: "tickets.csv",
    format: "csv",
    content: 'text,amount\n"a, b\nnext line",12.50\n',
  });
  assert.equal(doc.rows[0].fields.text, "a, b\nnext line");
  assert.equal(doc.rows[0].evidence.text.endLine, 3);
  const mapped = mapState(doc, "1", {
    price: { source: "amount", type: "number" },
  });
  assert.equal(mapped.state.price, 12.5);
  assert.equal(mapped.evidence.price.column, "amount");
});
test("malformed or ambiguous imports and coercions fail explicitly", async () => {
  await assert.rejects(
    extract({ name: "a.csv", format: "csv", content: "text,text\na,b" }),
    /unique/,
  );
  await assert.rejects(
    extract({ name: "a.json", format: "json", content: '{"__proto__":true}' }),
    /field/,
  );
  const doc = await extract({
    name: "a.json",
    format: "json",
    content: '{"flag":"yes","value":""}',
  });
  assert.throws(
    () => mapState(doc, "1", { flag: { source: "flag", type: "boolean" } }),
    /Boolean/,
  );
  assert.throws(
    () => mapState(doc, "1", { v: { source: "value", type: "number" } }),
    /Missing/,
  );
});
test("HTML source spans skip executable content and JSON keys retain escaped pointers", async () => {
  const doc = await extract({
    name: "a.html",
    format: "html",
    content: "<p>Hello &amp; world</p><script>steal()</script>",
  });
  assert.equal(doc.rows[0].fields.text, "Hello & world");
  assert.ok(doc.rows[0].evidence.text.segments[0].start >= 0);
  const j = await extract({
    name: "a.json",
    format: "json",
    content: '[{"a/b":true}]',
  });
  assert.equal(j.rows[0].evidence["a/b"].pointer, "/0/a~1b");
});
test("plain email extracts body while unsupported MIME fails", async () => {
  const doc = await extract({
    name: "a.eml",
    format: "email",
    content: "Subject: Billing\r\nFrom: a@example.invalid\r\n\r\nRefund please",
  });
  assert.equal(doc.rows[0].fields.text, "Refund please");
  assert.equal(doc.rows[0].fields.subject, "Billing");
  await assert.rejects(
    extract({
      name: "a.eml",
      format: "email",
      content: "Content-Type: multipart/mixed\n\nparts",
    }),
    /MIME/,
  );
});
test("bundled plugin runs in worker and rejects invalid input", async () => {
  const registry = await createRegistry();
  assert.deepEqual(
    await registry.execute("text.normalize", { text: " a  b\n " }),
    { text: "a b" },
  );
  await assert.rejects(
    registry.execute("text.normalize", { other: "x" }),
    /input/,
  );
});
test("CPU-bound plugins are terminated and changed approved entrypoints are rejected", async (t) => {
  const dir = await temporary(t),
    path = join(dir, "busy.mjs");
  await writeFile(path, "export async function execute(){while(true){}}");
  const registry = new PluginRegistry(),
    manifest = {
      id: "test.busy",
      version: "1.0.0",
      kind: "transform",
      description: "fixture",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
    };
  await approveLocalPlugin(registry, manifest, path);
  await assert.rejects(
    registry.execute("test.busy", {}, { timeoutMs: 50 }),
    /deadline/,
  );
  await writeFile(
    path,
    "export async function execute(){return {changed:true}}",
  );
  await assert.rejects(registry.execute("test.busy", {}), /changed/);
});
test("plugin output schema is enforced", async (t) => {
  const path = join(await temporary(t), "wrong.mjs");
  await writeFile(path, 'export async function execute(){return "wrong"}');
  const registry = new PluginRegistry();
  await approveLocalPlugin(
    registry,
    {
      id: "test.wrong",
      version: "1.0.0",
      kind: "transform",
      description: "fixture",
      inputSchema: { type: "object" },
      outputSchema: { type: "number" },
    },
    path,
  );
  await assert.rejects(registry.execute("test.wrong", {}), /output/);
});
test("finite form contracts validate types and HTML exports escape attacker-controlled names", () => {
  const pack = structuredClone(examplePack);
  pack.inputs = { text: "string", count: "number", accept: "boolean" };
  const form = compileForm(pack);
  assert.deepEqual(validateForm(form, { text: "x", count: 2, accept: false }), {
    text: "x",
    count: 2,
    accept: false,
  });
  assert.throws(
    () => validateForm(form, { text: "x", count: "2", accept: false }),
    /count/,
  );
  pack.name = "</script><img src=x onerror=alert(1)>";
  assert.doesNotMatch(exportHtml(compileForm(pack)), /<img src=x/);
});
test("batch reserves input budget before inference and preserves per-row failures", async () => {
  const document = await extract({
      name: "demo.csv",
      format: "csv",
      content: exampleCsv,
    }),
    mapping = { text: { source: "text", type: "string" } };
  let calls = 0;
  await assert.rejects(
    evaluateRows(
      { document, mapping, pack: examplePack, rowIds: ["1", "2"], maxCalls: 1 },
      {
        provider: () => {
          calls++;
        },
      },
    ),
    /budget/,
  );
  assert.equal(calls, 0);
  const result = await evaluateRows(
    { document, mapping, pack: examplePack, rowIds: ["1", "2"], maxCalls: 2 },
    {
      provider: async (request) => {
        if (++calls === 2) throw Error("fixture outage");
        return syntheticProvider(request);
      },
    },
  );
  assert.equal(result.rows[0].record.outcome, "billing");
  assert.equal(result.rows[1].status, "failed");
  assert.equal(result.failures, 1);
  assert.match(
    exportCsv([{ rowId: "=1+1", status: "failed", error: "=cmd" }]),
    /'=1\+1/,
  );
});
test("agent request identities, approval revisions and offline capsule replay prevent silent duplicate execution", async () => {
  const store = new Store(),
    registry = await createRegistry();
  let calls = 0;
  const agent = new AgentServer({
    store,
    registry,
    provider: async (request) => {
      calls++;
      return syntheticProvider(request);
    },
  });
  const input = {
    requestId: "one",
    pack: examplePack,
    state: { text: "Refund the duplicate charge" },
    routes: {
      billing: {
        plugin: "annotation.prepare",
        bindings: { queue: { value: "billing" }, text: { state: "text" } },
      },
    },
  };
  const run = await agent.start(input);
  assert.equal(run.data.status, "awaiting_review");
  assert.equal((await agent.start(input)).id, run.id);
  assert.equal(calls, 1);
  await assert.rejects(
    agent.start({ ...input, state: { text: "Other" } }),
    /different input/,
  );
  const done = await agent.approve(run.id, run.revision);
  assert.equal(done.data.status, "completed");
  assert.equal(done.data.result.execution, "local_result_only");
  await assert.rejects(agent.approve(run.id, run.revision), Conflict);
  assert.equal((await agent.replay(run.id)).reproduced, true);
  store.close();
});
test("a workspace lease prevents a second running server from claiming recovery", async (t) => {
  const { acquireWorkspace } = await import("../packages/core/lease.mjs");
  const path = join(await temporary(t), "workspace.sqlite");
  const release = acquireWorkspace(path);
  try {
    assert.throws(() => acquireWorkspace(path), /already owns/);
  } finally {
    release();
  }
  const second = acquireWorkspace(path);
  second();
});
test("approved webhook action posts to a real loopback server with the run identity and no duplicate on replay", async (t) => {
  const { createServer } = await import("node:http"),
    { once } = await import("node:events");
  let requests = 0,
    received;
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requests++;
    received = { body: JSON.parse(body), key: req.headers["idempotency-key"] };
    res.writeHead(204);
    res.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const previous = process.env.WORKBENCH_WEBHOOK_URL;
  process.env.WORKBENCH_WEBHOOK_URL = `http://127.0.0.1:${server.address().port}/decision`;
  t.after(() => {
    if (previous === undefined) delete process.env.WORKBENCH_WEBHOOK_URL;
    else process.env.WORKBENCH_WEBHOOK_URL = previous;
  });
  const registry = await createRegistry();
  await approveLocalPlugin(
    registry,
    {
      id: "example.webhook",
      version: "0.1.0",
      kind: "action",
      description: "Loopback fixture",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
    },
    new URL("../examples/external-plugin/webhook-action.mjs", import.meta.url),
  );
  const store = new Store();
  t.after(() => store.close());
  const agent = new AgentServer({
    store,
    registry,
    provider: syntheticProvider,
  });
  const run = await agent.start({
    requestId: "webhook-test",
    pack: examplePack,
    state: { text: "Refund this charge" },
    routes: {
      billing: {
        plugin: "example.webhook",
        bindings: { queue: { value: "billing" }, text: { state: "text" } },
      },
    },
  });
  assert.equal(requests, 0);
  const done = await agent.approve(run.id, run.revision);
  assert.equal(done.data.status, "completed");
  assert.equal(received.key, "webhook-test");
  assert.equal(received.body.queue, "billing");
  await agent.replay(run.id);
  assert.equal(requests, 1);
});

test("form layouts reorder fields, preserve types and enforce enumerated choices", () => {
  const pack = {
    ...examplePack,
    inputs: { text: "string", quantity: "number" },
  };
  const form = compileForm(pack, {
    title: "Order review",
    fields: [
      { name: "quantity", label: "Seats", control: "number" },
      {
        name: "text",
        label: "Request",
        control: "select",
        options: ["Refund", "New order"],
        help: "Select a request",
      },
    ],
  });
  assert.equal(form.fields[0].name, "quantity");
  assert.deepEqual(validateForm(form, { quantity: 3, text: "Refund" }), {
    quantity: 3,
    text: "Refund",
  });
  assert.throws(
    () => validateForm(form, { quantity: 3, text: "Unlisted" }),
    /declared option/,
  );
  assert.throws(
    () => compileForm(pack, { fields: [{ name: "text" }, { name: "text" }] }),
    /exactly once/,
  );
  assert.throws(
    () =>
      compileForm(pack, {
        fields: [{ name: "text" }, { name: "quantity", control: "textarea" }],
      }),
    /incompatible/,
  );
  assert.match(exportHtml(form), /<select/);
  assert.match(exportHtml(form), /Order review/);
});

test("multi-step actions require separate approvals and resolve prior results after reopening storage", async (t) => {
  const path = join(await temporary(t), "sequence.sqlite");
  let store = new Store(path);
  const registry = await createRegistry();
  let calls = 0;
  const provider = async (request) => {
    calls++;
    return syntheticProvider(request);
  };
  let agent = new AgentServer({ store, registry, provider });
  const input = {
    requestId: "sequence",
    pack: examplePack,
    state: { text: "Refund invoice" },
    routes: {
      billing: {
        steps: [
          {
            id: "first",
            plugin: "annotation.prepare",
            bindings: { queue: { value: "billing" }, text: { state: "text" } },
          },
          {
            id: "second",
            plugin: "annotation.prepare",
            bindings: {
              queue: { value: "followup" },
              text: { step: "first", path: "/annotation/text" },
            },
          },
        ],
      },
    },
  };
  const initial = await agent.start(input);
  assert.equal(initial.data.steps.length, 0);
  const first = await agent.approve(initial.id, initial.revision);
  assert.equal(first.data.status, "awaiting_review");
  assert.equal(first.data.steps.length, 1);
  await assert.rejects(
    () => agent.approve(initial.id, initial.revision),
    Conflict,
  );
  store.close();
  store = new Store(path);
  t.after(() => store.close());
  store.recover();
  agent = new AgentServer({ store, registry, provider });
  assert.equal((await agent.start(input)).revision, first.revision);
  const second = await agent.approve(first.id, first.revision);
  assert.equal(second.data.status, "completed");
  assert.equal(second.data.steps.length, 2);
  assert.equal(second.data.result.annotation.text, "Refund invoice");
  const replay = await agent.replay(second.id);
  assert.equal(replay.reproduced, true);
  assert.equal(replay.consumedEvents, 2);
  assert.equal(calls, 1);
});

test("invalid sequence references fail before inference and an action pin change blocks approval", async (t) => {
  const store = new Store();
  t.after(() => store.close());
  const registry = await createRegistry();
  let calls = 0;
  const agent = new AgentServer({
    store,
    registry,
    provider: async (request) => {
      calls++;
      return syntheticProvider(request);
    },
  });
  const input = {
    requestId: "pin-check",
    pack: examplePack,
    state: { text: "Refund" },
    routes: {
      billing: {
        steps: [
          {
            id: "first",
            plugin: "annotation.prepare",
            bindings: {
              queue: { value: "billing" },
              text: { step: "later", path: "/text" },
            },
          },
        ],
      },
    },
  };
  await assert.rejects(() => agent.start(input), /earlier step/);
  assert.equal(calls, 0);
  input.routes.billing.steps[0].bindings.text = { state: "text" };
  const run = await agent.start(input);
  registry.plugins.get("annotation.prepare").digest = "changed";
  await assert.rejects(
    () => agent.approve(run.id, run.revision),
    /plugin changed/,
  );
  assert.equal(store.get("run", run.id).data.status, "awaiting_review");
});

test("a failed second step preserves the successful prefix and cannot be approved again", async (t) => {
  const store = new Store();
  t.after(() => store.close());
  const registry = await createRegistry(),
    agent = new AgentServer({ store, registry, provider: syntheticProvider });
  const run = await agent.start({
    requestId: "failed-second",
    pack: examplePack,
    state: { text: "Refund" },
    routes: {
      billing: {
        steps: [
          {
            id: "first",
            plugin: "annotation.prepare",
            bindings: { queue: { value: "ok" }, text: { state: "text" } },
          },
          {
            id: "second",
            plugin: "annotation.prepare",
            bindings: { queue: { value: 42 }, text: { state: "text" } },
          },
        ],
      },
    },
  });
  const first = await agent.approve(run.id, run.revision),
    failed = await agent.approve(run.id, first.revision);
  assert.equal(failed.data.status, "uncertain");
  assert.equal(failed.data.steps[0].status, "completed");
  assert.equal(failed.data.steps[1].status, "uncertain");
  await assert.rejects(
    () => agent.approve(run.id, failed.revision),
    /not awaiting/,
  );
  assert.equal((await agent.replay(run.id)).reproduced, true);
});

test("legacy persisted single-action request identities remain readable after sequence support", async (t) => {
  const { fingerprint } = await import("@gbesse/decisionpacks");
  const store = new Store();
  t.after(() => store.close());
  const registry = await createRegistry();
  const input = {
    requestId: "legacy",
    pack: examplePack,
    state: { text: "Refund" },
    routes: {
      billing: {
        plugin: "annotation.prepare",
        bindings: { queue: { value: "billing" }, text: { state: "text" } },
      },
    },
  };
  const { requestId, ...request } = input;
  store.put("run", requestId, {
    ...request,
    status: "completed",
    requestFingerprint: fingerprint(request),
  });
  const agent = new AgentServer({
    store,
    registry,
    provider: () => {
      throw Error("Existing requests must not call provider");
    },
  });
  assert.equal((await agent.start(input)).data.status, "completed");
});
