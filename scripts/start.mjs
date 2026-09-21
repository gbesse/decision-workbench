#!/usr/bin/env node
// Purpose: Start the local workbench with an ephemeral UI access token and explicit synthetic/live modes.
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { createWorkbench } from "../packages/studio/server.mjs";
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
};
const token = process.env.WORKBENCH_TOKEN ?? randomBytes(32).toString("hex");
const database = option("--database", ".local/workbench.sqlite");
const app = await createWorkbench({
  database: database === ":memory:" ? database : resolve(database),
  token,
  demo: args.includes("--demo"),
  pluginConfig: option("--plugins", undefined),
});
const port = Number(option("--port", process.env.PORT ?? "4317"));
app.server.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
app.server.listen(port, "127.0.0.1", () =>
  console.log(
    `Decision Workbench (${app.mode})\nOpen http://127.0.0.1:${app.server.address().port}/#token=${token}\nKeep this local operator token private. Jev credentials never enter the browser.`,
  ),
);
let closing = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    if (closing) return;
    closing = true;
    await app.close();
  });
