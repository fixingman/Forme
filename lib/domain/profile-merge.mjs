// When another device has updated the account, "the account copy wins" - but a "Not for me" must never be lost because of it.
// A hide made on this browser since it last synced is carried across; everything else about the account copy is kept as it is.
export const MAX_DISMISSED = 1000;
export const MAX_FEEDBACK_ROWS = 200;
const time = (value) => {
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : null;
};
const asList = (value) => (Array.isArray(value) ? value : []);
/**
 * Keys this browser hid that the account copy does not have, and should keep.
 * Automatic mode (the default) is conservative: only hides dated after the last sync, because an older hide the account copy lacks
 * was probably restored on the other device on purpose. A hide with no date (made before dates were recorded) is never carried
 * automatically. `includeUndated` is for a person asking for the older copy back: it takes every hide the account copy lacks.
 * @param {{dismissed?: string[], tasteFeedback?: {key: string, hiddenAt?: string}[]}} local
 * @param {{dismissed?: string[]}} remote
 * @param {{since?: string | null, includeUndated?: boolean}} [options]
 */
export function hidesToCarry(local, remote, { since = null, includeUndated = false } = {}) {
  const remoteHidden = new Set(asList(remote?.dismissed)),
    dates = new Map(asList(local?.tasteFeedback).map((row) => [row?.key, time(row?.hiddenAt)])),
    cutoff = since == null ? null : time(since);
  return [...new Set(asList(local?.dismissed))].filter((key) => {
    if (typeof key !== "string" || remoteHidden.has(key)) return false;
    if (includeUndated) return true;
    const at = dates.get(key) ?? null;
    return at !== null && (cutoff === null || at > cutoff);
  });
}
/**
 * The account's settings with this browser's carried hides added, newest last. Nothing else changes, and nothing is removed:
 * a piece the account copy has hidden stays hidden. The caps match the app's own (last 1000 hides, last 200 remembered rows).
 */
export function mergeHides(local, remote, options) {
  const keys = hidesToCarry(local, remote, options),
    carried = new Set(keys),
    rows = new Map(asList(local?.tasteFeedback).map((row) => [row?.key, row]));
  const settings = {
    ...remote,
    dismissed: [...asList(remote?.dismissed).filter((key) => !carried.has(key)), ...keys].slice(
      -MAX_DISMISSED,
    ),
    tasteFeedback: [
      ...asList(remote?.tasteFeedback).filter((row) => !carried.has(row?.key)),
      ...keys.flatMap((key) => (rows.has(key) ? [rows.get(key)] : [])),
    ].slice(-MAX_FEEDBACK_ROWS),
  };
  return { settings, carried: keys.length };
}
export const mergedMessage = (count) =>
  `Your account was updated on another device. Those changes were applied, and the ${count === 1 ? "piece" : count + " pieces"} you hid here since were kept.`;
