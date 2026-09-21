# Trusted plugins and reviewed actions

This guide explains the local extension mechanism, the included examples and the guarantees it does not provide.

A plugin exports `async execute(input, {signal, invocationId})`. Its manifest declares an ID, semantic version, kind (`extractor`, `transform`, `action`), description, input JSON Schema and output JSON Schema. The registry validates both sides with Ajv and rechecks the approved entrypoint SHA-256 before invocation.

The runtime launches a worker for each invocation. A worker can be terminated on timeout, including a CPU loop. Plugins still have the server user's filesystem, network and environment privileges. They can import other code; imported dependencies are not covered by the entrypoint digest. Installation is an operator trust decision, not a security certification.

## Try a transform

Read `examples/external-plugin/redact-emails.mjs`, then:

```sh
node examples/write-plugin-config.mjs
npm start -- --demo --plugins .local/plugin-config.json
```

Open **Plugins**, inspect `example.redact-emails` and test it with a JSON object containing a `text` field. Its regex removes common email patterns only; it is not a comprehensive PII detector.

The approval generator writes a new file and refuses to overwrite existing approval. A configuration is an array of `{manifest, modulePath, sha256}`. Relative paths resolve from the configuration file's directory. Inspect changed source before updating its digest. The UI displays installed contracts but cannot download or approve arbitrary code.

The built-ins are `statebridge.extract`, `text.normalize` and `annotation.prepare`. Extractors can be invoked through the JSON API; this alpha's file-upload selector remains wired to StateBridge's supported formats. Installing an extractor does not automatically add a new selector option.

## Send a real reviewed webhook

Read `examples/external-plugin/webhook-action.mjs`, then:

```sh
node examples/write-webhook-config.mjs
# Configure WORKBENCH_WEBHOOK_URL and, optionally, WORKBENCH_WEBHOOK_TOKEN
# in the server environment before starting.
npm start -- --demo --plugins .local/webhook-config.json
```

Use an HTTPS endpoint you control; loopback HTTP is accepted for development. In **JSON Agents**, change an action route's plugin to `example.webhook`. Keep its `queue` literal and `text` state bindings. Creating the workflow only evaluates the policy. **Approving it performs a real HTTP write, even in demo mode**: demo substitutes inference, not action plugins.

The request is POST JSON `{queue, text}`, with `Idempotency-Key` equal to the durable run ID and optional `Authorization: Bearer …` from the server environment. Redirects are rejected and the request has a ten-second deadline. Non-2xx responses fail visibly. The receiver must deduplicate idempotency keys; a client timeout cannot prove the receiver did nothing.

Action plugins are unavailable through `/api/plugins/execute`. They run only after a reviewed agent claim. Their results are recorded with Agent Capsule. Replay consumes those recordings without invoking the webhook. Failures and crashes become uncertain states and do not trigger automatic retries.

## Embed the registry

```js
// Purpose: Register a previously inspected local transform and invoke its JSON contract.
import { PluginRegistry } from "@gbesse/decision-workbench/plugins";
const registry = new PluginRegistry();
await registry.register({ manifest, modulePath, sha256 });
const result = await registry.execute(manifest.id, input, {
  timeoutMs: 5000,
  signal: AbortSignal.timeout(6000),
});
```

Here `manifest`, `modulePath`, `sha256`, and `input` are values from your approved configuration. Standalone registry users own their approval and error-reporting policy. The registry itself is not an authorization service.
