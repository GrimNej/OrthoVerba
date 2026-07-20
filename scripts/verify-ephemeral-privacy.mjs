import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src/", import.meta.url));
const violations = [];
function walk(path) {
  for (const name of readdirSync(path)) {
    const target = join(path, name);
    if (statSync(target).isDirectory()) walk(target);
    else if (/\.(ts|tsx|js|jsx)$/.test(name)) {
      const source = readFileSync(target, "utf8");
      for (const forbidden of ["document.cookie", "localStorage", "sessionStorage"]) {
        if (source.includes(forbidden)) violations.push(`${target}: ${forbidden}`);
      }
    }
  }
}
walk(root);
if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}
console.log("Ephemeral privacy scan passed: no cookies or web-storage access.");
