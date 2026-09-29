---
description: Sources, decision path, review contract and operating boundaries of the French company public-watch workflow.
---

# Company public watch

The civic workflow answers two bounded questions in one source window: which recent parliamentary publications may
materially address a declared company's activity, and which current public contracts may fit its stated capabilities?
It produces review signals, not a statement of applicable law or a guarantee that the company can bid.

## End-to-end path

1. A 9-digit SIREN or 14-digit SIRET is resolved through the open API that powers Annuaire des Entreprises.
2. The stored profile is deliberately limited to name, identifiers, activity code, category, address, status, update
   date and official profile link. Directors and financial data returned by the source are discarded.
3. Recent publications are fetched from the official Assemblée nationale RSS feed by `jev-hemicycle`; current public
   contracts are fetched from the open BOAMP/DILA API by `jev-marches`. When the shared limit is at least two, one slot
   is reserved for each source before the rest is filled by recency, preventing BOAMP volume from hiding Parliament.
4. Jev evaluates each new or changed parliamentary publication for material relevance and each procurement notice for
   company fit and its main blocker. A SHA-256 fingerprint lets refreshes reuse unchanged scores and reviews; changed
   evidence is rescored and its stale review is cleared. Model output is never overwritten by operator review.
5. A Markdown digest includes every non-dismissed signal, score, review state and official link.

The live source calls have explicit 15-second deadlines. A scan accepts 1–20 merged signals; one Jev request is made
per new or changed eligible signal and none when the source window is unchanged. Expired procurement notices are
rejected in code. Source or provider failures abort the scan instead of producing a partial digest.

## Verification

`npm run test:civic:live` resolves La Poste, merges three current official signals from Assembly and BOAMP, makes at
most three paid Jev requests, then refreshes the same window with no additional model call. It proves source and model
wiring, not ranking quality or procurement eligibility.

Default tests never call a public source or paid model. They use explicit fixtures and cover source minimization, RSS
link restrictions, incremental reuse, changed-source rescoring, scan persistence, human review separation, digest
evidence links and the complete browser journey.

## Boundaries

- Parliamentary publications may be proposals or reports, not enacted law. BOAMP metadata is not the complete tender
  dossier and does not establish eligibility or commercial fit.
- The workflow does not currently ingest authenticated Légifrance text versions or establish legal obligations.
- RSS descriptions can be short; always open the source before acting.
- Company activity codes can be stale or too broad. The operator-provided activity description is part of every model
  state and should describe actual products, services and customers.
- This is a single-operator local workspace. Digests are exported manually; there is no scheduler or outbound email.
