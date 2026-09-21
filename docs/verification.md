# Verification scope

This document states what the release checks and what still requires a real integration environment.

The repository uses Node's test runner and Chromium through Playwright. CI runs on Linux with Node 24. There is no compilation, container construction or production build in the verification workflow.

- Module tests cover SQLite compare-and-swap conflicts and recovery, source mappings and evidence, parser edge cases, strict coercion, CSV formula escaping, plugin hashes and JSON schemas, worker termination, typed form inputs, budgets, agent request identity and approved trace replay.
- A local HTTP receiver verifies the real optional webhook: no call before approval, stable idempotency header, one delivery, and no second delivery during capsule replay.
- HTTP tests cover authentication, browser-origin checks, CSP, import-to-review flows, immutable semantic versions, Question Forge wiring, explicit provider failures, non-responsive provider deadlines, and reporting of uncertain actions.
- A generated valid PDF fixture exercises text extraction through the actual PDF plugin worker.
- Four Chromium journeys cover source import, mapping, batch evaluation, correction, CSV download, plugin execution, generated forms, reviewed agent actions, mobile upload and source inspection, policy creation, and question comparison.
- `npm run check` checks maintained JavaScript syntax. `npm run typecheck` checks the UI compiler's JSDoc types only. `npm run format:check` verifies source formatting.
- `npm run demo` composes all six modules using the explicit synthetic provider.

The screenshot files in this directory are captured from browser tests with synthetic source data. They show the desktop Studio and mobile StateBridge. Browser failure traces are uploaded by CI only on a failed run.

## Live provider check — 2026-09-21

One initial real provider call confirmed authentication and the pinned `jev-1.13.0` model. The opt-in `npm run test:live` then passed with six further requests, bounded at the provider boundary with no retries. The six-request sequence completed in about three seconds on this run.

| Path                                             | Observed result                                  |
| ------------------------------------------------ | ------------------------------------------------ |
| Generated form evaluated through the HTTP API    | `billing`                                        |
| Imported and mapped CSV evaluated in Sheets      | `technical`, `sales`                             |
| JSON agent decision                              | `billing`                                        |
| Approved local annotation and capsule replay     | Completed; replay reproduced the recorded result |
| Human correction and decision-rule replay        | Passed; no extra provider call                   |
| Installed transform plugin                       | Validated output                                 |
| Question Forge development and held-out examples | Two successful provider calls                    |

Only fictional support requests were sent. No external action write was performed. The key stayed in an ignored local environment file and was not included in logs, commits or reports. The smoke test uses an in-memory workspace and an ephemeral local operator token. Its provider wrapper is marked `injected` by the server, but delegates exclusively to the real Jev provider.

`npm run test:live` is deliberately absent from the default test command and CI. It loads `.local/jev.env` when present or uses `TYPESAFE_API_KEY` from the environment. Each invocation can consume up to six billable provider calls and exits on failure; re-running it is a new budget.

This is a small live integration check, not an accuracy benchmark or load test. Production workloads, a remote webhook service, multiuser deployment and the cross-addon integration suite remain untested. The original v0.1.0 release was published before this live verification; its historical release notes reflect that earlier scope.
