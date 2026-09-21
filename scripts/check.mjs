// Purpose: Syntax-check maintained JavaScript without producing build artifacts.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
function visit(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (
      [
        "node_modules",
        ".git",
        ".local",
        "test-results",
        "playwright-report",
      ].includes(entry.name)
    )
      continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) visit(path);
    else if (/\.(mjs|js)$/.test(path))
      execFileSync(process.execPath, ["--check", path], { stdio: "inherit" });
  }
}
visit(".");
console.log("Source syntax checks passed.");
