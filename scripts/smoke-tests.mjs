import { readFileSync } from "node:fs";

const tracker = readFileSync(new URL("../src/domain/alignment/tracker.ts", import.meta.url), "utf8");
const speech = readFileSync(new URL("../src/infrastructure/speech/browser-speech-adapter.ts", import.meta.url), "utf8");
const persistence = readFileSync(new URL("../src/infrastructure/persistence/indexeddb-repository.ts", import.meta.url), "utf8");
const requirements = [
  [tracker, "longestCredibleOverlap", "restart overlap guard"],
  [tracker, "stableRevisions", "revision stability"],
  [tracker, "ALTERNATIVES_PER_SLOT", "N-best alternatives"],
  [speech, "resultIndex", "cumulative recognition slots"],
  [speech, "maxAlternatives = 3", "alternative request"],
  [persistence, "#open()", "lazy IndexedDB opening"],
];
for (const [source, needle, label] of requirements) {
  if (!source.includes(needle)) throw new Error(`Missing ${label}.`);
}
console.log(`Smoke checks passed (${requirements.length} architecture contracts).`);
