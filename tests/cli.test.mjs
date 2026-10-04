// Purpose: Verify the installable one-shot civic command without public-source or paid-model calls.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseImpactArgs, runImpactCli } from "../scripts/impact.mjs";
import { parsePortfolioArgs, runPortfolioCli } from "../scripts/portfolio.mjs";

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

test("portfolio CLI enforces one global budget and emits an offline aggregate", async () => {
  assert.throws(
    () => parsePortfolioArgs(["--input", "companies.json", "--max-calls", "0"]),
    /entre 1 et 100/,
  );
  const directory = await mkdtemp(join(tmpdir(), "jev-portfolio-"));
  const input = join(directory, "companies.json");
  await writeFile(
    input,
    JSON.stringify([
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
    ]),
  );
  let output = "";
  await runPortfolioCli(
    ["--demo", "--input", input, "--max-calls", "4", "--format", "json"],
    { stdout: { write: (chunk) => (output += chunk) } },
  );
  const portfolio = JSON.parse(output);
  assert.equal(portfolio.counts.companies, 2);
  assert.deepEqual(portfolio.budget, {
    maxCalls: 4,
    requestedCalls: 4,
    usedCalls: 4,
  });
});
