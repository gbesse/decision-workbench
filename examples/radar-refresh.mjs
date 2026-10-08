// Demonstrate a sourced radar refresh that reuses unchanged judgments and preserves a human outcome.
import assert from 'node:assert/strict';
import { recordOpportunityOutcome, scanMarketRadar } from '../packages/radar/index.mjs';
import {
  demoRadarCompanyResolver,
  demoRadarNoticeResolver,
  demoRadarProvider,
} from '../packages/radar/fixtures.mjs';

const options = {
  identifier: '356000000',
  activityDescription:
    'Distribution de courrier et colis, services postaux et logistique du dernier kilomètre.',
  maxNotices: 4,
  maxCalls: 3,
  maxResults: 5,
};
const sources = {
  companyResolver: demoRadarCompanyResolver,
  noticeResolver: demoRadarNoticeResolver,
};
const first = await scanMarketRadar(options, {
  ...sources,
  provider: demoRadarProvider,
  now: new Date('2026-10-04T00:00:00Z'),
});
const reviewed = recordOpportunityOutcome(
  first,
  { noticeId: 'demo-boamp-postal-1', stage: 'bid', note: 'Go/no-go validé' },
  new Date('2026-10-05T10:00:00Z'),
);
let repeatedCalls = 0;
const refreshed = await scanMarketRadar(
  { ...options, previousRadar: reviewed, maxCalls: 0 },
  {
    ...sources,
    now: new Date('2026-10-06T00:00:00Z'),
    provider: async () => {
      repeatedCalls++;
      throw new Error('unchanged notice was rescored');
    },
  },
);
assert.equal(repeatedCalls, 0);
assert.equal(refreshed.delta.reused, 3);
assert.equal(refreshed.delta.outcomesPreserved, 1);
console.log(
  JSON.stringify(
    {
      synthetic: true,
      reused: refreshed.delta.reused,
      newModelCalls: repeatedCalls,
      humanOutcomesPreserved: refreshed.delta.outcomesPreserved,
    },
    null,
    2,
  ),
);
