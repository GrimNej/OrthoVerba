import { normalizeToken } from "./normalize-token";
import type { ParsedScript, ScriptParagraph, ScriptToken } from "./types";

const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;
const COMMON_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from",
  "had", "has", "have", "he", "her", "his", "i", "if", "in", "is", "it",
  "its", "me", "my", "of", "on", "or", "our", "she", "so", "that", "the",
  "their", "them", "there", "they", "this", "to", "was", "we", "were",
  "what", "when", "where", "which", "who", "will", "with", "you", "your",
]);

interface RawToken {
  readonly raw: string;
  readonly normalized: string;
  readonly startUtf16: number;
  readonly endUtf16: number;
  readonly paragraphIndex: number;
}

function paragraphRanges(sourceText: string): readonly { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let start = 0;
  const separator = /(?:\r?\n){2,}/g;
  for (const match of sourceText.matchAll(separator)) {
    const end = match.index ?? start;
    ranges.push({ start, end });
    start = end + match[0].length;
  }
  ranges.push({ start, end: sourceText.length });
  return ranges;
}

function paragraphForOffset(
  ranges: readonly { start: number; end: number }[],
  offset: number,
): number {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const range = ranges[middle];
    if (range === undefined) break;
    if (offset < range.start) high = middle - 1;
    else if (offset > range.end) low = middle + 1;
    else return middle;
  }
  return Math.max(0, Math.min(ranges.length - 1, low));
}

export function parseScript(sourceText: string, locale = "en-US"): ParsedScript {
  if (sourceText.length > 2_000_000) {
    throw new RangeError("Script exceeds the 2,000,000-character limit.");
  }

  const ranges = paragraphRanges(sourceText);
  const rawTokens: RawToken[] = [];
  const counts = new Map<string, number>();

  for (const match of sourceText.matchAll(WORD_PATTERN)) {
    const raw = match[0];
    const startUtf16 = match.index ?? 0;
    const normalized = normalizeToken(raw, locale);
    if (normalized.length === 0) continue;
    rawTokens.push({
      raw,
      normalized,
      startUtf16,
      endUtf16: startUtf16 + raw.length,
      paragraphIndex: paragraphForOffset(ranges, startUtf16),
    });
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  const tokenCount = Math.max(1, rawTokens.length);
  const tokens: ScriptToken[] = rawTokens.map((token, index) => {
    const count = counts.get(token.normalized) ?? 1;
    const idf = Math.log((tokenCount + 1) / (count + 1)) + 1;
    const commonFactor = COMMON_WORDS.has(token.normalized) ? 0.35 : 1;
    const lengthFactor = Math.min(1.35, 0.45 + token.normalized.length / 10);
    return {
      ...token,
      index,
      informationWeight: Math.max(0.1, Math.min(4, idf * commonFactor * lengthFactor)),
    };
  });

  const paragraphs: ScriptParagraph[] = ranges.map((range, index) => {
    const paragraphTokens = tokens.filter((token) => token.paragraphIndex === index);
    return {
      index,
      startUtf16: range.start,
      endUtf16: range.end,
      firstTokenIndex: paragraphTokens[0]?.index ?? tokens.length,
      tokenCount: paragraphTokens.length,
    };
  });

  return { sourceText, locale, tokens, paragraphs };
}
