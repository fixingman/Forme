"use client";
import { useMemo, useState } from "react";
import type { Listing } from "./catalog";
import { listingKey } from "./domain/recommendations.mjs";

/** Keep the browse in progress still. Eligibility stays live; taste changes apply on the next visit. */
export function useDiscoverOrder<T extends { item: Listing }>(
  rows: T[],
  context: { active: boolean; retain?: boolean; [key: string]: unknown },
): T[] {
  const { active, retain, ...preferences } = context;
  const key = active ? JSON.stringify(preferences) : null;
  const [visit, setVisit] = useState<{ key: string; rows: T[] } | null>(null);
  const current = key === null ? null : visit?.key === key ? visit : { key, rows };
  if (key === null && visit && !retain) setVisit(null);
  else if (current && current !== visit) setVisit(current);

  // Retain removed keys for Undo. Newly published/eligible pieces join the end instead of moving existing cards.
  const known = new Set(current?.rows.map((row) => listingKey(row.item)));
  const added = current ? rows.filter((row) => !known.has(listingKey(row.item))) : [];
  if (current && added.length) setVisit({ key: current.key, rows: [...current.rows, ...added] });
  return useMemo(() => {
    if (!current) return rows;
    const eligible = new Map(rows.map((row) => [listingKey(row.item), row]));
    return [...current.rows, ...added].flatMap((row) => {
      const live = eligible.get(listingKey(row.item));
      // Keep explanations still too: a new save should not change card heights. Always use the latest listing data.
      return live ? [{ ...row, item: live.item }] : [];
    });
  }, [current, rows]);
}
