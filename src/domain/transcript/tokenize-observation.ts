import { normalizeToken } from "../script/normalize-token";
import type { ObservedToken, RecognitionAlternativeData } from "./types";

const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;

export function tokenizeObservation(
  alternative: RecognitionAlternativeData,
  locale = "en-US",
): readonly ObservedToken[] {
  const tokens: ObservedToken[] = [];
  for (const match of alternative.transcript.matchAll(WORD_PATTERN)) {
    const raw = match[0];
    const normalized = normalizeToken(raw, locale);
    if (normalized.length === 0) continue;
    tokens.push({
      raw,
      normalized,
      confidence: alternative.confidence,
      alternativeRank: alternative.rank,
    });
  }
  return tokens;
}
