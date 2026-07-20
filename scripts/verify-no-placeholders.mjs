import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src/", import.meta.url));
const pattern = /\b(?:TODO|FIXME|not implemented)\b/i;
const violations = [];
function walk(path) {
  for (const name of readdirSync(path)) {
    const target = join(path, name);
    if (statSync(target).isDirectory()) walk(target);
    else if (/\.(ts|tsx|css)$/.test(name) && pattern.test(readFileSync(target, "utf8"))) violations.push(target);
  }
}
walk(root);
if (violations.length > 0) {
  console.error(`Placeholder language found:\n${violations.join("\n")}`);
  process.exit(1);
}
console.log("No production placeholder markers found.");
