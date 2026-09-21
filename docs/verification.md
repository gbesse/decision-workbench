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

No paid live Jev inference, production workload, remote webhook service, multiuser deployment or cross-addon integration suite was exercised. Keyword-based fixture accuracy is not model accuracy. A model pin and matching JSON shapes cannot replace a live provider smoke test in your environment.
