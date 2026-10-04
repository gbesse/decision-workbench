#!/usr/bin/env node
// Purpose: Dispatch the installable Workbench and jev-france command names to the local server or one-shot civic CLI.
const [command, ...args] = process.argv.slice(2);
try {
  if (command === "impact") {
    const { runImpactCli } = await import("./impact.mjs");
    await runImpactCli(args);
  } else if (command === "portfolio") {
    const { runPortfolioCli } = await import("./portfolio.mjs");
    await runPortfolioCli(args);
  } else {
    if (command === "serve") process.argv.splice(2, 1);
    await import("./start.mjs");
  }
} catch (error) {
  console.error(`decision-workbench: ${error.message}`);
  process.exitCode = 1;
}
