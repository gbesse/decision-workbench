# Reuse and addon integration

Decision Workbench connects existing decision modules and exposes the shared artifacts for other systems.

## Dependencies reused directly

| Repository                                                 | Pinned commit                              | Role                                                        |
| ---------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| [DecisionPacks](https://github.com/gbesse/decisionpacks)   | `3c90b6e667c16653b9a6ae00b376df9bddbd8461` | Contracts, answer validation, provider adapter, rule replay |
| [Question Forge](https://github.com/gbesse/question-forge) | `0754a0c4bc0baa10e1f34bf7311d0d1020f81a09` | Development/held-out candidate comparison                   |
| [Agent Capsule](https://github.com/gbesse/agent-capsule)   | `6f62c52faa3844a8a96f749a7f6dbeae36a5b84e` | Reviewed action recording and tool-free replay              |

The package lock fixes the transitive dependency graph. No copied fork of these runtimes is maintained here. Updating a pin requires running the module, API and browser checks.

## Importable modules

Install with `npm install --ignore-scripts github:gbesse/decision-workbench#v0.2.0`.

| Import                                   | Exports                                     |
| ---------------------------------------- | ------------------------------------------- |
| `@gbesse/decision-workbench`             | `createWorkbench`                           |
| `@gbesse/decision-workbench/statebridge` | `extract`, `mapState`                       |
| `@gbesse/decision-workbench/sheets`      | `evaluateRows`, `exportCsv`                 |
| `@gbesse/decision-workbench/ui`          | `compileForm`, `validateForm`, `exportHtml` |
| `@gbesse/decision-workbench/agent`       | `AgentServer`                               |
| `@gbesse/decision-workbench/plugins`     | `PluginRegistry`, `approveLocalPlugin`      |
| `@gbesse/decision-workbench/storage`     | `Store`, `Conflict`                         |

These are JavaScript ESM APIs. The UI compiler is checked through JSDoc; the full package does not currently ship comprehensive TypeScript declarations. See `examples/offline-demo.mjs` for an executable composition of all six modules.

`createWorkbench({token, database, demo, provider, pluginConfig, onError, timeoutMs})` returns `{server, store, registry, agent, mode, close}`. Bind the returned Node HTTP server to loopback. A supplied provider takes precedence over demo mode and is labeled `injected`. Close the workbench to release its database lease.

## Existing system integrations

These related repositories provide places to consume decisions in established ecosystems:

- [Django](https://github.com/gbesse/django-jev-decisions)
- [WordPress](https://github.com/gbesse/wordpress-jev-rules)
- [Node-RED](https://github.com/gbesse/node-red-contrib-jev-decisions)
- [Temporal](https://github.com/gbesse/temporal-jev-decisions)
- [Directus](https://github.com/gbesse/directus-extension-jev)
- [Camunda](https://github.com/gbesse/camunda-jev-connector)
- [Unity](https://github.com/gbesse/unity-jev-behavior)

The workbench does not install or configure those addons. Their contracts and supported policy subsets differ. Validate an exported pack against the destination addon and use its documented adapter; this release does not claim an end-to-end certification of all seven systems. A server-side call to `/api/evaluate` is the language-independent integration path for local consumers.

Keep the decision policy version and model pin in application logs. Preserve the imported source separately if you need to resolve its evidence pointers later. Don't expose the full operator token to public client applications.

## Where contributions compound

Useful additions are fixture-backed extractors with provenance, reviewable action plugins for existing systems, validated policy examples with labeled evaluation data, and destination adapters tested against real host versions. Prefer reusable contracts and recorded evidence over opaque glue. Datasets containing user documents or judgments are never uploaded automatically.
