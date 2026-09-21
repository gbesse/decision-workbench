// Purpose: Supply explicit synthetic examples for an offline walkthrough, never a model-quality benchmark.
import { readFile } from "node:fs/promises";
export const examplePack = JSON.parse(
  await readFile(
    new URL("../../examples/support-triage.json", import.meta.url),
  ),
);
export const exampleCsv =
  'id,text,expected\n1,"I was charged twice for my subscription",billing\n2,"The API crashes when I log in",technical\n3,"I need pricing for twenty seats",sales\n4,"Hello there",review\n';
export async function syntheticProvider({ model, state, questions }) {
  const text = JSON.stringify(state).toLowerCase(),
    answers = {};
  for (const [id, q] of Object.entries(questions)) {
    if (q.type === "choice") {
      const keys = Object.keys(q.criteria);
      let chosen =
        keys.find(
          (k) =>
            /bill|refund|invoice/.test(k) &&
            /charg|bill|refund|invoice/.test(text),
        ) ??
        keys.find(
          (k) => /tech|bug/.test(k) && /crash|bug|api|error/.test(text),
        ) ??
        keys.find((k) => /sales/.test(k) && /pric|seat|buy/.test(text)) ??
        keys.at(-1);
      const strong = !/hello|unclear/.test(text);
      const p = keys.length === 1 ? 1 : strong ? 0.94 : 0.55;
      answers[id] = {
        type: "choice",
        choice: chosen,
        confidence: strong ? 0.8 : 0.1,
        probabilities: Object.fromEntries(
          keys.map((k) => [k, k === chosen ? p : (1 - p) / (keys.length - 1)]),
        ),
      };
    } else if (q.type === "noul") {
      const documentText = String(state?.document?.text ?? "").toLowerCase(),
        topicText = String(state?.topic?.description ?? "").toLowerCase(),
        civicRelevant =
          /postal|courrier|colis|livraison/.test(documentText) &&
          /postal|courrier|colis|livraison/.test(topicText);
      answers[id] = {
        type: "noul",
        noul: civicRelevant || /urgent|refund/.test(text) ? 0.92 : 0.08,
      };
    } else {
      const probabilities = Object.fromEntries(
        q.criteria.map((_, i) => [String(i), i === 0 ? 1 : 0]),
      );
      answers[id] = { type: "score", score: 0, confidence: 1, probabilities };
    }
  }
  return { model, answers };
}
