// Purpose: Verify the complete bounded Marchés Radar composition and its outcome feedback loop offline.
import test from "node:test";
import assert from "node:assert/strict";
import {
  createOpportunityProfile,
  recordOpportunityOutcome,
  renderMarketRadar,
  scanMarketRadar,
} from "../packages/radar/index.mjs";
import {
  demoRadarCompanyResolver,
  demoRadarNoticeResolver,
  demoRadarProvider,
} from "../packages/radar/fixtures.mjs";

test("creates an explicit company opportunity profile without guessing geography", async () => {
  const company = await demoRadarCompanyResolver();
  const profile = createOpportunityProfile(
    company,
    "Distribution nationale de courrier et colis",
    { minimumLeadDays: 12 },
  );
  assert.equal(profile.activityCode, "53.10Z");
  assert.equal(profile.departments, undefined);
  assert.equal(profile.minimumLeadDays, 12);
});

test("builds one sourced and budgeted opportunity inbox", async () => {
  const radar = await scanMarketRadar(
    {
      identifier: "356000000",
      activityDescription:
        "Distribution de courrier et colis, services postaux et logistique du dernier kilomètre.",
      maxNotices: 4,
      maxCalls: 3,
      maxResults: 5,
      minimumLeadDays: 7,
    },
    {
      provider: demoRadarProvider,
      companyResolver: demoRadarCompanyResolver,
      noticeResolver: demoRadarNoticeResolver,
      now: new Date("2026-10-04T00:00:00.000Z"),
    },
  );
  assert.deepEqual(radar.counts, { pursue: 1, investigate: 1, ignore: 2 });
  assert.deepEqual(radar.budget, {
    maxCalls: 3,
    usedCalls: 3,
    deferredNotices: 0,
    reusedNotices: 0,
  });
  assert.equal(radar.opportunities.length, 2);
  assert.match(radar.opportunities[0].evidence.sourceUrl, /boamp\.fr/);
  assert.match(renderMarketRadar(radar), /Profil officiel de l’entreprise/);

  const updated = recordOpportunityOutcome(
    radar,
    { noticeId: "demo-boamp-postal-1", stage: "bid", note: "Go/no-go validé" },
    new Date("2026-10-05T10:00:00.000Z"),
  );
  assert.deepEqual(updated.opportunities[0].operatorOutcome, {
    stage: "bid",
    note: "Go/no-go validé",
    at: "2026-10-05T10:00:00.000Z",
  });
  assert.equal(
    updated.decisions.find((row) => row.noticeId === "demo-boamp-postal-1")
      .operatorOutcome.stage,
    "bid",
  );
  assert.equal(radar.opportunities[0].operatorOutcome, undefined);

  let repeatedCalls = 0;
  const refreshed = await scanMarketRadar(
    {
      identifier: "356000000",
      activityDescription:
        "Distribution de courrier et colis, services postaux et logistique du dernier kilomètre.",
      maxNotices: 4,
      maxCalls: 0,
      maxResults: 5,
      minimumLeadDays: 7,
      previousRadar: updated,
    },
    {
      provider: async () => {
        repeatedCalls++;
        throw new Error("unchanged notices must be reused");
      },
      companyResolver: demoRadarCompanyResolver,
      noticeResolver: demoRadarNoticeResolver,
      now: new Date("2026-10-06T00:00:00.000Z"),
    },
  );
  assert.equal(repeatedCalls, 0);
  assert.deepEqual(refreshed.delta, {
    analyzed: 0,
    reused: 3,
    deferred: 0,
    outcomesPreserved: 1,
  });
  assert.equal(refreshed.opportunities[0].operatorOutcome.stage, "bid");
});

test("rejects a model budget larger than the source window", async () => {
  await assert.rejects(
    scanMarketRadar(
      {
        identifier: "356000000",
        activityDescription: "Distribution de courrier et colis",
        maxNotices: 2,
        maxCalls: 3,
      },
      {
        provider: demoRadarProvider,
        companyResolver: demoRadarCompanyResolver,
        noticeResolver: demoRadarNoticeResolver,
      },
    ),
    /budget Jev/,
  );
});
