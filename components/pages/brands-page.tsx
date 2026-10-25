"use client";
import Link from "next/link";
import type { Listing } from "@/lib/catalog";
import type { Preferences } from "@/lib/preferences";
import { Header, Empty } from "../ui/page-states";
import Grid from "../listings/listing-grid";
import { catalog } from "@/lib/catalog";
export default function Page({
  data,
  source,
  brandQuery,
  setBrandQuery,
  brandTab,
  setBrandTab,
  brandState,
  setBrand,
}: {
  data: Preferences;
  source: Listing[];
  brandQuery: string;
  setBrandQuery: (value: string) => void;
  brandTab: string;
  setBrandTab: (value: string) => void;
  brandState: (brand: string) => string;
  setBrand: (brand: string, state: string) => void;
}) {
  const brands = [
    ...new Set([
      ...catalog,
      ...data.following,
      ...data.excluded,
      ...source.map((item) => item.brand),
    ]),
  ]
    .sort()
    .filter(
      (brand) =>
        brand.toLowerCase().includes(brandQuery.toLowerCase().trim()) &&
        (brandTab === "All" || brandState(brand) === brandTab),
    );
  return (
    <>
      <Header
        title="Your brands"
        description="Follow what you love. Exclude what you don’t. Leave room to discover."
      />
      <div className="panel">
        <label className="search-label" htmlFor="brand-search">
          Find a brand
        </label>
        <input
          id="brand-search"
          type="search"
          autoComplete="off"
          placeholder="Start typing: Our Legacy, COS, Acne…"
          value={brandQuery}
          onChange={(event) => setBrandQuery(event.target.value)}
        />
        <p className="small brand-help">
          Following appears in your dedicated feed. Excluded disappears from every feed. Neutral
          stays available in Discover.
        </p>
      </div>
      <div className="toolbar">
        {["All", "Following", "Neutral", "Excluded"].map((tab) => (
          <button
            key={tab}
            className={`chip ${brandTab === tab ? "active" : ""}`}
            aria-pressed={brandTab === tab}
            onClick={() => setBrandTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="panel">
        {brands.map((brand) => (
          <div className="brandrow" key={brand}>
            <div>
              <strong>{brand}</strong>{" "}
              <span
                className={`state ${brandState(brand) === "Following" ? "follow" : brandState(brand) === "Excluded" ? "exclude" : ""}`}
              >
                {brandState(brand)}
              </span>
            </div>
            <div className="actions" role="group" aria-label={`${brand} preference`}>
              {["Following", "Neutral", "Excluded"].map((state) => (
                <button
                  key={state}
                  className={brandState(brand) === state ? "on" : ""}
                  aria-pressed={brandState(brand) === state}
                  onClick={() => setBrand(brand, state)}
                >
                  {state === "Following" ? "Follow" : state === "Excluded" ? "Exclude" : "Neutral"}
                </button>
              ))}
            </div>
          </div>
        ))}
        {!brands.length && (
          <Empty
            title="No brands match this search"
            action={
              brandQuery.trim() && brandQuery.trim().length <= 100 ? (
                <button
                  className="btn light"
                  onClick={() => {
                    setBrand(brandQuery.trim(), "Following");
                    setBrandTab("Following");
                  }}
                >
                  Follow {brandQuery.trim()}
                </button>
              ) : (
                <button
                  className="btn light"
                  onClick={() => {
                    setBrandQuery("");
                    setBrandTab("All");
                  }}
                >
                  Show all brands
                </button>
              )
            }
          >
            Try another name, or add the brand to your follows. Listings may not be available for
            every brand yet.
          </Empty>
        )}
      </div>
    </>
  );
}
