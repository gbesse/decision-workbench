// Purpose: Configure bundled plugins and load operator-approved external manifests without web code uploads.
import { PluginRegistry, approveLocalPlugin } from "../plugins/index.mjs";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
const object = (properties) => ({
  type: "object",
  required: Object.keys(properties),
  properties,
  additionalProperties: false,
});
const string = { type: "string" };
export async function createRegistry(configPath) {
  const registry = new PluginRegistry();
  await approveLocalPlugin(
    registry,
    {
      id: "statebridge.extract",
      version: "0.1.0",
      kind: "extractor",
      description:
        "CSV, JSON, text, HTML, plain email and text PDF with provenance.",
      inputSchema: {
        type: "object",
        required: ["name", "format", "content"],
        properties: {
          name: string,
          format: { enum: ["csv", "json", "text", "html", "email", "pdf"] },
          content: string,
          encoding: { enum: ["utf8", "base64"] },
        },
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        required: ["source", "rows", "warnings"],
      },
    },
    new URL("../statebridge/plugin.mjs", import.meta.url),
  );
  await approveLocalPlugin(
    registry,
    {
      id: "text.normalize",
      version: "0.1.0",
      kind: "transform",
      description: "Normalize whitespace in a string.",
      inputSchema: object({ text: string }),
      outputSchema: object({ text: string }),
    },
    new URL("../plugins/normalize-text.mjs", import.meta.url),
  );
  await approveLocalPlugin(
    registry,
    {
      id: "annotation.prepare",
      version: "0.1.0",
      kind: "action",
      description:
        "Prepare a local annotation result. No external system is changed.",
      inputSchema: object({ queue: string, text: string }),
      outputSchema: { type: "object", required: ["execution", "annotation"] },
    },
    new URL("../plugins/annotate-action.mjs", import.meta.url),
  );
  if (configPath) {
    const configs = JSON.parse(await readFile(configPath, "utf8"));
    if (!Array.isArray(configs))
      throw new Error("Plugin config must be an array");
    for (const config of configs)
      await registry.register({
        ...config,
        modulePath: resolve(dirname(configPath), config.modulePath),
      });
  }
  return registry;
}
