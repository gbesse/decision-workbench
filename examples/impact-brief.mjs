// Purpose: Turn the existing synthetic civic scan into a compact, source-linked integration example.
import { runImpactCli } from "../scripts/impact.mjs";

let output = "";
await runImpactCli(["--demo", "--limit", "3", "--format", "json"], {
  stdout: {
    write(chunk) {
      output += chunk;
    },
  },
});
const watch = JSON.parse(output);
console.log(
  JSON.stringify(
    {
      synthetic: true,
      company: watch.company.name,
      counts: watch.counts,
      signals: watch.signals.map(({ title, state, sourceUrl }) => ({
        title,
        state,
        sourceUrl,
      })),
    },
    null,
    2,
  ),
);
