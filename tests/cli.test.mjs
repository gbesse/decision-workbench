// Purpose: Verify the installable one-shot civic command without public-source or paid-model calls.
import test from "node:test";
import assert from "node:assert/strict";
import { parseImpactArgs, runImpactCli } from "../scripts/impact.mjs";

test("impact CLI parses the French aliases and rejects unsafe ambiguity", () => {
  const parsed = parseImpactArgs([
    "--siret",
    "356000000",
    "--activity",
    "Services postaux et logistique",
    "--depuis",
    "2026-09-20",
    "--limit",
    "3",
  ]);
  assert.equal(parsed.identifier, "356000000");
  assert.equal(parsed.since, "2026-09-20");
  assert.equal(parsed.limit, 3);
  assert.throws(() => parseImpactArgs(["--unknown"]), /Option inconnue/);
  assert.throws(
    () => parseImpactArgs(["--demo", "--format", "yaml"]),
    /markdown ou json/,
  );
  assert.throws(
    () => parseImpactArgs(["--demo", "--depuis", "2026-02-30"]),
    /format AAAA-MM-JJ/,
  );
});

test("impact CLI runs the complete dated civic product offline and emits reusable JSON", async () => {
  let output = "";
  await runImpactCli(
    ["--demo", "--depuis", "2026-09-20", "--limit", "3", "--format", "json"],
    { stdout: { write: (chunk) => (output += chunk) } },
  );
  const watch = JSON.parse(output);
  assert.equal(watch.company.siren, "356000000");
  assert.equal(watch.since, "2026-09-20");
  assert.deepEqual(
    watch.signals.map((signal) => signal.id),
    ["demo-boamp-postal-1"],
  );
  assert.equal(watch.usage.requests, 1);
});
