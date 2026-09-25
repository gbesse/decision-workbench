# Verification scope

This document states what the release checks and what still requires a real integration environment.

The repository uses Node's test runner and Chromium through Playwright. CI runs on Linux with Node 24. There is no compilation, container construction or production build in the verification workflow.

- Module tests cover SQLite compare-and-swap conflicts and recovery, source mappings and evidence, parser edge cases, strict coercion, CSV formula escaping, plugin hashes and JSON schemas, worker termination, typed form inputs, budgets, agent request identity and approved trace replay.
- A local HTTP receiver verifies the real optional webhook: no call before approval, stable idempotency header, one delivery, and no second delivery during capsule replay.
- HTTP tests cover authentication, browser-origin checks, CSP, import-to-review flows, immutable semantic versions, Question Forge wiring, explicit provider failures, non-responsive provider deadlines, and reporting of uncertain actions.
- A generated valid PDF fixture exercises text extraction through the actual PDF plugin worker.
- Eight Chromium journeys cover the complete company-watch and digest flow, source import, mapping, batch evaluation, correction, CSV download, plugin execution, generated forms, reviewed agent actions, mobile upload and source inspection, policy creation, question comparison, persistent visual form editing, separately approved two-step workflows and Decision Review.
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

## v0.5.0 incremental civic workflow

The module suite now covers first scan, human review, a no-cost refresh that reuses unchanged judgments and reviews,
and selective rescoring when one publication changes. The browser suite verifies the complete civic journey alongside
the seven existing Workbench journeys. The official RSS adapter is supplied by tagged `jev-hemicycle` v0.2.0, and
`npm audit --audit-level=high` reports no vulnerabilities.

The 2026-09-25 live smoke resolved La Poste, fetched three current official publications, made exactly three Jev calls,
then immediately refreshed the same watch with zero additional model calls.

## v0.4.0 civic workflow check

The default suite adds exact company-response minimization, restricted official RSS links, reuse of the pinned
`jev-hemicycle` adapter, review immutability, evidence-linked digest output, authenticated API persistence and a full
Chromium journey. These checks use explicit offline fixtures.

`npm run test:civic:live` passed on 2026-09-21. It resolved La Poste through the live Annuaire des Entreprises API,
downloaded the live Assemblée nationale publications feed and made exactly three `jev-1.13.0` calls. All three current
publications were unrelated to postal activity and received relevance probabilities of 0.02, 0.02 and 0.01. The run
used 2,043 input tokens and 66 output tokens. This validates connectivity and obvious negatives, not recall or legal
accuracy. No personal director data, financial data or credential was logged or stored.

## v0.2.0 extension checks

Additional tests cover layout ordering, typed controls, select constraints, stale layout revisions and policy drift; independently approved two-step workflows; previous-result bindings; restart between actions; plugin pin changes; failed later steps retaining the completed prefix; and pre-v0.2 request identity compatibility. Browser checks exercise layout persistence, evaluation and export, and two successive action approvals with a two-event replay.

The optional live check was extended to save and evaluate a customized form and approve two local-only actions. It passed on 2026-09-21 with six real `jev-1.13.0` requests total for that invocation, no extra provider calls during replay and no external action writes. This is in addition to the earlier seven-request verification, not an assertion that no further calls were used.

`workbench-form-builder.png` shows the visual editor using fictional sample data. The research JSON files in `docs/research` contain public GitHub metadata and pinned early README references; they contain no workspace records or credentials.
