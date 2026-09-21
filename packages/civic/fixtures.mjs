// Purpose: Provide deterministic civic data for the offline product walkthrough; no source or model claim is implied.
export const demoCivicCompany = {
  identifier: "356000000",
  siren: "356000000",
  siret: "35600000000048",
  name: "LA POSTE",
  activityCode: "53.10Z",
  activitySection: "H",
  category: "GE",
  address: "9 RUE DU COLONEL PIERRE AVIA 75015 PARIS",
  department: "75",
  active: true,
  updatedAt: "2026-09-20T00:00:00.000Z",
  sourceUrl: "https://annuaire-entreprises.data.gouv.fr/entreprise/356000000",
  source: "Annuaire des Entreprises · démonstration hors ligne",
};

export const demoCivicDocuments = [
  {
    id: "demo-postal-1",
    kind: "parliamentary-publication",
    title: "Proposition relative aux obligations des opérateurs postaux",
    text: "Le document porte sur la distribution des colis, les délais de livraison et les obligations des opérateurs postaux.",
    sourceUrl:
      "https://www.assemblee-nationale.fr/dyn/17/textes/l17b0001_proposition-loi",
    date: "2026-09-19T00:00:00.000Z",
    source: "Assemblée nationale · démonstration hors ligne",
  },
  {
    id: "demo-health-1",
    kind: "parliamentary-publication",
    title: "Rapport sur la formation des praticiens hospitaliers",
    text: "Le rapport traite de la formation médicale et de l’exercice hospitalier.",
    sourceUrl:
      "https://www.assemblee-nationale.fr/dyn/17/rapports/l17b0002_rapport-fond",
    date: "2026-09-18T00:00:00.000Z",
    source: "Assemblée nationale · démonstration hors ligne",
  },
];

export const demoCompanyResolver = async () =>
  structuredClone(demoCivicCompany);
export const demoDocumentResolver = async ({ limit = 20 } = {}) =>
  structuredClone(demoCivicDocuments.slice(0, limit));
