// Purpose: Verify real user workflows across all six UI modules and capture shareable synthetic screenshots.
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const open = async (page) => {
  await page.goto("/#token=browser-fixture-operator-token-24-plus");
  await expect(
    page.getByRole("heading", {
      name: "Quels textes peuvent toucher cette entreprise ?",
    }),
  ).toBeVisible();
};
test("company watch resolves a profile, evaluates sourced signals, records review and exports a digest", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Préremplir La Poste" }).click();
  await page.getByRole("button", { name: "Analyser les publications" }).click();
  await expect(page.getByRole("heading", { name: "LA POSTE" })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.getByRole("button", { name: "Relire" }).first().click();
  await page.getByLabel("Décision humaine").selectOption("confirmed");
  await page.getByLabel("Note", { exact: true }).fill("À transmettre");
  await page.getByRole("button", { name: "Enregistrer la revue" }).click();
  await expect(page.getByRole("button", { name: "confirmed" })).toBeVisible();
  await page.getByRole("button", { name: "Fermer le message" }).click();
  await page.getByRole("button", { name: "Actualiser la veille" }).click();
  await expect(
    page.getByText(/0 publication\(s\) analysée\(s\).*2 résultat/),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "confirmed" })).toBeVisible();
  await page.getByRole("button", { name: "Fermer le message" }).click();
  await page.screenshot({ path: "docs/workbench-civic.png", fullPage: true });
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exporter le digest Markdown" })
    .click();
  expect((await download).suggestedFilename()).toBe("veille-356000000.md");
});
test("end-to-end source, table decisions, correction, policy export and plugin execution", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);
  await page.getByRole("button", { name: "Atelier", exact: true }).click();
  await page.getByRole("button", { name: "Charger un exemple" }).click();
  await expect(
    page.getByRole("heading", { name: "Une décision par ligne." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Vérifier le mapping" }).click();
  await expect(page.getByRole("dialog")).toContainText("charged twice");
  await page
    .getByRole("button", { name: "Fermer le détail", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Évaluer les lignes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Résultats · Terminé" }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Inspecter", exact: true })
    .first()
    .click();
  await page.getByLabel("Décision humaine").selectOption("review");
  await page
    .getByLabel("Note", { exact: true })
    .fill("Needs a human follow-up");
  await page.getByRole("button", { name: "Enregistrer la revue" }).click();
  await expect(page.locator("tbody tr").first()).toContainText("review");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter CSV" }).click();
  expect((await download).suggestedFilename()).toBe("decisions.csv");
  await page.getByRole("button", { name: "Plugins", exact: true }).click();
  await page
    .locator(".plugin-card")
    .filter({ hasText: "text.normalize" })
    .getByRole("button")
    .click();
  await page.getByRole("button", { name: "Tester le plugin" }).click();
  await expect(page.locator("#plugin-result")).toContainText(
    "A document with whitespace.",
  );
  await page
    .getByRole("button", { name: "Fermer le détail", exact: true })
    .click();
  await page.getByRole("button", { name: "Atelier", exact: true }).click();
  if (await page.getByRole("button", { name: "Fermer le message" }).isVisible())
    await page.getByRole("button", { name: "Fermer le message" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "docs/workbench-studio.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("generated form and JSON agent approval produce real persisted results", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "UI Builder", exact: true }).click();
  await page.getByRole("button", { name: "Évaluer ce formulaire" }).click();
  await expect(page.locator("#form-result")).toContainText("billing");
  await page.getByRole("button", { name: "JSON Agents", exact: true }).click();
  await page.getByRole("button", { name: "Créer le workflow" }).click();
  await expect(page.getByRole("dialog")).toContainText("À valider");
  await page.getByRole("button", { name: "Approuver cette action" }).click();
  await expect(page.getByRole("dialog")).toContainText("local_result_only");
  await page.getByRole("button", { name: "Rejouer hors ligne" }).click();
  await expect(page.getByRole("dialog")).toContainText('"reproduced": true');
});
test("source uploads and mobile navigation remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.getByRole("button", { name: "Sources", exact: true }).click();
  await page.getByLabel("Choisir un document local").setInputFiles({
    name: "example.json",
    mimeType: "application/json",
    buffer: Buffer.from('[{"text":"Refund this invoice"}]'),
  });
  await page.getByRole("button", { name: "Extraire et inspecter" }).click();
  await expect(
    page.getByRole("heading", { name: "example.json" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Voir", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("/0/text");
  await page
    .getByRole("button", { name: "Fermer le détail", exact: true })
    .click();
  if (await page.getByRole("button", { name: "Fermer le message" }).isVisible())
    await page.getByRole("button", { name: "Fermer le message" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "docs/workbench-mobile.png", fullPage: true });
});
test("policy authoring and question comparison are available without a SDK", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Atelier", exact: true }).click();
  await page.getByRole("button", { name: "Nouvelle politique" }).click();
  await page.getByLabel("Identifiant", { exact: true }).fill("browser-policy");
  await page.getByLabel("Nom du pack", { exact: true }).fill("browser/policy");
  await page.getByRole("button", { name: "Créer la politique" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByLabel("Version", { exact: true }).fill("0.2.0");
  await page.getByLabel("Probabilité minimale").fill("0.99");
  await page
    .getByRole("button", { name: "Enregistrer la politique", exact: true })
    .click();
  await expect(page.getByLabel("Version", { exact: true })).toHaveValue(
    "0.2.0",
  );
  await page.getByText("Configurer une expérience", { exact: true }).click();
  await page.getByRole("button", { name: "Lancer la comparaison" }).click();
  await expect(page.getByRole("dialog")).toContainText("heldout");
  await expect(page.getByRole("dialog")).toContainText("selectedCandidate");
});

test("visual form customization persists and is reflected in evaluation and HTML export", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "UI Builder", exact: true }).click();
  await page.getByLabel("Titre", { exact: true }).fill("Assistance client");
  await page.getByLabel("Libellé", { exact: true }).fill("Votre demande");
  await page.getByLabel("Contrôle", { exact: true }).selectOption("select");
  await page
    .getByLabel("Options de liste · une par ligne")
    .fill("Refund invoice\nAPI crashes");
  await page.getByRole("button", { name: "Actualiser l’aperçu" }).click();
  await expect(page.getByLabel("Votre demande", { exact: true })).toHaveValue(
    "Refund invoice",
  );
  await expect(
    page.getByRole("button", { name: "Évaluer ce formulaire" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Enregistrer le formulaire" }).click();
  await expect(
    page.getByRole("button", { name: "Évaluer ce formulaire" }),
  ).toBeEnabled();
  await page.reload();
  await page.getByRole("button", { name: "UI Builder", exact: true }).click();
  await expect(page.getByLabel("Votre demande", { exact: true })).toHaveValue(
    "Refund invoice",
  );
  await page.getByRole("button", { name: "Évaluer ce formulaire" }).click();
  await expect(page.locator("#form-result")).toContainText("billing");
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exporter le formulaire HTML" })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("decision-form.html");
  const exported = await page.context().newPage();
  try {
    await exported.setContent(await readFile(await download.path(), "utf8"));
    await exported
      .getByLabel("Votre demande", { exact: true })
      .selectOption("API crashes");
    await exported.getByRole("button", { name: "Prepare JSON" }).click();
    await expect(exported.locator("#result")).toContainText(
      '"text": "API crashes"',
    );
  } finally {
    await exported.close();
  }
  if (await page.getByRole("button", { name: "Fermer le message" }).isVisible())
    await page.getByRole("button", { name: "Fermer le message" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/workbench-form-builder.png",
    fullPage: true,
  });
});

test("two-step workflow pauses between actions and replays both recorded results", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "JSON Agents", exact: true }).click();
  await page.getByRole("button", { name: "Exemple à deux étapes" }).click();
  await page.getByRole("button", { name: "Créer le workflow" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Étapes terminées : 0 / 2",
  );
  await page.getByRole("button", { name: "Approuver cette action" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Étapes terminées : 1 / 2",
  );
  await expect(
    page.getByRole("button", { name: "Approuver cette action" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approuver cette action" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Étapes terminées : 2 / 2",
  );
  await expect(
    page.getByRole("button", { name: "Approuver cette action" }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Rejouer hors ligne" }).click();
  await expect(page.getByRole("dialog")).toContainText('"consumedEvents": 2');
});

test("Decision Review creates a dataset from an imported trace and exports a human label", async ({
  page,
  request,
}) => {
  await open(page);
  const response = await request.post("/api/evaluate", {
    headers: { authorization: "Bearer browser-fixture-operator-token-24-plus" },
    data: { packId: "support-triage", state: { text: "charged twice" } },
  });
  const decision = await response.json();
  const example = await (
    await request.get("/api/example", {
      headers: {
        authorization: "Bearer browser-fixture-operator-token-24-plus",
      },
    })
  ).json();
  await page.getByRole("link", { name: "Revue humaine" }).click();
  await page.locator("#trace").setInputFiles({
    name: "block-trace.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        pack: example.pack,
        rows: [{ state: decision.data.state, record: decision.data.record }],
      }),
    ),
  });
  await expect(page.getByText("Modèle :")).toBeVisible();
  await page.getByLabel("Votre nom").fill("Alice");
  await page.getByLabel("Motif", { exact: true }).fill("Invoice verified");
  await page.getByRole("button", { name: "Enregistrer mon avis" }).click();
  await expect(page.getByText("Historique des avis (1)")).toBeVisible();
  await page.getByLabel("Inclure dans l’export").check();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exporter les cas sélectionnés" })
    .click();
  expect((await download).suggestedFilename()).toBe("decision-dataset.json");
});
