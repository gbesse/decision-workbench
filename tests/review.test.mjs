// Purpose: Verify independent reviews, immutable model results, tamper detection and conflict-safe dataset exports.
import test from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "@gbesse/decisionpacks";
import {
  examplePack,
  syntheticProvider,
} from "../packages/studio/fixtures.mjs";
import {
  createReviewSet,
  vote,
  resolve,
  status,
  exportDataset,
} from "../packages/review/index.mjs";
import { createLocalApp } from "../packages/apps/server.mjs";
const state = { text: "charged twice" },
  record = await evaluate(examplePack, state, { provider: syntheticProvider });
const base = () =>
  createReviewSet({
    name: "Support",
    pack: examplePack,
    rows: [{ record, state }],
  });
test("disagreements block export; adjudication preserves all original votes and prediction", () => {
  const first = vote(base(), {
    caseId: record.id,
    actor: "Alice",
    outcome: "billing",
    note: "Invoice",
  });
  const second = vote(first, {
    caseId: record.id,
    actor: "Bob",
    outcome: "technical",
    note: "API defect",
  });
  assert.equal(status(second.cases[0]).status, "disagreement");
  assert.throws(
    () => exportDataset(second, { caseIds: [record.id] }),
    /disputed/,
  );
  const resolved = resolve(second, {
    caseId: record.id,
    actor: "Charlie",
    outcome: "billing",
    note: "Invoice confirmed",
  });
  const dataset = exportDataset(resolved, {
    caseIds: [record.id],
    minReviewers: 2,
  });
  assert.equal(dataset.cases[0].expected, "billing");
  assert.equal(dataset.cases[0].votes.length, 2);
  assert.deepEqual(dataset.cases[0].original, record);
  const changed = vote(resolved, {
    caseId: record.id,
    actor: "Bob",
    outcome: "review",
    note: "New evidence",
  });
  assert.equal(changed.cases[0].resolution, null);
  assert.equal(base().cases[0].votes.length, 0);
});
test("forged input/outcome and duplicate records cannot become evaluation evidence", () => {
  assert.throws(
    () =>
      createReviewSet({
        name: "x",
        pack: examplePack,
        rows: [{ state: { text: "different" }, record }],
      }),
    /fingerprint/,
  );
  assert.throws(
    () =>
      createReviewSet({
        name: "x",
        pack: examplePack,
        rows: [{ state, record: { ...record, outcome: "sales" } }],
      }),
    /outcome/,
  );
  assert.throws(
    () =>
      createReviewSet({
        name: "x",
        pack: examplePack,
        rows: [
          { state, record },
          { state, record },
        ],
      }),
    /Duplicate/,
  );
});
test("standalone app API enforces authentication, origin and persistent CAS errors", async () => {
  const app = await createLocalApp({
    web: new URL("../web/", import.meta.url),
    handle: ({ store, body }) =>
      store.put("item", "one", body, body.revision ?? 0),
    onError: () => {},
  });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${app.server.address().port}/api/test`;
  try {
    assert.equal(
      (await fetch(url, { signal: AbortSignal.timeout(3000) })).status,
      401,
    );
    const headers = {
      authorization: "Bearer " + app.token,
      "content-type": "application/json",
    };
    assert.equal(
      (
        await fetch(url, {
          method: "POST",
          headers: { ...headers, origin: "https://attacker.example" },
          body: "{}",
          signal: AbortSignal.timeout(3000),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(url, {
          method: "POST",
          headers,
          body: "{}",
          signal: AbortSignal.timeout(3000),
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(url, {
          method: "POST",
          headers,
          body: "{}",
          signal: AbortSignal.timeout(3000),
        })
      ).status,
      409,
    );
  } finally {
    await app.close();
  }
});
