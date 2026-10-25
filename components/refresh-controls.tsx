"use client";
import { formatDateTime } from "@/lib/domain/presentation.mjs";
import Link from "next/link";
import {
  DAILY_CAP_OFF,
  MAX_DAILY_CAP,
  BRAND_SEARCH_BATCHES,
} from "@/lib/domain/collection-limits.mjs";
import { useEffect, useRef, useState } from "react";
import { createBackup } from "@/lib/settings-backup";
import type { Preferences } from "@/lib/preferences";
import type { Listing } from "@/lib/catalog";

type Outcome = {
  accepted?: number;
  eligible?: number;
  matchingPreferences?: number;
  pendingTranslations?: number;
  checked?: number;
  available?: number;
  sold?: number;
  reserved?: number;
  unavailable?: number;
  photosUpdated?: number;
};
type Run = {
  id: string;
  status: string;
  reserved: number;
  reported: number;
  created_at: string;
  result?: (Outcome & { error?: string }) | null;
};
type Status = {
  day: string;
  dailyCap: number;
  reservedCredits: number;
  reportedCredits: number;
  remainingCredits: number | null;
  providerAvailable: boolean;
  running: boolean;
  runs: Run[];
};
type Plan = {
  id: string;
  maximumCredits: number;
  maximumItems: number;
  exactBrandJobs: number;
  department: string;
  sizeFiltering: string;
  translation: string;
  coverage: string;
  expiresAt: string;
  jobs: { brand: string; brandId: string | null }[];
};
const outcomeMessage = (value: Outcome, scope: string) =>
  value.checked !== undefined
    ? `Availability checked for ${value.checked} saved item${value.checked === 1 ? "" : "s"}: ${value.sold ?? 0} sold, ${value.unavailable ?? 0} removed or hidden, ${value.reserved ?? 0} reserved, ${value.available ?? 0} still available.${value.photosUpdated ? ` ${value.photosUpdated} photo link${value.photosUpdated === 1 ? "" : "s"} refreshed.` : ""}`
    : `Refresh complete: ${value.accepted ?? 0} validated listings, ${scope !== "discover" ? `${value.matchingPreferences ?? 0} matches for your feeds` : `${value.eligible ?? 0} eligible Discover results`}.${value.pendingTranslations ? ` ${value.pendingTranslations} titles still need English review.` : ""}`;

export default function RefreshControls({
  settings,
  savedListings = [],
  refreshed,
  compact = false,
  initialScope = "discover",
  close,
}: {
  settings: Preferences;
  savedListings?: Listing[];
  refreshed: () => Promise<void>;
  compact?: boolean;
  initialScope?: string;
  close?: () => void;
}) {
  const [status, setStatus] = useState<Status | null>(null),
    [cap, setCap] = useState(15),
    [capEnabled, setCapEnabled] = useState(true),
    [scope, setScope] = useState(initialScope),
    [limit, setLimit] = useState(3),
    [plan, setPlan] = useState<Plan | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [watching, setWatching] = useState<string | null>(null),
    [finished, setFinished] = useState(false);
  const fingerprint = JSON.stringify(settings),
    autoKey = JSON.stringify([fingerprint, scope, limit]);
  const lastAutoKey = useRef(""),
    quoteVersion = useRef(0),
    working = useRef(false);
  async function load() {
    try {
      const response = await fetch("/api/refresh", { cache: "no-store" });
      if (!response.ok)
        throw new Error(
          response.status === 403
            ? "Collection is available on your computer only."
            : "Collection is unavailable right now. You can keep browsing.",
        );
      const value: Status = await response.json();
      setStatus(value);
      return value;
    } catch (error) {
      setMessage((error as Error).message);
      return null;
    }
  }
  useEffect(() => {
    void load().then((value) => {
      if (value) {
        setCap(value.dailyCap || 15);
        setCapEnabled(value.dailyCap !== DAILY_CAP_OFF);
      }
    });
  }, []);
  useEffect(() => {
    quoteVersion.current++;
    setPlan(null);
    setFinished(false);
  }, [fingerprint, scope, limit]);
  // Opening this dialog obtains a free quote only; a run always needs the separate cost-labelled confirmation.
  useEffect(() => {
    if (compact && status && !status.running && !busy && lastAutoKey.current !== autoKey) {
      lastAutoKey.current = autoKey;
      void action("plan");
    }
  }, [compact, !!status, status?.running, busy, autoKey]);
  useEffect(() => {
    if (!busy && !status?.running && !watching) return;
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [busy, status?.running, watching]);
  useEffect(() => {
    if (!watching || !status) return;
    const run = status.runs.find((row) => row.id === watching);
    if (!run || ["queued", "running"].includes(run.status)) return;
    setWatching(null);
    setFinished(true);
    if (run.status === "complete") {
      setMessage(outcomeMessage(run.result ?? {}, scope));
      void refreshed().catch(() =>
        setMessage("Collection finished. Your feed could not be reloaded yet."),
      );
    } else
      setMessage(
        run.result?.error ??
          "The collection stopped. Check Budget and history before starting another run.",
      );
  }, [watching, status]);
  async function action(kind: "budget" | "plan" | "run") {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setMessage("");
    const version = quoteVersion.current;
    try {
      const response = await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          kind === "budget"
            ? { action: kind, dailyCap: capEnabled ? cap : DAILY_CAP_OFF }
            : {
                action: kind,
                profile: createBackup(settings, { mode: "live", collapsed: false }, savedListings),
                scope,
                limit,
                id: plan?.id,
              },
        ),
      });
      const value = await response.json();
      if (!response.ok)
        throw new Error(value.error ?? "Collection is unavailable. Try a new cost preview.");
      if (kind === "budget") {
        setStatus(value);
        setMessage("Daily cap saved. No collection started.");
      }
      if (kind === "plan" && version === quoteVersion.current) {
        setPlan(value);
        setFinished(false);
        await load();
      }
      if (kind === "run" && ["queued", "running"].includes(value.status)) {
        setWatching(value.id);
        setPlan(null);
        setMessage("Refresh started in the background. You can close this window.");
        await load();
        return;
      }
      if (kind === "run") {
        setPlan(null);
        setFinished(true);
        if (value.status !== "complete")
          throw new Error(
            value.error ??
              "The previous run did not complete. Check Budget and history before starting another run.",
          );
        setMessage(outcomeMessage(value, scope));
        try {
          await refreshed();
        } catch {
          setMessage("Collection finished. Your feed could not be reloaded yet.");
        }
      }
    } catch (error) {
      if (kind !== "plan" || version === quoteVersion.current) setMessage((error as Error).message);
      if (kind === "run") {
        setPlan(null);
        setFinished(true);
      }
    } finally {
      if (kind === "run") await load();
      working.current = false;
      setBusy(false);
    }
  }
  const running = !!status?.running || !!watching,
    disabled = busy || running;
  const options = (
    <div className="refresh-options">
      <div className="field">
        <label htmlFor="refresh-scope">Refresh feed</label>
        <select
          id="refresh-scope"
          value={scope}
          disabled={disabled}
          onChange={(event) => {
            setScope(event.target.value);
            if (event.target.value === "availability") setLimit((value) => Math.min(value, 3));
          }}
        >
          <option value="personal">Your edit · Following and Discover</option>
          <option value="discover">Discover</option>
          <option value="following">Following</option>
          <option value="availability">Saved items’ availability</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="refresh-count">
          {scope === "availability" ? "Saved items to check" : "Brand searches"}
        </label>
        <select
          id="refresh-count"
          value={limit}
          disabled={disabled}
          onChange={(event) => setLimit(Number(event.target.value))}
        >
          {(scope === "availability" ? [1, 2, 3] : BRAND_SEARCH_BATCHES).map((value) => (
            <option key={value} value={value}>
              {value} · up to {value * (scope === "availability" ? 10 : 5)} credits
            </option>
          ))}
        </select>
      </div>
    </div>
  );
  const technical = plan && (
    <details className="refresh-disclosure">
      <summary>Plan details</summary>
      <p>
        {scope === "availability"
          ? plan.department
          : `${plan.exactBrandJobs} of ${plan.jobs.length} searches use exact brand filters. ${plan.department}.`}
      </p>
      <p>{plan.sizeFiltering}</p>
      <p>
        {plan.coverage} {plan.translation}
      </p>
    </details>
  );
  const budget = (
    <details className="refresh-disclosure refresh-budget-details">
      <summary>Budget and history</summary>
      {status && (
        <p>
          {status.reportedCredits} reported charged · {status.reservedCredits} reserved ·{" "}
          {status.dailyCap === DAILY_CAP_OFF
            ? "Daily limit off."
            : `${status.dailyCap}-credit daily cap. Resets at midnight UTC.`}{" "}
          This is your local allowance, not your provider balance. Uncertain calls keep their
          reservations.
        </p>
      )}
      <label className="checkline">
        <input
          type="checkbox"
          checked={capEnabled}
          disabled={disabled}
          onChange={(event) => setCapEnabled(event.target.checked)}
        />
        Limit daily spending
      </label>
      <div className="refresh-fields">
        <div className="field">
          <label htmlFor="daily-credit-cap">Daily credit cap</label>
          <input
            id="daily-credit-cap"
            type="number"
            min={5}
            max={MAX_DAILY_CAP}
            step={1}
            value={cap}
            disabled={disabled || !capEnabled}
            onChange={(event) => setCap(Number(event.target.value))}
          />
        </div>
        <button
          className="btn light"
          disabled={
            !status ||
            disabled ||
            (capEnabled && (!Number.isInteger(cap) || cap < 5 || cap > MAX_DAILY_CAP))
          }
          onClick={() => void action("budget")}
        >
          Save daily cap
        </button>
      </div>
      {status && status.runs.length > 0 && (
        <ul>
          {status.runs.map((run) => (
            <li key={run.id}>
              {formatDateTime(run.created_at)} · {run.status} · {run.reported} reported /{" "}
              {run.reserved} reserved credits
              {run.result?.error ? ` · ${run.result.error}` : ""}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
  const canRun =
    !!plan &&
    !disabled &&
    !!status?.providerAvailable &&
    plan.jobs.length > 0 &&
    (status.remainingCredits === null || plan.maximumCredits <= status.remainingCredits);
  const confirmation = plan && plan.jobs.length > 0 && !finished && (
    <button className="btn" disabled={!canRun} onClick={() => void action("run")}>
      Find pieces · up to {plan.maximumCredits} credits
    </button>
  );
  return (
    <section
      className={compact ? "refresh-form" : "panel refresh-form"}
      aria-label={compact ? "Collection cost preview" : undefined}
      aria-labelledby={compact ? undefined : "refresh-title"}
    >
      <div className="refresh-body">
        {!compact && (
          <>
            <h3 id="refresh-title">Refresh listings</h3>
            <p>Find new pieces for your edit. Review the cost before collecting.</p>
          </>
        )}
        {status && (
          <p className="refresh-allowance">
            {status.dailyCap === DAILY_CAP_OFF ? (
              "Daily limit off"
            ) : (
              <>
                {status.remainingCredits} credits left today <span>of {status.dailyCap}</span>
              </>
            )}
          </p>
        )}
        {running ? (
          <p role="status">
            Collecting… You can close this window; collection continues in the background.
          </p>
        ) : (
          <>
            {!compact && options}
            {!compact && !plan && (
              <button
                className="btn light"
                disabled={!status || disabled}
                onClick={() => void action("plan")}
              >
                See refresh cost
              </button>
            )}
            {compact && busy && !plan && !finished && <p role="status">Checking the cost…</p>}
            {plan && (
              <div className="refresh-quote">
                <h4>Up to {plan.maximumCredits} credits</h4>
                <p className="refresh-brands">
                  {plan.jobs.map((job) => job.brand).join(" · ") ||
                    (scope === "availability"
                      ? "No saved items need a check."
                      : "No brands to search. Add a style, follow a brand or save a piece first.")}
                </p>
                {plan.jobs.length > 0 && (
                  <p className="small">
                    Up to {plan.maximumItems}{" "}
                    {scope === "availability" ? "saved items checked" : "results"}.{" "}
                    {scope === "availability" ? "" : "Your sizes and departments still apply."}
                  </p>
                )}
                {!status?.providerAvailable && (
                  <p>Collection isn’t connected on this computer. You can keep browsing.</p>
                )}
                {status &&
                  status.remainingCredits !== null &&
                  plan.maximumCredits > status.remainingCredits && (
                    <p role="status">
                      This is over today’s remaining allowance. Choose fewer searches or come back
                      tomorrow.
                    </p>
                  )}
              </div>
            )}
            {compact && (
              <details className="refresh-disclosure">
                <summary>Search options</summary>
                {options}
              </details>
            )}
            {technical}
          </>
        )}
        {message && (
          <p className="refresh-message" role="status">
            {message}
          </p>
        )}
        {compact && !busy && !running && !plan && !finished && message && (
          <button
            className="btn light"
            onClick={() =>
              void load().then((value) => {
                if (value && !value.running) void action("plan");
              })
            }
          >
            Try cost preview again
          </button>
        )}
        {!compact && budget}
        {compact && (
          <Link className="textlink refresh-tools-link" href="/tools" onClick={close}>
            Budget and history in Collection tools
          </Link>
        )}
      </div>
      <div className="refresh-footer">
        {compact && (
          <button className="btn light" autoFocus onClick={close}>
            {finished || running ? "Done" : "Cancel"}
          </button>
        )}
        {confirmation}
      </div>
    </section>
  );
}
