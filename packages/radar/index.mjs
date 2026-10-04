// Purpose: Turn a French company profile and official BOAMP notices into one bounded, reviewable opportunity inbox.
import {
  RADAR_POLICY_VERSION,
  buildOpportunityRadar,
  fetchBoampNotices,
  fingerprintNotice,
  renderOpportunityRadar,
} from "@gbesse/jev-marches";
import { ensure, snapshot } from "../core/contracts.mjs";
import { fetchCompanyProfile } from "../civic/index.mjs";

const stringList = (value, label) => {
  if (value === undefined || value === null) return undefined;
  ensure(Array.isArray(value), `${label} doit être une liste`);
  const result = value.map((item) => String(item).trim()).filter(Boolean);
  ensure(result.length === value.length, `${label} contient une valeur vide`);
  return result;
};

const jevMarchesProvider = (provider) => ({
  decide: ({ state, questions }) =>
    provider({ model: "jev-1.13.0", state, questions }),
});

export function createOpportunityProfile(
  company,
  activityDescription,
  options = {},
) {
  ensure(
    typeof activityDescription === "string" &&
      activityDescription.trim().length >= 10 &&
      activityDescription.length <= 2_000,
    "Décrivez l’activité en 10 à 2 000 caractères",
  );
  const minimumLeadDays = options.minimumLeadDays ?? 7;
  ensure(
    Number.isInteger(minimumLeadDays) &&
      minimumLeadDays >= 0 &&
      minimumLeadDays <= 365,
    "Le délai minimal doit être un entier entre 0 et 365 jours",
  );
  const maxEstimatedValue = options.maxEstimatedValue;
  ensure(
    maxEstimatedValue === undefined ||
      (Number.isFinite(maxEstimatedValue) && maxEstimatedValue > 0),
    "Le montant maximal doit être un nombre positif",
  );
  const profile = {
    capabilities: activityDescription.trim(),
    activityCode: company.activityCode ?? null,
    minimumLeadDays,
  };
  for (const [key, value] of [
    ["departments", stringList(options.departments, "departments")],
    ["contractTypes", stringList(options.contractTypes, "contractTypes")],
    ["cpv", stringList(options.cpv, "cpv")],
    ["excludedBuyers", stringList(options.excludedBuyers, "excludedBuyers")],
    ["maxEstimatedValue", maxEstimatedValue],
  ])
    if (value !== undefined) profile[key] = value;
  return snapshot(profile);
}

/** Resolve the company, load a bounded BOAMP window, then apply the versioned Marchés Radar policy. */
export async function scanMarketRadar(
  {
    identifier,
    activityDescription,
    maxNotices = 100,
    maxCalls = 10,
    maxResults = 5,
    departments,
    contractTypes,
    cpv,
    excludedBuyers,
    minimumLeadDays = 7,
    maxEstimatedValue,
    previousRadar = null,
  },
  {
    provider,
    companyResolver = fetchCompanyProfile,
    noticeResolver = fetchBoampNotices,
    now = new Date(),
  } = {},
) {
  ensure(typeof provider === "function", "Un fournisseur Jev est requis");
  ensure(
    Number.isInteger(maxNotices) && maxNotices >= 1 && maxNotices <= 100,
    "Analysez entre 1 et 100 avis",
  );
  ensure(
    Number.isInteger(maxCalls) && maxCalls >= 0 && maxCalls <= maxNotices,
    "Le budget Jev doit être compris entre 0 et le nombre d’avis",
  );
  ensure(
    Number.isInteger(maxResults) && maxResults >= 1 && maxResults <= 20,
    "Présentez entre 1 et 20 opportunités",
  );
  const company = await companyResolver(identifier);
  const profile = createOpportunityProfile(company, activityDescription, {
    departments,
    contractTypes,
    cpv,
    excludedBuyers,
    minimumLeadDays,
    maxEstimatedValue,
  });
  const notices = await noticeResolver({ limit: maxNotices });
  ensure(Array.isArray(notices), "La source BOAMP doit retourner une liste");
  const previousById = new Map(
    (previousRadar?.decisions ?? []).map((row) => [row.noticeId, row]),
  );
  const canReuseAssessments =
    previousRadar?.policyVersion === RADAR_POLICY_VERSION &&
    JSON.stringify(previousRadar?.profile) === JSON.stringify(profile);
  const unchangedPrevious = new Map();
  for (const notice of notices) {
    const previous = previousById.get(notice.id);
    if (previous?.evidence?.fingerprint === fingerprintNotice(notice))
      unchangedPrevious.set(notice.id, previous);
  }
  const previousAssessments = canReuseAssessments
    ? Object.fromEntries(
        [...unchangedPrevious].map(([id, row]) => [id, row.assessment]),
      )
    : {};
  const sourceWindowUnchanged =
    canReuseAssessments &&
    previousRadar.decisions.length === notices.length &&
    unchangedPrevious.size === notices.length;
  const radar = await buildOpportunityRadar(
    notices,
    profile,
    jevMarchesProvider(provider),
    {
      maxCalls: sourceWindowUnchanged ? 0 : maxCalls,
      maxResults,
      now,
      previousAssessments,
    },
  );
  let outcomesPreserved = 0;
  const decisions = radar.decisions.map((row) => {
    const outcome = unchangedPrevious.get(row.noticeId)?.operatorOutcome;
    if (!outcome) return row;
    outcomesPreserved++;
    return { ...row, operatorOutcome: outcome };
  });
  const byId = new Map(decisions.map((row) => [row.noticeId, row]));
  return snapshot({
    ...radar,
    budget: { ...radar.budget, maxCalls },
    decisions,
    opportunities: radar.opportunities.map((row) => byId.get(row.noticeId)),
    company,
    activityDescription: activityDescription.trim(),
    profile,
    maxNotices,
    maxResults,
    sourceWindow: {
      received: notices.length,
      officialSources: [...new Set(notices.map((notice) => notice.source))],
    },
    delta: {
      analyzed: radar.usage.requests,
      reused: radar.budget.reusedNotices,
      deferred: radar.budget.deferredNotices,
      outcomesPreserved,
    },
    disclaimer:
      "Décision de prospection à valider humainement ; ce radar ne garantit ni l’éligibilité ni l’attribution d’un marché.",
  });
}

export function recordOpportunityOutcome(
  radar,
  { noticeId, stage, note = "" },
  now = new Date(),
) {
  ensure(
    ["reviewed", "qualified", "bid", "won", "lost", "dismissed"].includes(
      stage,
    ),
    "Étape de suivi inconnue",
  );
  ensure(typeof note === "string" && note.length <= 2_000, "Note trop longue");
  ensure(
    radar.decisions.some((row) => row.noticeId === noticeId),
    "Opportunité inconnue",
  );
  const outcome = { stage, note, at: new Date(now).toISOString() };
  const update = (row) =>
    row.noticeId === noticeId ? { ...row, operatorOutcome: outcome } : row;
  return snapshot({
    ...radar,
    decisions: radar.decisions.map(update),
    opportunities: radar.opportunities.map(update),
  });
}

export function renderMarketRadar(radar) {
  const report = renderOpportunityRadar(radar, {
    companyName: radar.company.name,
  });
  const source = radar.company.sourceUrl
    ? `[Profil officiel de l’entreprise](${radar.company.sourceUrl})`
    : "Profil officiel non renseigné";
  return report.replace(
    "\n\n",
    `\n\n${source} · ${radar.sourceWindow.received} avis reçus de la fenêtre BOAMP.\n\n`,
  );
}
