#!/usr/bin/env node
// Purpose: Run a bounded multi-company civic watch from a reusable JSON manifest.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createJevProvider } from "@gbesse/decisionpacks";
import {
  renderCivicPortfolioDigest,
  scanCivicPortfolio,
} from "../packages/civic/index.mjs";
import {
  demoCompanyResolver,
  demoDocumentResolver,
} from "../packages/civic/fixtures.mjs";
import { syntheticProvider } from "../packages/studio/fixtures.mjs";

const HELP = `jev-france portfolio --input companies.json [options]

Le fichier contient un tableau de {identifier, activityDescription, maxDocuments, since?}.

Options:
  --input CHEMIN       manifeste de 1 à 20 entreprises
  --max-calls N        plafond global avant démarrage, 1 à 100 (défaut : 20)
  --format markdown|json  sortie standard (défaut : markdown)
  --output CHEMIN      écrire dans un nouveau fichier au lieu de stdout
  --checkpoint CHEMIN  réutiliser puis remplacer l’état privé du portefeuille
  --demo               sources et décisions synthétiques, aucun réseau
  --help               afficher cette aide`;

export function parsePortfolioArgs(argv) {
  const options = {
    input: null,
    maxCalls: 20,
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
        "--input",
        "--max-calls",
        "--format",
        "--output",
        "--checkpoint",
      ].includes(flag)
    )
      throw new Error(`Option inconnue : ${flag}`);
    const value = argv[++index];
    if (value === undefined) throw new Error(`${flag} attend une valeur`);
    if (flag === "--input") options.input = value;
    else if (flag === "--max-calls") options.maxCalls = Number(value);
    else if (flag === "--format") options.format = value;
    else if (flag === "--output") options.output = value;
    else options.checkpoint = value;
  }
  if (options.help) return options;
  if (!options.input) throw new Error("--input est requis");
  if (
    !(
      Number.isInteger(options.maxCalls) &&
      options.maxCalls >= 1 &&
      options.maxCalls <= 100
    )
  )
    throw new Error("--max-calls doit être un entier entre 1 et 100");
  if (!["markdown", "json"].includes(options.format))
    throw new Error("--format doit être markdown ou json");
  return options;
}

async function readJson(path, missing = undefined) {
  try {
    return JSON.parse(await readFile(resolve(path), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && missing !== undefined) return missing;
    if (error instanceof SyntaxError)
      throw new Error(`JSON invalide dans ${path}`);
    throw error;
  }
}

async function replacePrivateJson(path, value) {
  if (!path) return;
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporary, target);
}

export async function runPortfolioCli(argv, { stdout = process.stdout } = {}) {
  const options = parsePortfolioArgs(argv);
  if (options.help) {
    stdout.write(`${HELP}\n`);
    return;
  }
  const manifest = await readJson(options.input);
  const companies = Array.isArray(manifest) ? manifest : manifest.companies;
  const previousPortfolio = options.checkpoint
    ? await readJson(options.checkpoint, null)
    : null;
  const portfolio = await scanCivicPortfolio(companies, {
    maxCalls: options.maxCalls,
    previousPortfolio,
    ...(options.demo
      ? {
          provider: syntheticProvider,
          companyResolver: demoCompanyResolver,
          documentResolver: demoDocumentResolver,
        }
      : { provider: createJevProvider({ timeoutMs: 30_000 }) }),
  });
  await replacePrivateJson(options.checkpoint, portfolio);
  const output =
    options.format === "json"
      ? `${JSON.stringify(portfolio, null, 2)}\n`
      : renderCivicPortfolioDigest(portfolio);
  if (options.output) {
    const target = resolve(options.output);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, output, { flag: "wx", mode: 0o600 });
  } else stdout.write(output);
}

export { HELP as PORTFOLIO_HELP };
