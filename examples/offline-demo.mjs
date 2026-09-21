// Purpose: Run all six modules together with synthetic decisions, an imported dataset and a reviewed action.
import { Store } from "../packages/core/store.mjs";
import { createRegistry } from "../packages/studio/registry.mjs";
import {
  examplePack,
  exampleCsv,
  syntheticProvider,
} from "../packages/studio/fixtures.mjs";
import { evaluateRows } from "../packages/sheets/index.mjs";
import { compileForm } from "../packages/ui/index.mjs";
import { AgentServer } from "../packages/agent/index.mjs";
import { replay } from "@gbesse/decisionpacks";
const registry = await createRegistry(),
  store = new Store();
try {
  const document = await registry.execute("statebridge.extract", {
    name: "tickets.csv",
    format: "csv",
    content: exampleCsv,
  });
  const result = await evaluateRows(
    {
      document,
      mapping: { text: { source: "text", type: "string" } },
      pack: examplePack,
      rowIds: document.rows.map((r) => r.id),
      maxCalls: 4,
    },
    { provider: syntheticProvider },
  );
  const next = structuredClone(examplePack);
  next.rules.forEach((r) => (r.all[1].value = 0.99));
  const changes = replay(
    next,
    result.rows.map((r) => ({ record: r.record, state: r.state })),
  );
  const agent = new AgentServer({
    store,
    registry,
    provider: syntheticProvider,
  });
  const run = await agent.start({
    requestId: "demo",
    pack: examplePack,
    state: { text: "Refund a duplicate invoice" },
    routes: {
      billing: {
        plugin: "annotation.prepare",
        bindings: { queue: { value: "billing" }, text: { state: "text" } },
      },
    },
  });
  const completed = await agent.approve(run.id, run.revision);
  console.log(
    JSON.stringify(
      {
        synthetic: true,
        modules: [
          "studio",
          "statebridge",
          "sheets",
          "ui-builder",
          "json-agents",
          "plugins",
        ],
        importedRows: document.rows.length,
        outcomes: result.rows.map((r) => r.record.outcome),
        changedGates: changes.filter((r) => r.changed).length,
        form: compileForm(examplePack),
        plugins: registry.list().map((p) => p.id),
        agentStatus: completed.data.status,
        action: completed.data.result,
        replay: await agent.replay(run.id),
      },
      null,
      2,
    ),
  );
} finally {
  store.close();
}
