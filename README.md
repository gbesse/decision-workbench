# Decision Workbench

**From a sourced document to a reviewed, exportable Jev decision.**

[![Verify](https://github.com/gbesse/decision-workbench/actions/workflows/verify.yml/badge.svg)](https://github.com/gbesse/decision-workbench/actions/workflows/verify.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Decision Workbench is a local product for importing evidence, evaluating a versioned decision, preserving the model
output, recording a separate human review and exporting the result. Its first complete vertical workflow monitors
French public information for a company identified by SIREN or SIRET.

![Company watch with sourced parliamentary signals](docs/workbench-civic.png)

**v0.7.0 · Node.js 24+ · MIT · independent of TypeSafe.** The browser UI is French. Jev inference is a separate paid
TypeSafe service; this project does not redistribute model weights.

## Try the complete product offline

```sh
git clone https://github.com/gbesse/decision-workbench.git
cd decision-workbench
npm ci --ignore-scripts
npm start -- --demo
```

Open the private localhost link, choose **Préremplir La Poste**, then **Analyser la veille publique**. The offline
example resolves a company profile, evaluates sourced parliamentary and procurement fixtures, lets you confirm or
dismiss a signal and exports a Markdown digest. It makes no network or Jev call and is not an accuracy demonstration.

The same complete civic path is available without the browser:

```sh
./scripts/cli.mjs impact --demo
# Live after setting TYPESAFE_API_KEY:
./scripts/cli.mjs impact --siret 356000000 \
  --activity "Services postaux, colis et logistique du dernier kilomètre" \
  --depuis 2026-09-01 --limit 10
```

The installed command names are `decision-workbench` and `jev-france`, so the live form is also
`jev-france impact --siret …`. Markdown is written to stdout by default; `--format json`, `--output` and a private
`--checkpoint` file support machine-readable and incremental runs. Output files are created with mode 600 and are not
silently overwritten.

For the real workflow:

```sh
TYPESAFE_API_KEY=... npm start
```

The server fetches the public company profile, the official Assembly feed and current BOAMP procurement notices, then
makes one paid Jev request per selected new or changed signal. An incremental refresh reuses unchanged judgments and
their human reviews, so it makes no paid call when the source window is unchanged. The key stays server-side. Each scan
is limited to 20 signals and every source call has a deadline.

## Un résumé de veille prêt à partager · A concise watch brief · Un resumen de vigilancia

`npm run demo:brief` produit un JSON court à partir des mêmes sources et décisions **synthétiques** que la démonstration civique. Il conserve le nombre de signaux et les liens de source, pour illustrer ce qu'une intégration pourrait afficher. Ce n'est ni une veille réelle ni une mesure de qualité.

`npm run demo:brief` produces compact JSON from the same **synthetic** civic sources and decisions. It keeps signal counts and source links to show what an integration could display. It is neither a live watch nor a quality measurement.

`npm run demo:brief` genera un JSON breve a partir de las mismas fuentes y decisiones cívicas **sintéticas**. Conserva los recuentos y enlaces de origen para mostrar lo que podría presentar una integración. No es una vigilancia real ni una medición de calidad.

## One workflow, two entries

| Stage    | Company watch                                     | Your own documents                             |
| -------- | ------------------------------------------------- | ---------------------------------------------- |
| Source   | Annuaire + Assemblée nationale + BOAMP            | CSV, JSON, text, HTML, email or textual PDF    |
| State    | Company profile + declared activity + publication | Explicit field mapping with evidence pointers  |
| Decision | Impact via `jev-hemicycle`; fit via `jev-marches` | Versioned DecisionPack                         |
| Review   | Confirm, dismiss or keep pending                  | Correct a row without overwriting model output |
| Export   | Evidence-linked Markdown digest                   | CSV, JSON, DecisionPack or evaluation dataset  |

This is the product spine. The Atelier now includes the direct Postman-like gesture: paste a JSON state, choose a
DecisionPack, run one evaluation and inspect the unchanged probabilities and decision trace. Policy authoring,
question comparison, generated forms, reviewed JSON actions and trusted plugins remain available as advanced tools,
but they all serve the same source → decision → review → export lifecycle.

## Existing projects reused directly

- [Jev Hémicycle](https://github.com/gbesse/jev-hemicycle) normalizes and evaluates parliamentary publications.
- [Jev Marchés](https://github.com/gbesse/jev-marches) fetches and evaluates official BOAMP procurement notices.
- [DecisionPacks](https://github.com/gbesse/decisionpacks) validates policies, calls Jev and replays decision rules.
- [Question Forge](https://github.com/gbesse/question-forge) compares wording on development and held-out examples.
- [Agent Capsule](https://github.com/gbesse/agent-capsule) captures approved actions for tool-free replay.

Pinned Git commits in `package.json` make the reused implementation auditable. The Workbench adds source ingestion,
persistence, authentication, browser workflows and human review rather than copying these repositories.

## Generic document workflow

Switch to **Atelier** to edit a policy, **Sources** to import evidence, then **Évaluations** to map fields and run a
bounded batch. Corrections remain separate from the original judgment. Decision Review can require multiple votes and
an adjudication before exporting development or holdout cases.

```js
import { extract, mapState } from "@gbesse/decision-workbench/statebridge";

const source = await extract({
  name: "tickets.csv",
  format: "csv",
  content: "text\nPlease refund the invoice",
});
const { state, evidence } = mapState(source, "1", {
  text: { source: "text", type: "string" },
});
```

Importable modules include `./civic`, `./statebridge`, `./review`, `./sheets`, `./ui`, `./agent`, `./plugins`, `./apps`
and `./storage`. Install the tagged repository with
`npm install --ignore-scripts github:gbesse/decision-workbench#v0.7.0`.

## Operate and verify

Workspace data is stored in `.local/workbench.sqlite`. One process owns a workspace. The server binds to loopback,
requires a local bearer token and rejects foreign browser origins. Stop with Ctrl+C; use `--database :memory:` for a
disposable session or `--port 4318` for another port.

```sh
npm run format:check
npm run check
npm run typecheck
npm test
npm run demo
npx playwright install chromium
npm run test:browser
```

`npm run test:live` makes at most six paid Jev calls using fictional generic examples. `npm run test:civic:live`
resolves a real public profile, fetches the live Assembly feed and makes exactly three paid calls. Neither runs in CI.

There is no build step. Default verification covers 44 module/API tests and eight Chromium journeys. This remains a
single-operator localhost application: no accounts, hosted deployment, OCR, scheduler, automatic email or legal advice.

## Documentation

- [Company public watch](docs/civic-watch.md)
- [Verification scope](docs/verification.md)
- [JSON API](docs/api.md)
- [Architecture, persistence and recovery](docs/architecture.md)
- [Integration and reusable modules](docs/integration.md)
- [Editable forms and reviewed action sequences](docs/forms-and-sequences.md)
- [Trusted plugins and reviewed webhooks](docs/plugins.md)
- [Security model](SECURITY.md)
