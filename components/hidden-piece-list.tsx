"use client";
import Link from "next/link";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { Search, X, ChevronDown } from "lucide-react";
import { images } from "@/lib/catalog";
import {
  PAGE_SIZE,
  filterByReason,
  reasonCounts,
  searchHidden,
} from "@/lib/domain/hidden-pieces.mjs";
import { REASON_LABELS } from "@/lib/domain/dislike-reasons.mjs";
import { ReasonOptions } from "./dislike-reason";
import type { DislikeReason } from "@/lib/use-learning";
import ProductPhoto from "./product-photo";

export type HiddenEntry = {
  key: string;
  status: "collection" | "remembered" | "bare";
  brand: string;
  title: string;
  id?: number;
  imageUrl?: string;
  image?: string;
  sourceUrl?: string;
  label?: string;
  reason?: string;
};
/** Search appears once the list is long enough that scanning stops being quicker than typing. */
export const SEARCH_FROM = 6;

const photoOf = (entry: HiddenEntry) =>
  entry.imageUrl ?? (entry.image ? images[entry.image as keyof typeof images] : undefined);
const nameOf = (entry: HiddenEntry) => entry.title || entry.brand || entry.label || "Hidden piece";

/**
 * Hidden pieces as recognisable rows: thumbnail, brand and title, a plain note when the piece is no longer in the
 * collection, a way back to the listing, and Restore. Used by Settings and by the Collection tools review.
 */
export default function HiddenPieceList({
  entries,
  restore,
  changeReason,
}: {
  entries: HiddenEntry[];
  restore: (key: string) => void;
  changeReason?: (key: string, reason: DislikeReason) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const list = useRef<HTMLUListElement>(null),
    restoreFocus = useRef(false);
  const closeEditor = () => {
    restoreFocus.current = true;
    setEditing(null);
  };
  useLayoutEffect(() => {
    if (editing || !restoreFocus.current) return;
    restoreFocus.current = false;
    // A reason/search filter may remove the edited row. Keep keyboard focus in
    // Hidden pieces instead of returning it to a button that has just unmounted.
    const target = trigger.current?.isConnected ? trigger.current : list.current;
    target?.focus({ preventScroll: true });
  }, [editing, entries]);
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [limit, setLimit] = useState(PAGE_SIZE),
    searchId = useId();
  const reasons = reasonCounts(entries),
    // A filter whose last piece was restored or re-reasoned no longer exists: fall back to everything.
    active = reasons.some((option) => option.value === filter) ? filter : "all",
    narrowed = !!query.trim() || active !== "all",
    matches = searchHidden(filterByReason(entries, active), query) as HiddenEntry[],
    shown = matches.slice(0, limit);
  const search = (value: string) => {
    setQuery(value);
    setEditing(null);
    setLimit(PAGE_SIZE);
  };
  return (
    <>
      {entries.length >= SEARCH_FROM && (
        <div className="hidden-search">
          <label className="sr-only" htmlFor={searchId}>
            Search hidden pieces
          </label>
          <Search aria-hidden="true" />
          <input
            id={searchId}
            type="search"
            value={query}
            placeholder="Search by brand or title"
            autoComplete="off"
            onChange={(event) => search(event.target.value)}
          />
          {query && (
            <button
              type="button"
              className="icon-button hidden-search-clear"
              aria-label="Clear search"
              onClick={() => search("")}
            >
              <X aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {entries.length >= SEARCH_FROM && reasons.length > 1 && (
        <div className="hidden-filter" role="group" aria-label="Filter by reason">
          {[{ value: "all", label: "All", count: entries.length }, ...reasons].map((option) => (
            <button
              key={option.value}
              type="button"
              className={`chip ${active === option.value ? "active" : ""}`}
              aria-pressed={active === option.value}
              onClick={() => {
                setFilter(option.value);
                setEditing(null);
                setLimit(PAGE_SIZE);
              }}
            >
              {option.label} <span className="hidden-filter-count">{option.count}</span>
            </button>
          ))}
        </div>
      )}
      {narrowed && (
        <p className="small hidden-search-status" role="status">
          {matches.length
            ? `Showing ${matches.length} of ${entries.length}`
            : query.trim()
              ? `No hidden pieces match “${query.trim()}”.`
              : "No hidden pieces with this reason."}
        </p>
      )}
      <ul ref={list} className="hidden-piece-list" tabIndex={-1} aria-label="Hidden pieces">
        {shown.map((entry) => (
          <li className="hidden-piece" key={entry.key}>
            <div className="hidden-piece-photo">
              <ProductPhoto compact src={photoOf(entry)} alt="" />
            </div>
            <div className="hidden-piece-text">
              {entry.status === "collection" && entry.id !== undefined ? (
                <Link className="hidden-piece-name" href={`/items/${entry.id}`}>
                  <strong>{entry.brand}</strong>
                  <span>{entry.title}</span>
                </Link>
              ) : (
                <span className="hidden-piece-name">
                  <strong>{entry.brand || entry.label}</strong>
                  {entry.title && <span>{entry.title}</span>}
                </span>
              )}
              {!changeReason && entry.reason && (
                <span className="hidden-piece-reason">
                  {REASON_LABELS[entry.reason as keyof typeof REASON_LABELS]}
                </span>
              )}
              {changeReason && (
                <button
                  type="button"
                  className="hidden-reason-trigger"
                  aria-label={`Edit reason for ${nameOf(entry)}`}
                  aria-expanded={editing === entry.key}
                  aria-controls={editing === entry.key ? `${searchId}-${entry.key}` : undefined}
                  onClick={(event) => {
                    trigger.current = event.currentTarget;
                    setEditing(editing === entry.key ? null : entry.key);
                  }}
                >
                  <span className={entry.reason ? "hidden-piece-reason" : undefined}>
                    {entry.reason
                      ? REASON_LABELS[entry.reason as keyof typeof REASON_LABELS]
                      : "Add reason"}
                  </span>
                  <ChevronDown aria-hidden="true" />
                </button>
              )}
              {entry.status === "remembered" && (
                <span className="hidden-piece-note">No longer in your collection</span>
              )}
              {entry.status === "bare" && (
                <span className="hidden-piece-note">
                  Photo and title weren’t saved for this older piece
                </span>
              )}
              {entry.status !== "collection" && entry.sourceUrl && (
                <a
                  className="hidden-piece-link"
                  href={entry.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open on Vinted ↗
                </a>
              )}
            </div>
            <button
              className="textbutton"
              aria-label={`Restore ${nameOf(entry)}`}
              onClick={() => restore(entry.key)}
            >
              Restore
            </button>
            {changeReason && editing === entry.key && (
              <div
                className="hidden-reason-editor"
                id={`${searchId}-${entry.key}`}
                role="region"
                aria-label={`Reason for ${nameOf(entry)}`}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    closeEditor();
                  }
                }}
              >
                <ReasonOptions
                  reason={entry.reason}
                  change={(reason) => {
                    changeReason(entry.key, reason);
                    closeEditor();
                  }}
                />
                <div className="reason-footer">
                  <button className="textbutton" onClick={closeEditor}>
                    Not now
                  </button>
                  {entry.reason && (
                    <button
                      className="textbutton"
                      onClick={() => {
                        changeReason(entry.key, "unspecified");
                        closeEditor();
                      }}
                    >
                      Remove reason
                    </button>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {matches.length > shown.length && (
        <button
          type="button"
          className="btn light hidden-more"
          onClick={() => setLimit((value) => value + PAGE_SIZE)}
        >
          Show {Math.min(PAGE_SIZE, matches.length - shown.length)} more
          <span className="hidden-filter-count">{matches.length - shown.length} left</span>
        </button>
      )}
    </>
  );
}
