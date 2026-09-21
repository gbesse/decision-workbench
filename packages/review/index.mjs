// Purpose: Preserve independent judgments and human votes, resolve disagreements, and publish reproducible evaluation datasets.
import { fingerprint, validatePack, replay } from "@gbesse/decisionpacks";
import { ensure, snapshot } from "../core/contracts.mjs";
export function createReviewSet({ name, pack, rows }) {
  validatePack(pack);
  ensure(
    typeof name === "string" && name.trim() && name.length <= 120,
    "Dataset name required",
  );
  ensure(
    Array.isArray(rows) && rows.length > 0 && rows.length <= 500,
    "Select 1–500 successful rows",
  );
  const cases = rows.map((row) => {
    ensure(
      row.record?.inputFingerprint === fingerprint(row.state),
      "Input fingerprint mismatch",
    );
    ensure(
      row.record?.pack?.fingerprint === fingerprint(pack),
      "Policy fingerprint mismatch",
    );
    const checked = replay(pack, [row])[0];
    ensure(
      checked.after === row.record.outcome,
      "Recorded outcome does not match policy",
    );
    return {
      id: row.record.id,
      state: snapshot(row.state),
      record: snapshot(row.record),
      votes: [],
      resolution: null,
    };
  });
  ensure(
    new Set(cases.map((c) => c.id)).size === cases.length,
    "Duplicate decision records",
  );
  return { schemaVersion: 1, name, pack: snapshot(pack), cases, history: [] };
}
export function vote(set, { caseId, actor, outcome, note }) {
  const next = snapshot(set),
    row = next.cases.find((c) => c.id === caseId);
  ensure(row, "Unknown case");
  ensure(
    typeof actor === "string" && actor.trim() && actor.length <= 100,
    "Reviewer name required",
  );
  ensure(
    typeof note === "string" && note.trim() && note.length <= 2000,
    "Review reason required",
  );
  ensure(
    [next.pack.fallback, ...next.pack.rules.map((r) => r.outcome)].includes(
      outcome,
    ),
    "Unknown outcome",
  );
  // Votes remain append-only. A changed vote invalidates adjudication; export never silently follows the last writer.
  row.votes.push({ actor, outcome, note, at: new Date().toISOString() });
  row.resolution = null;
  next.history.push({ type: "vote", caseId, ...row.votes.at(-1) });
  return next;
}
export function status(row) {
  const current = new Map(row.votes.map((v) => [v.actor, v]));
  const outcomes = [...new Set([...current.values()].map((v) => v.outcome))];
  return {
    status: row.resolution
      ? "resolved"
      : outcomes.length > 1
        ? "disagreement"
        : outcomes.length === 1
          ? "consensus"
          : "unreviewed",
    outcome:
      row.resolution?.outcome ?? (outcomes.length === 1 ? outcomes[0] : null),
    reviewers: current.size,
  };
}
export function resolve(set, input) {
  const next = snapshot(set),
    row = next.cases.find((c) => c.id === input.caseId);
  ensure(row && row.votes.length, "Review the case first");
  // Validate adjudicator fields with the same finite contract, without appending a fictitious vote.
  vote(next, input);
  row.resolution = {
    actor: input.actor,
    outcome: input.outcome,
    note: input.note,
    at: new Date().toISOString(),
  };
  next.history.push({ type: "resolution", caseId: row.id, ...row.resolution });
  return next;
}
export function exportDataset(
  set,
  { caseIds, split = "development", minReviewers = 1 } = {},
) {
  ensure(["development", "holdout"].includes(split), "Invalid dataset split");
  ensure(
    Number.isInteger(minReviewers) && minReviewers >= 1 && minReviewers <= 20,
    "Invalid reviewer minimum",
  );
  ensure(
    Array.isArray(caseIds) &&
      caseIds.length &&
      new Set(caseIds).size === caseIds.length,
    "Select unique case ids",
  );
  const cases = caseIds.map((id) => {
    const row = set.cases.find((c) => c.id === id);
    ensure(row, "Unknown case");
    const s = status(row);
    ensure(
      s.outcome !== null && s.reviewers >= minReviewers,
      "Unreviewed, disputed or insufficiently reviewed case",
    );
    return {
      id: row.id,
      state: snapshot(row.state),
      expected: s.outcome,
      original: snapshot(row.record),
      votes: snapshot(row.votes),
      resolution: row.resolution,
    };
  });
  const dataset = {
    schemaVersion: 1,
    name: set.name,
    split,
    pack: snapshot(set.pack),
    cases,
  };
  return { ...dataset, fingerprint: fingerprint(dataset) };
}
