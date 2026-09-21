# Contributing

Contributions should make one real decision workflow easier to operate or integrate.

Use Node 24+, run `npm ci --ignore-scripts`, and start with `npm start -- --demo`. The source runs directly; do not add a build requirement for routine local development. Follow the commands in the README before proposing a change.

Keep modules reusable, retain source evidence, validate JSON at boundaries and set deadlines on external calls. Never turn an unexpected provider failure into a confident decision. Preserve recorded judgments when adding human corrections. Explain non-obvious execution and recovery decisions in comments.

For plugins, include explicit input/output schemas, bounded behavior, a fixture, and a description of external effects. A worker is not a security sandbox. Do not add runtime marketplace installation without an explicit trust and update design.

For extractors, test representative malformed inputs and source references. For destination addons, verify the actual host's contract. Changes to persisted objects or public JSON need a compatibility or migration note. Keep demo behavior visibly synthetic and avoid unsupported capability claims in the UI.

Add a dated summary in `ai/CHANGELOG.md`. Use Conventional Commits. Do not commit keys, personal datasets, SQLite workspaces, generated approval configurations or browser traces.
