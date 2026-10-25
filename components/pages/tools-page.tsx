"use client";
import Link from "next/link";
import type { Preferences } from "@/lib/preferences";
import type { Listing } from "@/lib/catalog";
import type { Backup } from "@/lib/settings-backup";
import { Header } from "../ui/page-states";
import type { ListingSnapshot } from "@/lib/load-listings";
import { formatDateTime } from "@/lib/domain/presentation.mjs";
import RefreshControls from "../refresh-controls";
import PublishControls from "../publish-controls";
import DataQuality from "../data-quality";
import FeedbackReview from "../feedback-review";
import LocalProfile from "../local-profile";
export default function ToolsPage({
  data,
  allListings,
  mode,
  collapsed,
  savedListings,
  restoreSettings,
  restorePiece,
  editReason,
  reloadListings,
  switchMode,
  snapshot,
  genderHidden,
  previewDigest,
  update,
}: {
  data: Preferences;
  allListings: Listing[];
  mode: "live" | "demo";
  collapsed: boolean;
  savedListings: Listing[];
  restoreSettings: (backup: Backup) => void;
  restorePiece: (key: string) => void;
  editReason?: (key: string) => void;
  reloadListings: () => Promise<void>;
  switchMode: (mode: "live" | "demo") => void;
  snapshot: ListingSnapshot | null;
  genderHidden: number;
  previewDigest: boolean;
  update: (patch: Partial<Preferences>) => void;
}) {
  return (
    <>
      <Link className="backlink" href="/settings">
        ← Settings
      </Link>
      <Header
        title="Collection tools"
        description="Refresh your edit and manage collection settings."
      />
      {mode === "live" && (
        <RefreshControls settings={data} savedListings={savedListings} refreshed={reloadListings} />
      )}
      {mode === "live" && <PublishControls refreshed={reloadListings} />}
      <section className="panel">
        <h3>Learning and evaluation</h3>
        <p>Review feedback, compare learned candidates and control which ranker Discover uses.</p>
        <Link className="textlink" href="/tools/learning">
          Open learning and evaluation →
        </Link>
      </section>
      <section className="panel">
        <h3>Listing source</h3>
        <div className="data-status">
          <label>
            Listings{" "}
            <select
              aria-label="Listing data"
              value={mode}
              onChange={(event) => switchMode(event.target.value as "live" | "demo")}
            >
              <option value="live">Vinted</option>
              <option value="demo">Demo</option>
            </select>
          </label>
          <span>
            {mode === "demo"
              ? "Illustrative sample listings"
              : snapshot
                ? `${snapshot.items.length} listings · Updated ${formatDateTime(snapshot.fetchedAt)}`
                : "No collection loaded"}
          </span>
        </div>
        {snapshot && (
          <details>
            <summary>Listing coverage</summary>
            <p>
              {snapshot.collection
                ? `${snapshot.collection.collectedQueries} of ${snapshot.collection.plannedQueries} planned queries collected.`
                : `${snapshot.queries.length} searches collected.`}{" "}
              Up to 20 results per query.
            </p>
            <p>
              {genderHidden} items hidden by department preferences. Style and rarity classification
              are incomplete.
            </p>
          </details>
        )}
      </section>
      {mode === "live" && snapshot && (
        <details className="tools-disclosure">
          <summary>Data quality</summary>
          <DataQuality snapshot={snapshot} />
        </details>
      )}
      {mode === "live" &&
        typeof window !== "undefined" &&
        window.location.hostname === "127.0.0.1" && (
          <section className="panel">
            <h3>Ranking preview</h3>
            <p>
              Compare Current, River and Gorse using existing pieces. Preview choices stay separate
              from your saves.
            </p>
            <Link className="textlink" href="/tools/ranking-preview">
              Open private ranking preview →
            </Link>
          </section>
        )}
      <details className="tools-disclosure" id="feedback">
        <summary>Recommendation feedback</summary>
        <div>
          <FeedbackReview
            source={allListings}
            settings={data}
            restore={restorePiece}
            editReason={editReason}
          />
        </div>
      </details>
      <details className="tools-disclosure">
        <summary>Local settings backup</summary>
        <LocalProfile
          settings={data}
          display={{ mode, collapsed }}
          savedListings={savedListings}
          restore={restoreSettings}
        />
      </details>
      <details className="tools-disclosure" id="experiments" open={previewDigest}>
        <summary>Experimental previews</summary>
        <p>
          These previews aren’t part of the main shopping experience. Scheduled delivery and live
          rarity classification are not connected.
        </p>
        <div className="inline section-note">
          <Link className="btn light" href="/rare">
            Rare Finds preview
          </Link>
          <Link className="btn light" href="/drops">
            Daily digest preview
          </Link>
        </div>
        <div className="panel">
          <h3>Daily digest</h3>
          {(
            [
              ["following", "New pieces from followed brands"],
              ["searches", "New matches from enabled saved searches"],
              ["rare", "New potential rare finds"],
              ["styles", "New pieces matching My Styles"],
            ] as const
          ).map(([key, label]) => (
            <label className="checkline" key={key}>
              <input
                type="checkbox"
                checked={data.digest[key]}
                onChange={(event) =>
                  update({
                    digest: { ...data.digest, [key]: event.target.checked },
                  })
                }
              />
              {label}
            </label>
          ))}
          <div className="field">
            <label htmlFor="digest-time">Preferred delivery time (future integration)</label>
            <input
              id="digest-time"
              type="time"
              value={data.digestTime}
              onChange={(event) => {
                if (event.target.value) update({ digestTime: event.target.value });
              }}
            />
          </div>
          <div className="notice">
            This changes your Daily Drops preview. No emails, push notifications or scheduled jobs
            are sent.
          </div>
          <Link className="textlink" href="/drops">
            Preview your daily digest →
          </Link>
        </div>
      </details>
    </>
  );
}
