"use client";
import { useMemo } from "react";
import { hiddenEntries } from "@/lib/domain/hidden-pieces.mjs";
import type { Listing } from "@/lib/catalog";
import HiddenPieceList, { type HiddenEntry } from "./hidden-piece-list";
export default function HiddenPieces({
  keys,
  source,
  remembered = [],
  restore,
  editReason,
}: {
  keys: string[];
  source: Listing[];
  remembered?: {
    key: string;
    brand: string;
    title?: string;
    imageUrl?: string;
    sourceUrl?: string;
  }[];
  restore: (key: string) => void;
  editReason?: (key: string) => void;
}) {
  const entries = useMemo(
    () => hiddenEntries({ keys, source, remembered }) as HiddenEntry[],
    [keys, source, remembered],
  );
  return (
    <section className="panel" id="hidden-pieces">
      <h3>Hidden pieces</h3>
      <p>
        Not for me hides a piece from all your feeds and helps refine Discover. Your saves stay
        saved. Bring pieces back here.
      </p>
      {entries.length ? (
        <HiddenPieceList entries={entries} restore={restore} editReason={editReason} />
      ) : (
        <p className="small section-note">You haven’t hidden any pieces.</p>
      )}
    </section>
  );
}
