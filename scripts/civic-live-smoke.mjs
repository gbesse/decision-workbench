// Purpose: Verify the real company registry, Assembly feed and Jev relevance path with exactly three paid model calls.
import { createJevProvider } from "@gbesse/decisionpacks";
import { scanCivicWatch } from "../packages/civic/index.mjs";

if (!process.env.TYPESAFE_API_KEY) {
  console.error(
    "civic-live-smoke: TYPESAFE_API_KEY is required; no source or model call was made.",
  );
  process.exit(2);
}

try {
  const watch = await scanCivicWatch(
    {
      identifier: "356000000",
      activityDescription:
        "Distribution de courrier et colis, services postaux et logistique du dernier kilomètre.",
      maxDocuments: 3,
    },
    { provider: createJevProvider({ timeoutMs: 30_000 }) },
  );
  console.log(
    JSON.stringify(
      {
        company: {
          siren: watch.company.siren,
          name: watch.company.name,
          activityCode: watch.company.activityCode,
          sourceUrl: watch.company.sourceUrl,
        },
        counts: watch.counts,
        signals: watch.signals.map(
          ({ title, probability, state, sourceUrl }) => ({
            title,
            probability,
            state,
            sourceUrl,
          }),
        ),
        usage: watch.usage,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(`civic-live-smoke: ${error.message}`);
  process.exitCode = 1;
}
