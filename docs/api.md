# Local JSON API

This guide describes the version 0.4 API used by the browser and external clients. The contract is alpha and may change before 1.0.

The CLI binds `127.0.0.1:4317`. Every `/api/` route requires `Authorization: Bearer <local-operator-token>`. POST bodies require `Content-Type: application/json`. Foreign browser origins are rejected. The browser token is not the TypeSafe API key.

Objects use `{id, revision, updated, data}`. Supply the current revision on policy saves, reviews, approvals and rejections. HTTP 409 means reload before deciding whether to repeat a write. Other errors return `{error: string}`. Import returns 201, accepted batches 202, and most successful operations 200. Business failures may be recorded in a returned run or job, so inspect its status as well as HTTP status.

| Method | Path                   | Body / purpose                                                            |
| ------ | ---------------------- | ------------------------------------------------------------------------- |
| GET    | `/api/workspace`       | Mode, policies, source metadata, recent jobs, runs, plugins, experiments  |
| GET    | `/api/example`         | Synthetic four-row CSV and sample policy                                  |
| GET    | `/api/document/:id`    | Complete extracted document                                               |
| GET    | `/api/job/:id`         | Batch state and saved row results                                         |
| GET    | `/api/run/:id`         | Agent decision, approval state and optional trace                         |
| GET    | `/api/civic-watch/:id` | Company profile, sourced signals, scores and operator reviews             |
| GET    | `/api/events`          | Latest 100 events                                                         |
| POST   | `/api/import`          | `{name, format, content, encoding?}`; `encoding: "base64"` for PDF        |
| POST   | `/api/map`             | `{documentId, rowId, mapping}`                                            |
| POST   | `/api/pack`            | `{id, revision, pack}`; creation uses revision 0                          |
| POST   | `/api/evaluate`        | `{packId, state}`; one saved decision                                     |
| POST   | `/api/jobs`            | `{documentId, packId, mapping, rowIds, maxCalls}`                         |
| POST   | `/api/jobs/cancel`     | `{id}`; request cancellation                                              |
| POST   | `/api/review`          | `{jobId, revision, rowId, outcome, note?}`; completed successful row only |
| POST   | `/api/replay`          | `{jobId, pack}`; compare rules using recorded answers                     |
| POST   | `/api/export/csv`      | `{jobId}`; returns `text/csv`                                             |
| POST   | `/api/form`            | `{packId}`; returns `{form, html}`                                        |
| POST   | `/api/experiment`      | `{spec}`; Question Forge experiment contract, maxEvaluations ≤100         |
| POST   | `/api/plugins/execute` | `{id, input}`; extractor or transform only, returns `{result}`            |
| POST   | `/api/runs`            | `{requestId, packId, state, routes}`                                      |
| POST   | `/api/runs/approve`    | `{id, revision}`; may execute one external action                         |
| POST   | `/api/runs/reject`     | `{id, revision}`                                                          |
| POST   | `/api/runs/replay`     | `{id}`; replay recorded action without executing tools                    |
| POST   | `/api/civic/scan`      | `{identifier, activityDescription, maxDocuments}`; 1–20 paid calls        |
| POST   | `/api/civic/review`    | `{id, revision, signalId, decision, note?}`                               |
| POST   | `/api/civic/digest`    | `{id}`; returns an evidence-linked Markdown digest                        |

## Evaluate from another application

```js
// Purpose: Call the local workbench with a bounded request and surface API failures.
const response = await fetch("http://127.0.0.1:4317/api/evaluate", {
  method: "POST",
  headers: {
    authorization: `Bearer ${process.env.WORKBENCH_TOKEN}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    packId: "support-triage",
    state: { text: "Please refund this invoice." },
  }),
  signal: AbortSignal.timeout(35000),
});
const result = await response.json();
if (!response.ok) throw new Error(result.error);
console.log(result.data.record.outcome);
```

Set the same `WORKBENCH_TOKEN` in the server and client environment. Tokens are full local operator credentials; don't embed them in a public website.

A mapping looks like `{ "text": { "source": "message", "type": "string" } }`. Types are `string`, `number`, or `boolean` with explicit coercion rules. Source and row IDs come from `/api/import`.

## JSON agent contract

```json
{
  "requestId": "ticket-42-attempt-1",
  "packId": "support-triage",
  "state": { "text": "Please refund this invoice." },
  "routes": {
    "billing": {
      "plugin": "annotation.prepare",
      "bindings": {
        "queue": { "value": "billing" },
        "text": { "state": "text" }
      }
    }
  }
}
```

The same request ID and content return the existing run. Different content under that ID receives 409. If the decision has an action route, its state is `awaiting_review`; approval must include the returned revision. No matching route means completion without an action. State bindings address a top-level field, not an arbitrary expression. The included annotation action returns a local value only; use the [webhook plugin](plugins.md) for a reviewed external write.

Poll batches with a reasonable interval (the UI uses 900 ms) until their status leaves `running`. The response preserves row-level errors; `completed_with_errors` is not a successful clean batch. Repeating a job POST creates a new batch and may consume additional inference calls.

Form layout routes, version checks and multi-step agent bindings are documented in [forms and sequences](forms-and-sequences.md). Existing single-action route inputs remain supported.
