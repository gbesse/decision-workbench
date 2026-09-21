# AI change log

This file records the purpose and technical decisions behind agent-authored changes.

## 2026-09-21 — v0.4.0 complete civic product and focused Workbench

Added an end-to-end French company public-watch workflow: exact SIREN/SIRET resolution through the open Annuaire des
Entreprises API, official Assemblée nationale RSS ingestion, pinned `jev-hemicycle` reuse, persisted relevance signals,
separate human review and evidence-linked Markdown digest. The stored company profile deliberately excludes directors
and finances. External calls use explicit deadlines and official-link restrictions; scans are limited to 20 paid model
calls and fail visibly instead of exporting partial results.

Recentered navigation and documentation around one lifecycle—source, decision, review, export—with company watch as
the default complete example and authoring/forms/agents/plugins retained as advanced tools. Added three module tests,
one API flow and one Chromium journey with a generated civic screenshot. The live three-call smoke resolved La Poste
and correctly rejected three unrelated parliamentary publications at 0.01–0.02 relevance.

## 2026-09-21 — Decision Workbench v0.1.0 alpha

Implemented six connected modules in one independent open-source repository: Decision Studio, StateBridge, JSON Agent Server, Decision UI Builder, Decision Sheets and Decision Plugins. Reused pinned versions of DecisionPacks, Question Forge and Agent Capsule.

Chose direct Node 24 ESM and static browser assets with no build step. Added SQLite revisions and policy version history, durable agent claims, human review, offline rule and action replay, extraction evidence, explicit budgets and deadlines, local bearer authentication and operator-approved plugin entrypoint hashes. Added a working optional webhook action and external transform example.

Verified parser and persistence behavior, API and webhook interactions, PDF extraction and four desktop/mobile Chromium journeys. Corrected form-name DOM shadowing discovered by browser tests, clarified local-only annotation behavior, and routed uncertain action failures to the host error reporter. Added source formatting, syntax checks, focused JSDoc type checking, CI, operating documentation and synthetic screenshots.

The release is a single-operator local alpha. Live Jev inference and production multiuser deployment were not exercised; unsupported OCR, public plugin marketplace and autonomous retry behavior are documented explicitly.

## 2026-09-21 — Real Jev integration verified

Loaded the operator-provided key exclusively from ignored `.local/jev.env`. One initial request and six bounded end-to-end requests against `jev-1.13.0` passed. Verified generated-form evaluation, CSV mapping and batch decisions, human review, JSON agent approval with a local-only annotation, tool-free and rule-only replay, an installed transform and Question Forge development/held-out evaluation.

Added the explicit `npm run test:live` command with a six-call ceiling, provider and HTTP deadlines, in-memory state, redacted error messages and no automatic CI execution. Updated documentation to distinguish the observed live integration from synthetic tests, model-quality claims and untested production deployments. No API key or customer data was committed. No external action writes occurred.

## 2026-09-21 — v0.2.0 visual forms, action sequences and launch research

Added persistent form layouts with labels, controls, help, ordering, select options, preview and HTML export. Layout saves use revisions and policy fingerprints; stale forms cannot be evaluated or exported until reviewed. Raw DecisionPack API callers retain their original behavior.

Extended routes to 1–10 sequential actions with an approval and durable claim per step, bindings to earlier outputs, per-step invocation identities, plugin pins and capsule replay. Preserved legacy request fingerprints and single-action replay fields. Added tests for restart, stale approvals, schema restrictions, plugin changes and failed later steps, plus two new browser journeys. Extended the six-call live smoke to cover customized forms and two-step action review; real Jev verification passed without external action writes.

Published a French comparative study of eight LLM projects using pinned README versions from 2022–2023 and a dated GitHub snapshot. Distinguished historical product propositions, current popularity, archival status and product hypotheses. Left OCR, a public plugin marketplace, host-by-host addon validation and adoption work as explicit backlog.

## 2026-09-21 — Decision Review and reusable application host

Added append-only reviewer votes, explicit disagreement adjudication, immutable model judgments, conflict-checked dataset publication and development/holdout state separation. Added local review UI and portable Decision Blocks trace import. Reused SQLite CAS, workspace lease and bounded local authentication for standalone apps. Validated 33 unit/API tests and seven Chromium journeys; no build or paid inference. Reviewer identities remain self-declared in local Workbench.

## 2026-09-21 — Six-product launch map

Published an explicit map of the six launches, their shared contracts, public repositories and verification limits. Four new repositories accompany the Review and Blocks extensions. The private Hub deployment completed successfully; live smoke evidence uses four bounded synthetic-input Jev calls.

Updated the visible Workbench release label to v0.3 for the Review launch.
