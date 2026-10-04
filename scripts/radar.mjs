#!/usr/bin/env node
// Purpose: Run the complete SIRET-to-opportunity Marchés Radar product from one bounded command.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createJevProvider } from "@gbesse/decisionpacks";
import {
  renderMarketRadar,
  scanMarketRadar,
} from "../packages/radar/index.mjs";
import {
  demoRadarCompanyResolver,
  demoRadarNoticeResolver,
  demoRadarProvider,
} from "../packages/radar/fixtures.mjs";

const HELP = `jev-france radar --siret IDENTIFIANT --activity DESCRIPTION [options]

Options:
  --siret, --siren IDENTIFIANT  SIRET à 14 chiffres ou SIREN à 9 chiffres
  --activity DESCRIPTION        produits, services et contraintes de livraison
  --limit N                     1 à 100 avis BOAMP (défaut : 100)
  --max-calls N                 budget Jev, de 0 à limit (défaut : 10)
  --max-results N               1 à 20 actions présentées (défaut : 5)
  --departments LISTE           départements séparés par des virgules
  --contract-types LISTE        types de marché séparés par des virgules
  --cpv LISTE                   préfixes CPV séparés par des virgules
  --min-lead-days N             délai minimal avant échéance (défaut : 7)
  --format markdown|json        sortie standard (défaut : markdown)
  --output CHEMIN               écrire dans un nouveau fichier au lieu de stdout
  --demo                         profil, avis et décisions synthétiques, aucun réseau
  --help                         afficher cette aide`;

const list = (value) =>
  value === null
    ? undefined
    : value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

export function parseRadarArgs(argv) {
  const options = {
    identifier: null,
    activity: null,
    limit: 100,
    maxCalls: 10,
    maxResults: 5,
    departments: null,
    contractTypes: null,
    cpv: null,
    minimumLeadDays: 7,
    format: "markdown",
    output: null,
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
        "--limit",
        "--max-calls",
        "--max-results",
        "--departments",
        "--contract-types",
        "--cpv",
        "--min-lead-days",
        "--format",
        "--output",
      ].includes(flag)
    )
      throw new Error(`Option inconnue : ${flag}`);
    const value = argv[++index];
    if (value === undefined) throw new Error(`${flag} attend une valeur`);
    if (flag === "--siret" || flag === "--siren") options.identifier = value;
    else if (flag === "--activity") options.activity = value;
    else if (flag === "--limit") options.limit = Number(value);
    else if (flag === "--max-calls") options.maxCalls = Number(value);
    else if (flag === "--max-results") options.maxResults = Number(value);
    else if (flag === "--departments") options.departments = value;
    else if (flag === "--contract-types") options.contractTypes = value;
    else if (flag === "--cpv") options.cpv = value;
    else if (flag === "--min-lead-days")
      options.minimumLeadDays = Number(value);
    else if (flag === "--format") options.format = value;
    else options.output = value;
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
      options.limit <= 100
    )
  )
    throw new Error("--limit doit être un entier entre 1 et 100");
  if (
    !(
      Number.isInteger(options.maxCalls) &&
      options.maxCalls >= 0 &&
      options.maxCalls <= options.limit
    )
  )
    throw new Error("--max-calls doit être compris entre 0 et --limit");
  if (
    !(
      Number.isInteger(options.maxResults) &&
      options.maxResults >= 1 &&
      options.maxResults <= 20
    )
  )
    throw new Error("--max-results doit être un entier entre 1 et 20");
  if (
    !(
      Number.isInteger(options.minimumLeadDays) &&
      options.minimumLeadDays >= 0 &&
      options.minimumLeadDays <= 365
    )
  )
    throw new Error("--min-lead-days doit être un entier entre 0 et 365");
  if (!["markdown", "json"].includes(options.format))
    throw new Error("--format doit être markdown ou json");
  return options;
}

export async function runRadarCli(argv, { stdout = process.stdout } = {}) {
  const options = parseRadarArgs(argv);
  if (options.help) {
    stdout.write(`${HELP}\n`);
    return;
  }
  const radar = await scanMarketRadar(
    {
      identifier: options.identifier,
      activityDescription: options.activity,
      maxNotices: options.limit,
      maxCalls: options.maxCalls,
      maxResults: options.maxResults,
      departments: list(options.departments),
      contractTypes: list(options.contractTypes),
      cpv: list(options.cpv),
      minimumLeadDays: options.minimumLeadDays,
    },
    options.demo
      ? {
          provider: demoRadarProvider,
          companyResolver: demoRadarCompanyResolver,
          noticeResolver: demoRadarNoticeResolver,
          now: new Date("2026-10-04T00:00:00.000Z"),
        }
      : { provider: createJevProvider({ timeoutMs: 30_000 }) },
  );
  const output =
    options.format === "json"
      ? `${JSON.stringify(radar, null, 2)}\n`
      : renderMarketRadar(radar);
  if (options.output) {
    const target = resolve(options.output);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, output, { flag: "wx", mode: 0o600 });
  } else stdout.write(output);
}

export { HELP as RADAR_HELP };
