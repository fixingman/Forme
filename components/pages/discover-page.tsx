"use client";
import Link from "next/link";
import type { Listing } from "@/lib/catalog";
import type { Preferences } from "@/lib/preferences";
import { Header, Empty } from "../ui/page-states";
import Grid from "../listings/listing-grid";
import { SlidersHorizontal } from "lucide-react";
import { matchesStyle } from "@/lib/preferences";
export default function Page({
  data,
  mode,
  recommendations,
  list,
  selectedStyle,
  activeEngine = "current",
  setStyleMenu,
}: {
  data: Preferences;
  mode: string;
  recommendations: { item: Listing }[];
  list: Listing[];
  selectedStyle: string;
  activeEngine?: string;
  setStyleMenu: (value: boolean) => void;
}) {
  const validStyle = selectedStyle === "All" || data.styles.includes(selectedStyle);
  const pool = mode === "live" ? recommendations.map((entry) => entry.item) : list;
  const feed =
    selectedStyle === "All"
      ? pool
      : validStyle
        ? pool.filter((item) => matchesStyle(item, selectedStyle, data))
        : [];
  return (
    <>
      <Header
        title="Discover"
        description={
          mode === "live"
            ? "Shaped by your styles, brands and saved pieces. Save pieces or choose Not for me to refine your edit."
            : "Explore illustrative pieces by style."
        }
      />
      <div className="toolbar style-filterbar" aria-label="Style filters">
        <div className="style-filter-options">
          {[
            "All",
            ...data.styles.filter(
              (style) => mode === "demo" || pool.some((item) => matchesStyle(item, style, data)),
            ),
          ].map((style) => (
            <Link
              key={style}
              className={`chip ${selectedStyle === style ? "active" : ""}`}
              aria-current={selectedStyle === style ? "page" : undefined}
              href={style === "All" ? "/discover" : `/discover?style=${encodeURIComponent(style)}`}
            >
              {style}
            </Link>
          ))}
        </div>
        <button
          className="icon-button filter-settings"
          aria-label="Edit style filters"
          title="Edit style filters"
          onClick={() => setStyleMenu(true)}
        >
          <SlidersHorizontal />
        </button>
      </div>
      {!validStyle && (
        <div className="notice">
          This style is no longer in My Styles. <Link href="/discover">Explore all pieces →</Link>
        </div>
      )}
      {activeEngine !== "current" && (
        <p className="small section-note">
          Ranked by {activeEngine}. Your filters still apply.{" "}
          <Link href="/tools/learning">Review or return to Current</Link>
        </p>
      )}
      <div className="feed-meta">
        <span>
          {feed.length} {feed.length === 1 ? "piece" : "pieces"}
        </span>
        {mode === "live" && !pool.some((item) => item.style) && (
          <Link className="textlink" href="/styles">
            Style preferences
          </Link>
        )}
      </div>
      {mode === "live" && !pool.length ? (
        <Empty
          title={
            data.following.length
              ? "No discoveries that match yet"
              : "Start with a few favorite brands"
          }
          action={
            <>
              <Link className="btn" href="/brands">
                {data.following.length ? "Review your brands" : "Choose your brands"}
              </Link>
              <Link className="btn light" href="/settings">
                Review preferences
              </Link>
            </>
          }
        >
          {data.following.length
            ? "We’ll show relevant pieces beyond your followed brands when they’re available in the collection."
            : "Your followed brands give Discover a starting point. You can add or change them any time."}
          {data.saved.length > 0 && (
            <>
              {" "}
              Pieces you save leave Discover and stay in{" "}
              <Link className="textlink" href="/saved">
                Saved items
              </Link>
              .
            </>
          )}
        </Empty>
      ) : (
        <Grid values={feed} />
      )}
    </>
  );
}
