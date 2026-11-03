import { availability } from "./data-trust.mjs";
/**
 * Splits saved pieces into the ones still worth showing and the ones a provider check has confirmed are gone (sold, or removed or
 * hidden on Vinted). Only a provider check counts: a piece that merely stopped appearing in searches is not "gone" (absence from a
 * limited search is not proof of sale), and a reserved piece may come back, so both stay with the rest. Order is kept.
 * @template {{source?: string}} T @param {T[]} items @returns {{available: T[], gone: T[]}}
 */
export function splitSaved(items) {
  const available = [],
    gone = [];
  for (const item of items ?? []) {
    const state = item?.source ? availability(item).state : "unknown";
    (state === "sold" || state === "unavailable" ? gone : available).push(item);
  }
  return { available, gone };
}
