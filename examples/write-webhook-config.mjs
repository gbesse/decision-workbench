// Purpose: Approve the optional webhook action after the operator has inspected its source and configured its environment.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname, relative } from "node:path";
const modulePath = resolve("examples/external-plugin/webhook-action.mjs"),
  destination = resolve(process.argv[2] ?? ".local/webhook-config.json");
const manifest = {
  id: "example.webhook",
  version: "0.1.0",
  kind: "action",
  description: "Deliver reviewed JSON to the operator-configured webhook.",
  inputSchema: {
    type: "object",
    required: ["queue", "text"],
    properties: { queue: { type: "string" }, text: { type: "string" } },
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    required: ["status", "httpStatus", "idempotencyKey"],
  },
};
await mkdir(dirname(destination), { recursive: true });
await writeFile(
  destination,
  JSON.stringify(
    [
      {
        manifest,
        modulePath: relative(dirname(destination), modulePath),
        sha256: createHash("sha256")
          .update(await readFile(modulePath))
          .digest("hex"),
      },
    ],
    null,
    2,
  ) + "\n",
  { flag: "wx", mode: 0o600 },
);
console.log("Created " + destination);
