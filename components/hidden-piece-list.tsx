"use client";
import Link from "next/link";
import { useId, useState } from "react";
import { Search, X } from "lucide-react";
import { images } from "@/lib/catalog";
import { searchHidden } from "@/lib/domain/hidden-pieces.mjs";
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
  editReason,
}: {
  entries: HiddenEntry[];
  restore: (key: string) => void;
  editReason?: (key: string) => void;
}) {
  const [query, setQuery] = useState(""),
    searchId = useId();
  const shown = searchHidden(entries, query) as HiddenEntry[];
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
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button
              type="button"
              className="icon-button hidden-search-clear"
              aria-label="Clear search"
              onClick={() => setQuery("")}
            >
              <X aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {query.trim() && (
        <p className="small hidden-search-status" role="status">
          {shown.length
            ? `Showing ${shown.length} of ${entries.length}`
            : `No hidden pieces match “${query.trim()}”.`}
        </p>
      )}
      <ul className="hidden-piece-list">
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
            {editReason && (
              <button
                className="textbutton"
                aria-label={`Edit reason for ${nameOf(entry)}`}
                onClick={() => editReason(entry.key)}
              >
                Reason
              </button>
            )}
            <button
              className="textbutton"
              aria-label={`Restore ${nameOf(entry)}`}
              onClick={() => restore(entry.key)}
            >
              Restore
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
