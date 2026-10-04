# Marchés Radar

Marchés Radar turns a French company identifier into a small, evidence-linked opportunity inbox. It is designed for a human go/no-go workflow, not bulk search and not autonomous bidding.

## Decision path

1. Resolve the SIREN or SIRET through the public Annuaire des Entreprises API.
2. Load a bounded newest-first window from the official BOAMP/DILA API.
3. Reject certain mismatches locally: expired deadline, insufficient lead time, CPV, geography, contract type, excluded buyer or amount ceiling.
4. Rank eligible candidates deterministically, then ask Jev only about the best candidates within the explicit budget.
5. Apply the versioned `opportunity-radar/1.0.0` policy to produce `pursue`, `investigate` or `ignore`.
6. Keep each official URL and record the operator’s later stage separately: reviewed, qualified, bid, won, lost or dismissed.
7. On refresh, reuse an assessment only when the profile, policy version and SHA-256 source fingerprint are unchanged.

The policy uses the combined probability mass of compatible fit classes. It never labels a fit score as a probability of winning the tender.

## CLI

```sh
jev-france radar --demo

jev-france radar \
  --siret 356000000 \
  --activity "Distribution de courrier et colis, services postaux et logistique" \
  --limit 20 \
  --max-calls 10 \
  --max-results 5 \
  --departments 75,92 \
  --contract-types SERVICES
```

Use `--format json` for integration or `--output path.md` for a private mode-600 file. The command refuses to overwrite an existing output.

## API

- `POST /api/radar/scan` creates and persists a radar; include its `radarId` and `revision` to refresh it in place with optimistic concurrency.
- `POST /api/radar/outcome` records an operator stage without rewriting the model decision.
- `POST /api/radar/digest` exports an evidence-linked Markdown brief.
- `GET /api/market-radar/:id` retrieves one persisted radar.

All endpoints require the local bearer token. The browser never receives the TypeSafe API key.

## Evaluation boundary

The underlying public v1 benchmark contains twelve synthetic, obvious cases. A real Jev run on 4 October 2026 produced 12/12, zero false `ignore`, eight model calls and 5,987 input tokens. This calibrates the policy contract; it is not evidence of accuracy on representative BOAMP traffic.

A separate live integration smoke test on the same date loaded 100 current BOAMP notices for La Poste, spent exactly three calls (2,673 input tokens), rejected the three scored candidates and displayed no opportunity. Ninety-five notices were explicitly deferred. An immediate unchanged refresh reused the three scores and made zero calls with zero tokens. This proves budget, reuse and empty-state behavior, not recall: the finite newest-first window contained no validated postal opportunity.

The next evaluation step is a frozen, blindly annotated real-notice set and prospective tracking of qualification, bid and win outcomes.
