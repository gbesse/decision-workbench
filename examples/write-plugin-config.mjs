// Purpose: Generate an explicit entrypoint hash approval for the bundled external-plugin example.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, relative, dirname } from "node:path";
const modulePath = resolve("examples/external-plugin/redact-emails.mjs"),
  destination = resolve(process.argv[2] ?? ".local/plugin-config.json");
const schema = {
  type: "object",
  required: ["text"],
  properties: { text: { type: "string" } },
  additionalProperties: false,
};
const config = [
  {
    manifest: {
      id: "example.redact-emails",
      version: "0.1.0",
      kind: "transform",
      description:
        "Redact obvious email addresses; not a comprehensive PII detector.",
      inputSchema: schema,
      outputSchema: schema,
    },
    modulePath: relative(dirname(destination), modulePath),
    sha256: createHash("sha256")
      .update(await readFile(modulePath))
      .digest("hex"),
  },
];
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, JSON.stringify(config, null, 2) + "\n", {
  flag: "wx",
  mode: 0o600,
});
console.log("Created " + destination);
