// Purpose: Register pinned trusted plugins, validate JSON contracts and bound worker execution.
import { Worker } from "node:worker_threads";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL, fileURLToPath } from "node:url";
import Ajv from "ajv";
import { ensure, snapshot } from "../core/contracts.mjs";
const ajv = new Ajv({ strict: false, allErrors: true });
export class PluginRegistry {
  constructor() {
    this.plugins = new Map();
  }
  async register({ manifest, modulePath, sha256 }) {
    manifest = snapshot(manifest);
    ensure(
      /^[a-z][a-z0-9.-]{2,80}$/.test(manifest.id) &&
        /^\d+\.\d+\.\d+$/.test(manifest.version),
      "Plugin needs a stable id and semantic version",
    );
    ensure(
      ["extractor", "transform", "action"].includes(manifest.kind) &&
        typeof manifest.description === "string",
      "Invalid plugin kind or description",
    );
    ensure(!this.plugins.has(manifest.id), "Duplicate plugin id");
    const url =
      modulePath instanceof URL ? modulePath : pathToFileURL(modulePath);
    ensure(
      url.protocol === "file:",
      "Plugins must be explicitly configured local files",
    );
    const digest = createHash("sha256")
      .update(await readFile(url))
      .digest("hex");
    ensure(
      sha256 === digest,
      "Plugin module hash does not match the approved version",
    );
    const input = ajv.compile(manifest.inputSchema),
      output = ajv.compile(manifest.outputSchema);
    this.plugins.set(manifest.id, { manifest, url, digest, input, output });
    return { ...manifest, sha256: digest };
  }
  list() {
    return [...this.plugins.values()].map((p) => ({
      ...p.manifest,
      sha256: p.digest,
    }));
  }
  async execute(
    id,
    input,
    { timeoutMs = 10000, signal, invocationId = randomUUID() } = {},
  ) {
    const plugin = this.plugins.get(id);
    ensure(plugin, "Unknown or disabled plugin");
    input = snapshot(input);
    ensure(
      Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 60000,
      "Invalid plugin deadline",
    );
    ensure(
      Buffer.byteLength(JSON.stringify(input)) <= 5_000_000,
      "Plugin input too large",
    );
    ensure(
      plugin.input(input),
      "Plugin input: " + ajv.errorsText(plugin.input.errors),
    );
    // Verify the entrypoint again. Dependency pinning and trust remain the operator's responsibility.
    ensure(
      createHash("sha256")
        .update(await readFile(plugin.url))
        .digest("hex") === plugin.digest,
      "Approved plugin changed on disk",
    );
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./worker.mjs", import.meta.url), {
        workerData: { url: plugin.url.href, input, timeoutMs, invocationId },
        resourceLimits: { maxOldGenerationSizeMb: 128 },
        execArgv: [],
      });
      let finished = false;
      const finish = (error, value) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        worker
          .terminate()
          .then(() => (error ? reject(error) : resolve(value)), reject);
      };
      const abort = () =>
        finish(signal.reason ?? new Error("Plugin cancelled"));
      const timer = setTimeout(
        () => finish(new Error("Plugin deadline exceeded")),
        timeoutMs,
      );
      signal?.addEventListener("abort", abort, { once: true });
      worker.on("error", (error) => finish(error));
      worker.on("exit", (code) => {
        if (!finished)
          finish(new Error(`Plugin exited without a result (${code})`));
      });
      worker.on("message", (message) => {
        try {
          ensure(message.ok, message.error?.message ?? "Plugin failed");
          const value = snapshot(message.output);
          ensure(
            Buffer.byteLength(JSON.stringify(value)) <= 6_000_000,
            "Plugin output too large",
          );
          ensure(
            plugin.output(value),
            "Plugin output: " + ajv.errorsText(plugin.output.errors),
          );
          finish(null, value);
        } catch (error) {
          finish(error);
        }
      });
    });
  }
}
export async function approveLocalPlugin(registry, manifest, modulePath) {
  const url =
    modulePath instanceof URL ? modulePath : pathToFileURL(modulePath);
  return registry.register({
    manifest,
    modulePath: fileURLToPath(url),
    sha256: createHash("sha256")
      .update(await readFile(url))
      .digest("hex"),
  });
}
