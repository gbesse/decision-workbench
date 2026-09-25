---
description: Sources, decision path, review contract and operating boundaries of the French company public-watch workflow.
---

# Company public watch

The civic workflow answers one bounded question: which recent parliamentary publications may materially address a
declared company's activity? It produces review signals, not a statement of applicable law.

## End-to-end path

1. A 9-digit SIREN or 14-digit SIRET is resolved through the open API that powers Annuaire des Entreprises.
2. The stored profile is deliberately limited to name, identifiers, activity code, category, address, status, update
   date and official profile link. Directors and financial data returned by the source are discarded.
3. Recent publications are fetched from the official Assemblée nationale RSS feed and normalized by the existing
   `jev-hemicycle` package.
4. Jev evaluates each new or changed publication against the operator's activity description. A SHA-256 fingerprint
   lets refreshes reuse unchanged scores and reviews; changed evidence is rescored and its stale review is cleared.
   The stored score and state are never overwritten by the operator's separate review.
5. A Markdown digest includes every non-dismissed signal, score, review state and official link.

The live source calls have explicit 15-second deadlines. A scan accepts 1–20 documents; one Jev request is made per
new or changed document and none when the feed window is unchanged. Source or provider failures abort the scan and
enter the Workbench error registry instead of producing a partial digest.

## Verification

`npm run test:civic:live` resolves La Poste, downloads three current Assembly publications and sends exactly three paid
Jev requests. The 2026-09-21 run resolved SIREN `356000000` and correctly marked the three unrelated publications
irrelevant with probabilities between 0.01 and 0.02. This proves wiring and gross negative discrimination, not model
accuracy.

Default tests never call a public source or paid model. They use explicit fixtures and cover source minimization, RSS
link restrictions, incremental reuse, changed-source rescoring, scan persistence, human review separation, digest
evidence links and the complete browser journey.

## Boundaries

- Parliamentary publications may be proposals or reports, not enacted law.
- The workflow does not currently ingest authenticated Légifrance text versions or establish legal obligations.
- RSS descriptions can be short; always open the source before acting.
- Company activity codes can be stale or too broad. The operator-provided activity description is part of every model
  state and should describe actual products, services and customers.
- This is a single-operator local workspace. Digests are exported manually; there is no scheduler or outbound email.
