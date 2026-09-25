// Purpose: Verify official-source normalization, Jev adapter reuse, review separation and digest evidence links.
import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchCompanyProfile,
  fetchParliamentaryDocuments,
  scanCivicWatch,
  reviewCivicSignal,
  renderCivicDigest,
} from "../packages/civic/index.mjs";
import {
  demoCompanyResolver,
  demoDocumentResolver,
} from "../packages/civic/fixtures.mjs";
import { syntheticProvider } from "../packages/studio/fixtures.mjs";

test("normalizes the official company search response without retaining directors or finances", async () => {
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        results: [
          {
            siren: "356000000",
            nom_complet: "LA POSTE",
            etat_administratif: "A",
            section_activite_principale: "H",
            siege: {
              siret: "35600000000048",
              etat_administratif: "A",
              activite_principale: "53.10Z",
              adresse: "PARIS",
              departement: "75",
            },
            dirigeants: [{ nom: "not retained" }],
            finances: { 2025: { ca: 1 } },
          },
        ],
      }),
      { status: 200 },
    );
  const profile = await fetchCompanyProfile("356 000 000", { fetchImpl });
  assert.equal(profile.name, "LA POSTE");
  assert.equal(profile.siret, "35600000000048");
  assert.equal("dirigeants" in profile, false);
  assert.equal("finances" in profile, false);
});

test("parses only HTTPS Assemblée nationale links from the official RSS shape", async () => {
  const xml = `<?xml version="1.0"?><rss><channel><item><title>Texte public</title><link>https://www.assemblee-nationale.fr/dyn/17/textes/x</link><guid>x</guid><pubDate>Sun, 20 Sep 2026 00:00:00 +0000</pubDate><description>Une publication officielle</description></item></channel></rss>`;
  const documents = await fetchParliamentaryDocuments({
    limit: 1,
    fetchImpl: async () => new Response(xml, { status: 200 }),
  });
  assert.equal(documents[0].title, "Texte public");
  assert.match(
    documents[0].sourceUrl,
    /^https:\/\/www\.assemblee-nationale\.fr/,
  );
});

test("runs the complete civic watch, preserves model output and records human review separately", async () => {
  const watch = await scanCivicWatch(
    {
      identifier: "356000000",
      activityDescription:
        "Distribution de courrier, colis et services postaux",
      maxDocuments: 2,
    },
    {
      provider: syntheticProvider,
      companyResolver: demoCompanyResolver,
      documentResolver: demoDocumentResolver,
    },
  );
  assert.equal(watch.signals.length, 2);
  assert.equal(watch.signals[0].state, "relevant");
  assert.equal(watch.signals[1].state, "irrelevant");
  const reviewed = reviewCivicSignal(watch, {
    signalId: watch.signals[0].id,
    decision: "confirmed",
    note: "À transmettre",
  });
  assert.equal(reviewed.signals[0].probability, watch.signals[0].probability);
  assert.equal(reviewed.signals[0].operatorReview.decision, "confirmed");
  const digest = renderCivicDigest(reviewed);
  assert.match(digest, /À transmettre/);
  assert.match(digest, /assemblee-nationale\.fr/);
  assert.doesNotMatch(digest, /formation des praticiens/);
});

test("an incremental refresh reuses unchanged scores and human reviews without paid calls", async () => {
  let calls = 0;
  const provider = async (request) => {
    calls++;
    return syntheticProvider(request);
  };
  const input = {
    identifier: "356000000",
    activityDescription: "Distribution de courrier, colis et services postaux",
    maxDocuments: 2,
  };
  const first = await scanCivicWatch(input, {
    provider,
    companyResolver: demoCompanyResolver,
    documentResolver: demoDocumentResolver,
  });
  const reviewed = reviewCivicSignal(first, {
    signalId: first.signals[0].id,
    decision: "confirmed",
    note: "Revue conservée",
  });
  assert.equal(calls, 2);
  const refreshed = await scanCivicWatch(
    { ...input, previousWatch: reviewed },
    {
      provider,
      companyResolver: demoCompanyResolver,
      documentResolver: demoDocumentResolver,
    },
  );
  assert.equal(calls, 2);
  assert.deepEqual(refreshed.delta, {
    analyzed: 0,
    reused: 2,
    previousScanAt: reviewed.scannedAt,
  });
  assert.equal(refreshed.usage.requests, 0);
  assert.equal(refreshed.signals[0].operatorReview.note, "Revue conservée");
});

test("a changed source is rescored with hysteresis and its stale review is cleared", async () => {
  const input = {
    identifier: "356000000",
    activityDescription: "Distribution de courrier, colis et services postaux",
    maxDocuments: 2,
  };
  const first = await scanCivicWatch(input, {
    provider: syntheticProvider,
    companyResolver: demoCompanyResolver,
    documentResolver: demoDocumentResolver,
  });
  const reviewed = reviewCivicSignal(first, {
    signalId: first.signals[0].id,
    decision: "confirmed",
  });
  let calls = 0;
  const refreshed = await scanCivicWatch(
    { ...input, previousWatch: reviewed },
    {
      provider: async (request) => {
        calls++;
        return syntheticProvider(request);
      },
      companyResolver: demoCompanyResolver,
      documentResolver: async (options) => {
        const documents = await demoDocumentResolver(options);
        documents[0] = {
          ...documents[0],
          text: documents[0].text + " Mise à jour.",
        };
        return documents;
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(refreshed.delta.analyzed, 1);
  assert.equal(refreshed.delta.reused, 1);
  assert.equal(refreshed.signals[0].operatorReview, null);
});
