// Purpose: Verify official-source normalization, Jev adapter reuse, review separation and digest evidence links.
import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchCompanyProfile,
  fetchCivicDocuments,
  fetchParliamentaryDocuments,
  scanCivicWatch,
  scanCivicPortfolio,
  reviewCivicSignal,
  renderCivicDigest,
  renderCivicPortfolioDigest,
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

test("merges Assembly and BOAMP results into one newest-first bounded source window", async () => {
  const documents = await fetchCivicDocuments({
    limit: 2,
    parliamentaryResolver: async () => [
      {
        id: "assembly",
        kind: "parliamentary-publication",
        title: "Texte",
        text: "Texte public",
        sourceUrl: "https://www.assemblee-nationale.fr/dyn/17/textes/x",
        date: "2026-09-28T10:00:00.000Z",
        source: "Assemblée nationale",
      },
    ],
    procurementResolver: async () => [
      {
        id: "older-market",
        kind: "procurement-notice",
        title: "Marché ancien",
        text: "Marché ancien",
        sourceUrl: "https://www.boamp.fr/pages/avis/?q=idweb:1",
        date: "2026-09-28T11:00:00.000Z",
        source: "BOAMP · DILA",
      },
      {
        id: "new-market",
        kind: "procurement-notice",
        title: "Marché récent",
        text: "Marché récent",
        sourceUrl: "https://www.boamp.fr/pages/avis/?q=idweb:2",
        date: "2026-09-29T10:00:00.000Z",
        source: "BOAMP · DILA",
      },
    ],
  });
  assert.deepEqual(
    documents.map((document) => document.id),
    ["new-market", "assembly"],
  );
});

test("filters the merged official window from an explicit inclusive date", async () => {
  const make = (id, kind, date) => ({
    id,
    kind,
    title: id,
    text: id,
    sourceUrl:
      kind === "procurement-notice"
        ? `https://www.boamp.fr/pages/avis/?q=idweb:${id}`
        : `https://www.assemblee-nationale.fr/dyn/17/textes/${id}`,
    date,
    source: kind === "procurement-notice" ? "BOAMP" : "Assemblée",
  });
  const documents = await fetchCivicDocuments({
    limit: 5,
    since: "2026-09-20",
    parliamentaryResolver: async () => [
      make("before", "parliamentary-publication", "2026-09-19T23:59:59Z"),
      make("on-date", "parliamentary-publication", "2026-09-20T00:00:00Z"),
    ],
    procurementResolver: async () => [
      make("after", "procurement-notice", "2026-09-21T00:00:00Z"),
    ],
  });
  assert.deepEqual(
    documents.map((document) => document.id),
    ["after", "on-date"],
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

test("scores a BOAMP opportunity through jev-marches and exports procurement evidence", async () => {
  const procurement = {
    id: "26-demo",
    kind: "procurement-notice",
    title: "Distribution de courrier et colis",
    text: "Distribution de courrier et colis\nAcheteur: Ville exemple",
    buyer: "Ville exemple",
    departments: ["75"],
    descriptors: ["Services postaux"],
    contractTypes: ["SERVICES"],
    deadline: "2099-12-01T12:00:00.000Z",
    date: "2026-09-29T00:00:00.000Z",
    sourceUrl: "https://www.boamp.fr/pages/avis/?q=idweb:26-demo",
    source: "BOAMP · DILA",
  };
  const watch = await scanCivicWatch(
    {
      identifier: "356000000",
      activityDescription:
        "Distribution de courrier, colis et services postaux",
      maxDocuments: 1,
    },
    {
      provider: syntheticProvider,
      companyResolver: demoCompanyResolver,
      documentResolver: async () => [procurement],
    },
  );
  assert.equal(watch.schemaVersion, 3);
  assert.equal(watch.signals[0].metric, "fit");
  assert.equal(watch.signals[0].score, 3);
  assert.equal(watch.signals[0].state, "relevant");
  assert.equal(watch.signals[0].buyer, "Ville exemple");
  assert.equal(watch.usage.requests, 1);
  assert.ok(watch.sources.some((source) => source.name.startsWith("BOAMP")));
  const digest = renderCivicDigest(watch);
  assert.match(digest, /Adéquation à l’activité : 3\/3/);
  assert.match(digest, /Ville exemple/);
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

test("runs a multi-company portfolio only when its worst case fits the global budget", async () => {
  const companies = [
    {
      identifier: "356000000",
      activityDescription: "Distribution de courrier et colis en France",
      maxDocuments: 2,
    },
    {
      identifier: "552100554",
      activityDescription: "Transport de voyageurs et services de mobilité",
      maxDocuments: 2,
    },
  ];
  await assert.rejects(
    scanCivicPortfolio(companies, {
      maxCalls: 3,
      provider: syntheticProvider,
      companyResolver: demoCompanyResolver,
      documentResolver: demoDocumentResolver,
    }),
    /au-dessus du budget global de 3/,
  );
  const portfolio = await scanCivicPortfolio(companies, {
    maxCalls: 4,
    provider: syntheticProvider,
    companyResolver: demoCompanyResolver,
    documentResolver: demoDocumentResolver,
  });
  assert.deepEqual(portfolio.budget, {
    maxCalls: 4,
    requestedCalls: 4,
    usedCalls: 4,
  });
  assert.equal(portfolio.counts.companies, 2);
  assert.equal(portfolio.counts.signals, 4);
  assert.equal(portfolio.watches[1].company.siren, "552100554");
  assert.match(renderCivicPortfolioDigest(portfolio), /Budget Jev : 4\/4/);
});

test("reuses every unchanged portfolio signal without a new provider call", async () => {
  const companies = [
    {
      identifier: "356000000",
      activityDescription: "Distribution de courrier et colis en France",
      maxDocuments: 2,
    },
    {
      identifier: "552100554",
      activityDescription: "Transport de voyageurs et services de mobilité",
      maxDocuments: 2,
    },
  ];
  let calls = 0;
  const options = {
    maxCalls: 4,
    provider: async (request) => {
      calls++;
      return syntheticProvider(request);
    },
    companyResolver: demoCompanyResolver,
    documentResolver: demoDocumentResolver,
  };
  const first = await scanCivicPortfolio(companies, options);
  const second = await scanCivicPortfolio(companies, {
    ...options,
    previousPortfolio: first,
  });
  assert.equal(calls, 4);
  assert.equal(second.usage.requests, 0);
  assert.equal(second.watches[0].delta.reused, 2);
  assert.equal(second.watches[1].delta.reused, 2);
});
