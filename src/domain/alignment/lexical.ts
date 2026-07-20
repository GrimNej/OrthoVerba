export function boundedLevenshtein(left: string, right: string, maximum: number): number | null {
  if (Math.abs(left.length - right.length) > maximum) return null;
  const previous = new Uint16Array(right.length + 1);
  const current = new Uint16Array(right.length + 1);
  for (let index = 0; index <= right.length; index += 1) previous[index] = index;

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    let rowMinimum = current[0] ?? leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution = (previous[rightIndex - 1] ?? 0) +
        (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      const insertion = (current[rightIndex - 1] ?? 0) + 1;
      const deletion = (previous[rightIndex] ?? 0) + 1;
      const value = Math.min(substitution, insertion, deletion);
      current[rightIndex] = value;
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > maximum) return null;
    previous.set(current);
  }

  const distance = previous[right.length] ?? maximum + 1;
  return distance <= maximum ? distance : null;
}

export function lexicalSimilarity(observed: string, expected: string): number {
  if (observed === expected) return 1;
  const longLength = Math.max(observed.length, expected.length);
  if (longLength === 0) return 1;
  if (Math.min(observed.length, expected.length) >= 6 &&
      Math.abs(observed.length - expected.length) <= 2 &&
      (observed.startsWith(expected) || expected.startsWith(observed))) {
    return Math.min(observed.length, expected.length) / longLength;
  }
  const maximum = longLength <= 4 ? 1 : longLength <= 8 ? 2 : 3;
  const distance = boundedLevenshtein(observed, expected, maximum);
  return distance === null ? 0 : 1 - distance / longLength;
}
