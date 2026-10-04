// Purpose: Provide an explicit, network-free Marchés Radar walkthrough with no model-quality claim.
import { demoCivicCompany } from "../civic/fixtures.mjs";

const base = {
  kind: "procurement-notice",
  buyer: "Métropole de démonstration",
  departments: ["75", "92"],
  contractTypes: ["SERVICES"],
  deadline: "2099-12-31T12:00:00.000Z",
  date: "2026-09-20T12:00:00.000Z",
  source: "BOAMP · démonstration hors ligne",
};

export const demoRadarNotices = [
  {
    ...base,
    id: "demo-boamp-postal-1",
    title: "Distribution de plis et colis pour un réseau de collectivités",
    text: "Distribution quotidienne de courrier et colis, suivi des envois et logistique du dernier kilomètre.",
    descriptors: ["Services postaux", "Logistique"],
    cpv: ["64100000"],
    sourceUrl: "https://www.boamp.fr/pages/avis/?q=idweb:demo-boamp-postal-1",
  },
  {
    ...base,
    id: "demo-boamp-consulting-1",
    title: "Étude de réorganisation d’un réseau de points de contact",
    text: "Étude amont et recommandations ; les moyens opérationnels attendus ne sont pas détaillés.",
    descriptors: ["Conseil", "Réseau"],
    cpv: ["79400000"],
    sourceUrl:
      "https://www.boamp.fr/pages/avis/?q=idweb:demo-boamp-consulting-1",
  },
  {
    ...base,
    id: "demo-boamp-medical-1",
    title: "Fourniture de dispositifs de chirurgie spécialisée",
    text: "Fourniture de dispositifs médicaux implantables et assistance clinique.",
    descriptors: ["Dispositifs médicaux"],
    cpv: ["33100000"],
    sourceUrl: "https://www.boamp.fr/pages/avis/?q=idweb:demo-boamp-medical-1",
  },
  {
    ...base,
    id: "demo-boamp-expired-1",
    title: "Transport urgent de plis administratifs",
    text: "Transport urgent de plis administratifs.",
    deadline: "2020-01-01T12:00:00.000Z",
    descriptors: ["Transport"],
    cpv: ["64120000"],
    sourceUrl: "https://www.boamp.fr/pages/avis/?q=idweb:demo-boamp-expired-1",
  },
];

export const demoRadarCompanyResolver = async () =>
  structuredClone(demoCivicCompany);
export const demoRadarNoticeResolver = async ({ limit = 20 } = {}) =>
  structuredClone(demoRadarNotices.slice(0, limit));

export async function demoRadarProvider({ model, state, questions }) {
  const id = state.notice.id;
  const expected = id.includes("postal")
    ? "pursue"
    : id.includes("consulting")
      ? "investigate"
      : "ignore";
  const score =
    expected === "pursue" ? 2.85 : expected === "ignore" ? 0.2 : 1.7;
  const fitProbabilities =
    expected === "pursue"
      ? { 0: 0.01, 1: 0.02, 2: 0.08, 3: 0.89 }
      : expected === "ignore"
        ? { 0: 0.84, 1: 0.14, 2: 0.01, 3: 0.01 }
        : { 0: 0.1, 1: 0.25, 2: 0.5, 3: 0.15 };
  return {
    model,
    answers: {
      fit: {
        type: questions.fit.type,
        score,
        confidence: Math.max(...Object.values(fitProbabilities)),
        probabilities: fitProbabilities,
      },
      blocker: {
        type: questions.blocker.type,
        choice: expected === "investigate" ? "unknown" : "none",
        confidence: expected === "investigate" ? 0.55 : 0.9,
        probabilities:
          expected === "investigate"
            ? {
                none: 0.3,
                deadline: 0.03,
                qualification: 0.04,
                geography: 0.03,
                capacity: 0.05,
                unknown: 0.55,
              }
            : {
                none: 0.9,
                deadline: 0.02,
                qualification: 0.02,
                geography: 0.02,
                capacity: 0.02,
                unknown: 0.02,
              },
      },
    },
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}
