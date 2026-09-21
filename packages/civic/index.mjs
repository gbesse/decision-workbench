// Purpose: Build a sourced French-company watch from the official business registry and Assemblée nationale feed.
import { XMLParser } from "fast-xml-parser";
import { evaluateDocument } from "@gbesse/jev-hemicycle";
import { ensure, snapshot } from "../core/contracts.mjs";

export const COMPANY_API = "https://recherche-entreprises.api.gouv.fr/search";
export const ASSEMBLY_FEED =
  "https://www2.assemblee-nationale.fr/feeds/detail/documents-parlementaires";

function cleanIdentifier(value) {
  const identifier = String(value ?? "").replace(/\s/g, "");
  ensure(
    /^\d{9}(\d{5})?$/.test(identifier),
    "Saisissez un SIREN à 9 chiffres ou un SIRET à 14 chiffres",
  );
  return identifier;
}

async function fetchText(
  url,
  { fetchImpl = globalThis.fetch, timeoutMs = 15_000 } = {},
) {
  const response = await fetchImpl(url, {
    headers: {
      accept: "application/json, application/xml;q=0.9",
      "user-agent":
        "decision-workbench/0.4 (+https://github.com/gbesse/decision-workbench)",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok)
    throw new Error(`Source officielle indisponible (${response.status})`);
  return response;
}

function establishments(company) {
  return [company.siege, ...(company.matching_etablissements ?? [])].filter(
    Boolean,
  );
}

/** Resolve an exact public identifier through the open API that powers Annuaire des Entreprises. */
export async function fetchCompanyProfile(identifier, options = {}) {
  identifier = cleanIdentifier(identifier);
  const siren = identifier.slice(0, 9);
  const load = async (query) => {
    const url = new URL(COMPANY_API);
    url.searchParams.set("q", query);
    url.searchParams.set("per_page", "10");
    return (await (await fetchText(url, options)).json()).results ?? [];
  };
  let results = await load(identifier);
  if (!results.length && identifier.length === 14) results = await load(siren);
  const company = results.find((entry) => String(entry.siren) === siren);
  ensure(company, "Entreprise introuvable dans l’Annuaire des Entreprises");
  const establishment =
    identifier.length === 14
      ? establishments(company).find(
          (entry) => String(entry.siret) === identifier,
        )
      : company.siege;
  ensure(establishment, "Établissement introuvable pour ce SIRET");
  return snapshot({
    identifier,
    siren: String(company.siren),
    siret: String(establishment.siret),
    name:
      company.nom_complet ||
      company.nom_raison_sociale ||
      String(company.siren),
    activityCode:
      establishment.activite_principale || company.activite_principale || null,
    activitySection: company.section_activite_principale || null,
    category: company.categorie_entreprise || null,
    address: establishment.adresse || null,
    department: establishment.departement || null,
    active:
      establishment.etat_administratif === "A" &&
      company.etat_administratif !== "C",
    updatedAt:
      company.date_mise_a_jour || company.date_mise_a_jour_insee || null,
    sourceUrl: `https://annuaire-entreprises.data.gouv.fr/entreprise/${company.siren}`,
    source: "Annuaire des Entreprises · DINUM",
  });
}

const array = (value) =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const plain = (value) => {
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (value && typeof value === "object")
    return String(value["#text"] ?? value.__cdata ?? "");
  return "";
};
const stripMarkup = (value) =>
  plain(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

function officialAssemblyUrl(value) {
  const url = new URL(plain(value));
  ensure(
    url.protocol === "https:" &&
      (url.hostname === "assemblee-nationale.fr" ||
        url.hostname.endsWith(".assemblee-nationale.fr")),
    "Le flux contient un lien externe non autorisé",
  );
  return url.href;
}

/** Fetch and normalize the official Assemblée nationale publications RSS feed. */
export async function fetchParliamentaryDocuments({
  limit = 20,
  ...options
} = {}) {
  ensure(
    Number.isInteger(limit) && limit >= 1 && limit <= 50,
    "La limite de documents doit être comprise entre 1 et 50",
  );
  const response = await fetchText(ASSEMBLY_FEED, options);
  const xml = await response.text();
  const parsed = new XMLParser({
    ignoreAttributes: false,
    processEntities: true,
  }).parse(xml);
  const items = array(parsed?.rss?.channel?.item);
  const seen = new Set();
  const documents = [];
  for (const item of items) {
    const sourceUrl = officialAssemblyUrl(item.link);
    const id = plain(item.guid) || sourceUrl;
    if (seen.has(id)) continue;
    seen.add(id);
    const title = stripMarkup(item.title);
    const description = stripMarkup(item.description);
    if (!title) continue;
    documents.push({
      id: String(id).slice(0, 500),
      kind: "parliamentary-publication",
      title: title.slice(0, 1000),
      text: `${title}\n${description}`.slice(0, 20_000),
      sourceUrl,
      date: item.pubDate ? new Date(plain(item.pubDate)).toISOString() : null,
      source: "Assemblée nationale",
    });
    if (documents.length === limit) break;
  }
  ensure(
    documents.length > 0,
    "Le flux de l’Assemblée nationale ne contient aucun document exploitable",
  );
  return documents;
}

function hemicycleProvider(provider) {
  return {
    decide: ({ state, questions }) =>
      provider({ model: "jev-1.13.0", state, questions }),
  };
}

/** Resolve a company, fetch official publications and classify every source with the existing jev-hemicycle adapter. */
export async function scanCivicWatch(
  { identifier, activityDescription, maxDocuments = 10, previousWatch = null },
  {
    provider,
    companyResolver = fetchCompanyProfile,
    documentResolver = fetchParliamentaryDocuments,
    onThreshold = 0.72,
    offThreshold = 0.2,
  } = {},
) {
  ensure(typeof provider === "function", "Un fournisseur Jev est requis");
  ensure(
    typeof activityDescription === "string" &&
      activityDescription.trim().length >= 10 &&
      activityDescription.length <= 2000,
    "Décrivez l’activité surveillée en 10 à 2 000 caractères",
  );
  ensure(
    Number.isInteger(maxDocuments) && maxDocuments >= 1 && maxDocuments <= 20,
    "Analysez entre 1 et 20 documents",
  );
  const company = await companyResolver(identifier);
  const documents = await documentResolver({ limit: maxDocuments });
  const previous = new Map(
    (previousWatch?.signals ?? []).map((signal) => [signal.id, signal.state]),
  );
  const topic = {
    id: company.siren,
    description: `${activityDescription.trim()} Entreprise: ${company.name}. Code APE/NAF: ${company.activityCode ?? "non renseigné"}. Département: ${company.department ?? "non renseigné"}.`,
  };
  const signals = [];
  const usage = { input_tokens: 0, output_tokens: 0, requests: 0 };
  for (const source of documents) {
    const result = await evaluateDocument(
      source,
      topic,
      hemicycleProvider(provider),
      previous.get(source.id) ?? "unknown",
      { onThreshold, offThreshold },
    );
    usage.input_tokens += result.usage?.input_tokens ?? 0;
    usage.output_tokens += result.usage?.output_tokens ?? 0;
    usage.requests++;
    signals.push({
      id: result.document.id,
      title: result.document.title,
      excerpt: result.document.text
        .slice(result.document.title.length)
        .trim()
        .slice(0, 1000),
      source: source.source,
      sourceUrl: result.document.sourceUrl,
      date: result.document.date,
      probability: result.probability,
      state: result.state,
      uncertain: result.uncertain,
      transition: result.transition,
      operatorReview: null,
    });
  }
  const counts = Object.fromEntries(
    ["relevant", "unknown", "irrelevant"].map((state) => [
      state,
      signals.filter((signal) => signal.state === state).length,
    ]),
  );
  return snapshot({
    schemaVersion: 1,
    company,
    activityDescription: activityDescription.trim(),
    sources: [
      { name: company.source, url: company.sourceUrl },
      {
        name: "Assemblée nationale · publications parlementaires",
        url: ASSEMBLY_FEED,
      },
    ],
    scannedAt: new Date().toISOString(),
    disclaimer:
      "Signal de veille à relire : ce résultat ne décrit pas le droit en vigueur et ne constitue pas un conseil juridique.",
    counts,
    signals,
    usage,
  });
}

export function reviewCivicSignal(watch, { signalId, decision, note = "" }) {
  ensure(
    ["confirmed", "dismissed", "pending"].includes(decision),
    "Décision de revue inconnue",
  );
  ensure(
    typeof note === "string" && note.length <= 2000,
    "La note de revue dépasse 2 000 caractères",
  );
  let found = false;
  const signals = watch.signals.map((signal) => {
    if (signal.id !== signalId) return signal;
    found = true;
    return {
      ...signal,
      operatorReview: {
        decision,
        note,
        actor: "local-operator",
        at: new Date().toISOString(),
      },
    };
  });
  ensure(found, "Signal de veille introuvable");
  return snapshot({ ...watch, signals });
}

export function renderCivicDigest(watch) {
  const visible = watch.signals.filter(
    (signal) =>
      signal.state !== "irrelevant" ||
      signal.operatorReview?.decision === "confirmed",
  );
  const lines = [
    `# Veille publique · ${watch.company.name}`,
    "",
    `SIREN ${watch.company.siren} · ${watch.company.activityCode ?? "activité non renseignée"} · analyse du ${watch.scannedAt.slice(0, 10)}`,
    "",
    watch.disclaimer,
    "",
  ];
  if (!visible.length)
    lines.push(
      "Aucun signal pertinent ou incertain dans les publications analysées.",
      "",
    );
  visible.forEach((signal) => {
    const review = signal.operatorReview?.decision ?? "à relire";
    lines.push(
      `## ${signal.title}`,
      "",
      `- Source : [${signal.source}](${signal.sourceUrl})`,
      `- Probabilité de pertinence : ${(signal.probability * 100).toFixed(1)} %`,
      `- État : ${signal.state} · revue : ${review}`,
      ...(signal.operatorReview?.note
        ? [`- Note : ${signal.operatorReview.note}`]
        : []),
      "",
    );
  });
  lines.push(`Profil officiel : ${watch.company.sourceUrl}`, "");
  return `${lines.join("\n")}\n`;
}
