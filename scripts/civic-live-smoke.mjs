// Purpose: Verify the live civic path and an immediate no-cost refresh with exactly three paid model calls.
import { createJevProvider } from "@gbesse/decisionpacks";
import { scanCivicWatch } from "../packages/civic/index.mjs";

if (!process.env.TYPESAFE_API_KEY) {
  console.error(
    "civic-live-smoke: TYPESAFE_API_KEY is required; no source or model call was made.",
  );
  process.exit(2);
}

try {
  let providerCalls = 0;
  const liveProvider = createJevProvider({ timeoutMs: 30_000 });
  const provider = async (request) => {
    providerCalls++;
    return liveProvider(request);
  };
  const input = {
    identifier: "356000000",
    activityDescription:
      "Distribution de courrier et colis, services postaux et logistique du dernier kilomètre.",
    maxDocuments: 3,
  };
  const watch = await scanCivicWatch(input, { provider });
  const refreshed = await scanCivicWatch(
    { ...input, previousWatch: watch },
    { provider },
  );
  if (providerCalls !== 3 || refreshed.usage.requests !== 0)
    throw new Error(
      `incremental refresh made unexpected Jev calls (${providerCalls} total, ${refreshed.usage.requests} on refresh)`,
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
        refresh: refreshed.delta,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(`civic-live-smoke: ${error.message}`);
  process.exitCode = 1;
}
