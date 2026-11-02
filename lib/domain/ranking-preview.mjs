// Shared, browser-safe rule for applying a model's ranking to a fixed pool of pieces. (This file's name dates from the removed
// private ranking preview; the learning code still uses this one rule, so it stays.)
export function normalizePreviewRanking(ranking, keys) {
  const allowed = new Set(keys),
    seen = new Set(),
    result = [];
  for (const row of ranking ?? []) {
    if (!row || !allowed.has(row.key) || seen.has(row.key)) throw Error("Invalid model ranking");
    seen.add(row.key);
    result.push(row.key);
  }
  return {
    keys: [...result, ...keys.filter((key) => !seen.has(key))],
    missing: keys.length - result.length,
  };
}
