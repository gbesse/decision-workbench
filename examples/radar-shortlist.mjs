// Verify the synthetic public-source shortlist without calling BOAMP or Jev.
import assert from "node:assert/strict";
import { runImpactCli } from "../scripts/impact.mjs";

let output = "";
await runImpactCli(["--demo", "--limit", "2", "--format", "json"], {
  stdout: {
    write(chunk) {
      output += chunk;
    },
  },
});
const watch = JSON.parse(output);
const shortlist = watch.signals.filter((signal) => signal.state === "relevant");
assert.equal(watch.signals.length <= 2, true);
assert.equal(shortlist.length > 0, true);
for (const signal of shortlist) {
  assert.equal(typeof signal.sourceUrl, "string");
  assert.equal(signal.sourceUrl.length > 0, true);
}
console.log(
  JSON.stringify(
    {
      synthetic: true,
      company: watch.company.name,
      signals: shortlist.map(({ title, state, sourceUrl }) => ({
        title,
        state,
        sourceUrl,
      })),
    },
    null,
    2,
  ),
);
