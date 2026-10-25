"use client";
import Link from "next/link";
import ListingMetadata from "./listings/listing-metadata";
import { formatDateTime } from "@/lib/domain/presentation.mjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Eye, RefreshCw, Undo2 } from "lucide-react";
import ProductPhoto from "./product-photo";
import { createBackup } from "@/lib/settings-backup";
import { preferenceKey } from "@/lib/domain/ranking-preview.mjs";
import { listingKey } from "@/lib/domain/recommendations.mjs";
import type { Preferences } from "@/lib/preferences";
import type { Listing } from "@/lib/catalog";

type Choice = "save" | "dismiss" | "skip";
type View = {
  id: string;
  label: string;
  keys: string[];
  mode?: string;
  note?: string;
};
type Comparison = {
  id: string;
  createdAt: string;
  profileKey: string;
  items: Listing[];
  views: View[];
  blindAvailable: boolean;
  training: { positive: number; negative: number; revision: number };
  revision: number;
  choices: Record<string, Choice>;
};
type Undo = { key: string; previous: Choice | null };
const labels: Record<Choice, string> = {
  save: "Would save",
  dismiss: "Not for me",
  skip: "Skip",
};

export default function RankingPreview({
  settings,
  savedListings,
}: {
  settings: Preferences;
  savedListings: Listing[];
}) {
  const profile = useMemo(
    () => createBackup(settings, { mode: "live", collapsed: false }, savedListings),
    [settings, savedListings],
  );
  const profileKey = preferenceKey(profile.settings, profile.savedListings);
  const [comparison, setComparison] = useState<Comparison | null>(null),
    [selected, setSelected] = useState("current"),
    [blind, setBlind] = useState(false),
    [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false),
    [initializing, setInitializing] = useState(true),
    [message, setMessage] = useState(""),
    [conflict, setConflict] = useState(false),
    [history, setHistory] = useState<Undo[]>([]),
    [shown, setShown] = useState(12);
  const working = useRef(false),
    epoch = useRef(0),
    local = typeof window !== "undefined" && window.location.hostname === "127.0.0.1";
  const stale = !!comparison && comparison.profileKey !== profileKey,
    view = comparison?.views.find((row) => row.id === selected) ?? comparison?.views[0];
  async function api(path = "", body?: unknown) {
    const response = await fetch("/api/ranking-preview" + path, {
      cache: "no-store",
      ...(body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    });
    const value = await response.json();
    if (!response.ok) {
      if (response.status === 409) setConflict(true);
      throw Error(value.error ?? "Ranking preview is unavailable.");
    }
    return value;
  }
  useEffect(() => {
    const version = ++epoch.current;
    if (!local) {
      setInitializing(false);
      return;
    }
    void api()
      .then(async (status) => {
        if (status.latest) {
          const result = await api("?id=" + encodeURIComponent(status.latest));
          if (version === epoch.current) setComparison(result);
        }
      })
      .catch((error) => {
        if (version === epoch.current) setMessage(error.message);
      })
      .finally(() => {
        if (version === epoch.current) setInitializing(false);
      });
    return () => {
      epoch.current++;
    };
  }, [local]);
  async function create() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setMessage("Preparing the three rankings locally…");
    setConflict(false);
    const version = epoch.current;
    try {
      const value = await api("", { action: "create", profile });
      if (version !== epoch.current) return;
      setComparison(value);
      setSelected("current");
      setBlind(false);
      setRevealed(false);
      setHistory([]);
      setShown(12);
      setMessage("Comparison ready. Choices will be used when you create the next comparison.");
    } catch (error) {
      if (version === epoch.current) setMessage((error as Error).message);
    } finally {
      working.current = false;
      if (version === epoch.current) setBusy(false);
    }
  }
  async function loadView(asBlind: boolean, reveal = false) {
    if (!comparison || working.current) return;
    working.current = true;
    setBusy(true);
    setMessage("");
    try {
      const value = await api(
        `?id=${comparison.id}&blind=${asBlind ? "1" : "0"}&reveal=${reveal ? "1" : "0"}`,
      );
      setComparison(value);
      setSelected(asBlind ? (blind ? selected : "edit-1") : "current");
      setBlind(asBlind);
      setRevealed(reveal);
      setConflict(false);
      if (conflict || value.revision !== comparison.revision) setHistory([]);
      setShown(12);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function rate(key: string, choice: Choice | null, undo = false) {
    if (!comparison || stale || working.current || conflict) return;
    working.current = true;
    setBusy(true);
    setMessage("");
    const previous = comparison.choices[key] ?? null;
    try {
      const result = await api("", {
        action: "vote",
        id: comparison.id,
        key,
        choice,
        baseRevision: comparison.revision,
      });
      setComparison((value) => {
        if (!value) return value;
        const choices = { ...value.choices };
        if (choice === null) delete choices[key];
        else choices[key] = choice;
        return { ...value, revision: result.revision, choices };
      });
      setHistory((value) => (undo ? value.slice(0, -1) : [...value, { key, previous }]));
      setMessage("Preview choice saved. Your FORME saves are unchanged.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  if (!local)
    return (
      <section className="panel">
        <h2>Available on your computer</h2>
        <p>Open FORME on the owner’s computer to compare the local ranking models.</p>
      </section>
    );
  const byKey = new Map(comparison?.items.map((item) => [listingKey(item), item]) ?? []);
  return (
    <div className="ranking-preview">
      <Link href="/tools" className="backlink">
        <ArrowLeft size={15} /> Collection tools
      </Link>
      <div className="head">
        <div>
          <h1>Ranking preview</h1>
          <p>Three ways to order your edit. Your normal feeds stay unchanged.</p>
        </div>
        <button className="btn" disabled={busy || initializing} onClick={() => void create()}>
          <RefreshCw size={16} />
          {busy && !comparison ? "Preparing…" : comparison ? "New comparison" : "Create comparison"}
        </button>
      </div>
      <p className="preview-boundary">
        Preview choices stay separate from your saves and hidden pieces. No collection credits are
        used.
      </p>
      {initializing && <p role="status">Loading your private comparison…</p>}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {conflict && comparison && (
        <button className="btn light" onClick={() => void loadView(blind, revealed)}>
          Reload preview choices
        </button>
      )}
      {stale && (
        <div className="notice" role="status">
          Your preferences changed. Create a new comparison to apply them before viewing or rating
          pieces.
        </div>
      )}
      {comparison && !stale && (
        <>
          <div className="preview-controls">
            <div
              className="preview-tabs"
              role="group"
              aria-label={blind ? "Blind edits" : "Ranking engine"}
            >
              {comparison.views.map((row) => (
                <button
                  key={row.id}
                  className={`chip ${selected === row.id ? "active" : ""}`}
                  aria-pressed={selected === row.id}
                  disabled={busy}
                  onClick={() => {
                    setSelected(row.id);
                    setShown(12);
                  }}
                >
                  {row.label}
                </button>
              ))}
            </div>
            <div className="preview-view-actions">
              <button
                className="textbutton"
                disabled={busy || (!comparison.blindAvailable && !blind)}
                onClick={() => void loadView(!blind)}
              >
                <Eye size={16} />
                {blind ? "Show engine names" : "Blind comparison"}
              </button>
              {blind && !revealed && (
                <button
                  className="textbutton"
                  disabled={busy}
                  onClick={() => void loadView(true, true)}
                >
                  Reveal engines
                </button>
              )}
            </div>
          </div>
          <div className="preview-meta">
            <span>
              {comparison.items.length} unrated pieces · Snapshot{" "}
              {formatDateTime(comparison.createdAt)}
            </span>
            <span>
              {comparison.training.positive + comparison.training.negative} frozen feedback examples
            </span>
          </div>
          {!comparison.blindAvailable && (
            <p className="small preview-model-note">
              Blind comparison becomes available when both learned models are ready.
            </p>
          )}
          {view?.note && (
            <p className="small preview-model-note" role="status">
              {view.note}
            </p>
          )}
          {comparison.views.some((row) => row.mode === "unavailable") && (
            <details className="preview-setup">
              <summary>Local model setup</summary>
              <p>
                Run <code>npm run recommendations:setup</code> on this computer, then create a new
                comparison.
              </p>
            </details>
          )}
          <p className="small section-note">
            Pieces already saved, hidden or rated for training are left out. Feedback and ordering
            stay frozen until the next comparison.
          </p>
          {history.length > 0 && (
            <button
              className="textbutton"
              disabled={busy || conflict}
              onClick={() => {
                const last = history.at(-1)!;
                void rate(last.key, last.previous, true);
              }}
            >
              <Undo2 size={15} /> Undo last preview choice
            </button>
          )}
          {!comparison.items.length ? (
            <div className="empty">
              <h2>No unrated pieces match this snapshot</h2>
              <p>
                Your preferences still apply. New collected pieces can give the preview more to work
                with.
              </p>
            </div>
          ) : (
            <div className="grid preview-grid">
              {view?.keys.slice(0, shown).map((key, index) => {
                const item = byKey.get(key);
                if (!item) return null;
                const choice = comparison.choices[key];
                return (
                  <article
                    className="product preview-product"
                    key={key}
                    data-testid={`preview-${item.id}`}
                  >
                    <div className="photo">
                      <ProductPhoto src={item.imageUrl ?? ""} alt={item.title} />
                      <span className="preview-rank">{index + 1}</span>
                    </div>
                    <div className="productmeta">
                      <ListingMetadata item={item} />
                      <div
                        className="preview-choices"
                        role="group"
                        aria-label={`Preview choice for ${item.title}`}
                      >
                        {(["save", "dismiss", "skip"] as Choice[]).map((value) => (
                          <button
                            key={value}
                            className={`chip ${choice === value ? "active" : ""}`}
                            aria-pressed={choice === value}
                            aria-label={`${labels[value]}: ${item.title}`}
                            disabled={busy || conflict}
                            onClick={() => void rate(key, value)}
                          >
                            {labels[value]}
                          </button>
                        ))}
                      </div>
                      {item.sourceUrl && (
                        <a
                          className="textlink"
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Original listing ↗
                        </a>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {view && shown < view.keys.length && (
            <div className="load-more">
              <button className="btn light" onClick={() => setShown((value) => value + 12)}>
                Show more pieces
              </button>
            </div>
          )}
        </>
      )}
      {!comparison && !initializing && !busy && (
        <section className="panel">
          <h2>Compare your next finds</h2>
          <p>
            Create a snapshot from your current preferences and existing listings. Switch between
            Current, River and Gorse, or hide the engine names for a blind comparison.
          </p>
          <p className="small section-note">
            Preparing the local models can take a moment. Your normal shopping feed continues to use
            Current.
          </p>
        </section>
      )}
    </div>
  );
}
