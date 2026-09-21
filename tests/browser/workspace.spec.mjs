// Purpose: Verify real user workflows across all six UI modules and capture shareable synthetic screenshots.
import { test, expect } from "@playwright/test";
const open = async (page) => {
  await page.goto("/#token=browser-fixture-operator-token-24-plus");
  await expect(
    page.getByRole("heading", { name: "Des données à la décision." }),
  ).toBeVisible();
};
test("end-to-end source, table decisions, correction, policy export and plugin execution", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);
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
  await page.getByRole("button", { name: "Studio", exact: true }).click();
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
  await page.getByRole("button", { name: "StateBridge", exact: true }).click();
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
