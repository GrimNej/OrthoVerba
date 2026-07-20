const TRIM_EDGE = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

export function normalizeToken(value: string, locale = "en-US"): string {
  return value.normalize("NFKC").toLocaleLowerCase(locale).replace(TRIM_EDGE, "");
}
