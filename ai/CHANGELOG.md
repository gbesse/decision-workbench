# AI change log

This file records the purpose and technical decisions behind agent-authored changes.

## 2026-09-21 — Decision Workbench v0.1.0 alpha

Implemented six connected modules in one independent open-source repository: Decision Studio, StateBridge, JSON Agent Server, Decision UI Builder, Decision Sheets and Decision Plugins. Reused pinned versions of DecisionPacks, Question Forge and Agent Capsule.

Chose direct Node 24 ESM and static browser assets with no build step. Added SQLite revisions and policy version history, durable agent claims, human review, offline rule and action replay, extraction evidence, explicit budgets and deadlines, local bearer authentication and operator-approved plugin entrypoint hashes. Added a working optional webhook action and external transform example.

Verified parser and persistence behavior, API and webhook interactions, PDF extraction and four desktop/mobile Chromium journeys. Corrected form-name DOM shadowing discovered by browser tests, clarified local-only annotation behavior, and routed uncertain action failures to the host error reporter. Added source formatting, syntax checks, focused JSDoc type checking, CI, operating documentation and synthetic screenshots.

The release is a single-operator local alpha. Live Jev inference and production multiuser deployment were not exercised; unsupported OCR, public plugin marketplace and autonomous retry behavior are documented explicitly.
