"use client";
import { formatDateTime } from "@/lib/domain/presentation.mjs";
import { useEffect, useState } from "react";
import { Clock, RefreshCw } from "lucide-react";
import { collectionFreshness } from "@/lib/domain/feed-freshness.mjs";
import { elapsedLabel, elapsedWords, nextTickMs } from "@/lib/domain/elapsed.mjs";
import type { ListingSnapshot } from "@/lib/load-listings";

/**
 * Top-bar control: a refresh icon with the time since the latest recorded collection check, counting up.
 * With `refresh` it is the "Find new pieces" button (free cost preview first); without it (hosted, where
 * collection is unavailable) it is a plain, non-interactive timestamp.
 */
export default function FeedFreshness({
  snapshot,
  refresh,
}: {
  snapshot: ListingSnapshot;
  refresh?: () => void;
}) {
  const { latest } = collectionFreshness(snapshot);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (latest === null) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      timer = setTimeout(tick, nextTickMs(current - latest));
    };
    const wake = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        tick();
      }
    };
    tick();
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [latest]);
  const age = latest === null ? null : now - latest;
  const label = age === null ? "—" : elapsedLabel(age);
  const exact = latest === null ? "No checks yet" : `Latest check ${formatDateTime(latest)}`;
  const spoken = age === null ? "No collection check yet" : `Latest check ${elapsedWords(age)}`;
  // The ticking digits are hidden from assistive tech; the description carries the same fact without announcing every second.
  return (
    <div className="topbar-refresh" role="group" aria-label="Collection freshness">
      {refresh ? (
        <button
          type="button"
          className="chip refresh-chip"
          aria-label="Find new pieces"
          aria-describedby="refresh-age"
          aria-haspopup="dialog"
          title={`Find new pieces · ${exact}`}
          onClick={refresh}
        >
          <RefreshCw aria-hidden="true" />
          <span className="refresh-age" aria-hidden="true">
            {label}
          </span>
        </button>
      ) : (
        <span className="chip refresh-chip static" title={exact}>
          <Clock aria-hidden="true" />
          <span className="refresh-age" aria-hidden="true">
            {label}
          </span>
        </span>
      )}
      <span id="refresh-age" className="sr-only">
        {spoken}
      </span>
    </div>
  );
}
