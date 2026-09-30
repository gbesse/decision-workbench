#!/usr/bin/env node
// Purpose: One-shot civic impact CLI reusing the exact Workbench source, scoring and digest pipeline.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createJevProvider } from "@gbesse/decisionpacks";
import { renderCivicDigest, scanCivicWatch } from "../packages/civic/index.mjs";
import {
  demoCompanyResolver,
  demoDocumentResolver,
} from "../packages/civic/fixtures.mjs";
import { syntheticProvider } from "../packages/studio/fixtures.mjs";

const HELP = `jev-france impact --siret IDENTIFIANT --activity DESCRIPTION [options]

Options:
  --siret, --siren IDENTIFIANT  SIRET à 14 chiffres ou SIREN à 9 chiffres
  --activity DESCRIPTION        produits, services, clients et contraintes
  --depuis, --since AAAA-MM-JJ  ignorer les signaux officiels plus anciens
  --limit N                     1 à 20 signaux (défaut : 10)
  --format markdown|json        sortie standard (défaut : markdown)
  --output CHEMIN               écrire dans un nouveau fichier au lieu de stdout
  --checkpoint CHEMIN           réutiliser puis remplacer un état JSON privé
  --demo                         sources et décisions synthétiques, aucun réseau
  --help                         afficher cette aide`;

function validIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

export function parseImpactArgs(argv) {
  const options = {
    identifier: null,
    activity: null,
    since: null,
    limit: 10,
    format: "markdown",
    output: null,
    checkpoint: null,
    demo: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === "--help" || flag === "-h") {
      options.help = true;
      continue;
    }
    if (flag === "--demo") {
      options.demo = true;
      continue;
    }
    if (
      ![
        "--siret",
        "--siren",
        "--activity",
        "--depuis",
        "--since",
        "--limit",
        "--format",
        "--output",
        "--checkpoint",
      ].includes(flag)
    )
      throw new Error(`Option inconnue : ${flag}`);
    const value = argv[++index];
    if (value === undefined) throw new Error(`${flag} attend une valeur`);
    if (flag === "--siret" || flag === "--siren") options.identifier = value;
    else if (flag === "--activity") options.activity = value;
    else if (flag === "--depuis" || flag === "--since") options.since = value;
    else if (flag === "--limit") options.limit = Number(value);
    else if (flag === "--format") options.format = value;
    else if (flag === "--output") options.output = value;
    else options.checkpoint = value;
  }
  if (options.help) return options;
  if (options.demo) {
    options.identifier ??= "356000000";
    options.activity ??=
      "Distribution de courrier et colis, services postaux et logistique du dernier kilomètre.";
  }
  if (
    !/^\d{9}(\d{5})?$/.test(String(options.identifier ?? "").replace(/\s/g, ""))
  )
    throw new Error("--siret/--siren doit contenir 9 ou 14 chiffres");
  if (
    !(
      typeof options.activity === "string" &&
      options.activity.trim().length >= 10
    )
  )
    throw new Error(
      "--activity doit décrire l’activité en au moins 10 caractères",
    );
  if (
    !(
      Number.isInteger(options.limit) &&
      options.limit >= 1 &&
      options.limit <= 20
    )
  )
    throw new Error("--limit doit être un entier entre 1 et 20");
  if (!["markdown", "json"].includes(options.format))
    throw new Error("--format doit être markdown ou json");
  if (options.since !== null && !validIsoDate(options.since))
    throw new Error("--depuis doit suivre le format AAAA-MM-JJ");
  return options;
}

async function readCheckpoint(path) {
  if (!path) return null;
  try {
    return JSON.parse(await readFile(resolve(path), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeCheckpoint(path, watch) {
  if (!path) return;
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(watch, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporary, target);
}

export async function runImpactCli(argv, { stdout = process.stdout } = {}) {
  const options = parseImpactArgs(argv);
  if (options.help) {
    stdout.write(`${HELP}\n`);
    return;
  }
  const previousWatch = await readCheckpoint(options.checkpoint);
  const watch = await scanCivicWatch(
    {
      identifier: options.identifier,
      activityDescription: options.activity,
      maxDocuments: options.limit,
      since: options.since,
      previousWatch,
    },
    options.demo
      ? {
          provider: syntheticProvider,
          companyResolver: demoCompanyResolver,
          documentResolver: demoDocumentResolver,
        }
      : { provider: createJevProvider({ timeoutMs: 30_000 }) },
  );
  await writeCheckpoint(options.checkpoint, watch);
  const output =
    options.format === "json"
      ? `${JSON.stringify(watch, null, 2)}\n`
      : renderCivicDigest(watch);
  if (options.output) {
    const target = resolve(options.output);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, output, { flag: "wx", mode: 0o600 });
  } else stdout.write(output);
}

export { HELP as IMPACT_HELP };
