"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Preferences } from "@/lib/preferences";
import { ENGINE_IDS, DISLIKE_MIN_HIDES, DISLIKE_MIN_DAYS } from "@/lib/domain/learning.mjs";
import { sameBrand } from "@/lib/domain/brands.mjs";
import { learningRequest, useLearningOutbox } from "@/lib/use-learning";
import Dialog from "./ui/dialog";
import { Header } from "./ui/page-states";
import LearningAnalyst from "./learning-analyst";
type Engine = { mode: string; keys: string[]; fallbackKeys?: string[] };
type Report = {
  channel: string;
  counts: Record<string, number>;
  engines: Record<
    string,
    {
      eligible: boolean;
      status: string;
      pairs: number;
      days: number;
      meanDailyGain: number;
      lowerGain: number | null;
      route?: "pairs" | "dislikes" | null;
      dislikes?: {
        hides: number;
        days: number;
        meanPosition: number | null;
        currentPosition: number | null;
        lowerPosition: number | null;
      };
    }
  >;
  metric: string;
  uncounted?: {
    total: number;
    reasons: Record<string, number>;
    brands: Record<string, number>;
  };
};
type Run = {
  id: string;
  createdAt: string;
  channel: string;
  cutoff: number;
  engines: Record<string, Engine>;
  training: { positive: number; negative: number };
};
type Status = {
  events: number;
  canTrain: boolean;
  job: { state: string; message?: string } | null;
  selection: {
    revision: number;
    selected: { runId: string; engine: string; channel: string } | null;
    history: unknown[];
  };
  reports: Report[];
  runs: Run[];
};
/** Plain wording for each reason a vote was not counted, in the order a reader would expect to look for them. */
const UNCOUNTED_TEXT: [string, (n: number) => string][] = [
  [
    "exposureLost",
    (n) => `${n} were shown on Discover, but the record of that never reached your history`,
  ],
  ["beforeRanking", (n) => `${n} were cast before the ranking for that visit was saved`],
  ["usedToTrain", (n) => `${n} were on pieces the models had already trained on`],
  ["notListed", (n) => `${n} were not among the pieces in the ranking that was shown`],
  ["outsideWindow", (n) => `${n} fall outside the evaluation window`],
  ["olderPolicy", (n) => `${n} were recorded under an older rule`],
];
/**
 * Says how many saves and "Not my style" hides are counted by the silent test and, for the rest, why not, so a low count can be read
 * rather than guessed at. The two reasons that need no fix are named first: a piece on a brand you follow is never in Discover's
 * ranking, and a vote cast away from Discover has no ranking to be measured against.
 */
function UncountedNote({ report, following }: { report: Report; following: string[] }) {
  const gone = report.uncounted;
  if (!gone) return null;
  const counted = report.counts.positive + report.counts.style,
    total = counted + gone.total;
  if (!total) return null;
  const unranked = gone.reasons.noRanking ?? 0,
    onFollowed = Object.entries(gone.brands).reduce(
      (sum, [brand, n]) => (following.some((value) => sameBrand(value, brand)) ? sum + n : sum),
      0,
    ),
    rest = UNCOUNTED_TEXT.filter(([reason]) => (gone.reasons[reason] ?? 0) > 0);
  return (
    <div className="uncounted-note">
      <p>
        <strong>
          {counted} of {total}
        </strong>{" "}
        of your saves and “Not my style” hides are counted by the silent test.
        {gone.total > 0 &&
          " The other " + gone.total + " are not, and that does not count against any model."}
      </p>
      {gone.total > 0 && (
        <details className="learning-disclosure">
          <summary>Why some votes are not counted</summary>
          <div className="learning-detail-body">
            <ul className="small">
              {unranked > 0 && (
                <li>
                  {unranked} had no Discover ranking on screen when you voted
                  {onFollowed > 0 &&
                    ` (at least ${onFollowed} on brands you follow, which Discover never ranks)`}
                  . Votes on other pages, or before Discover had loaded, cannot be measured.
                </li>
              )}
              {rest.map(([reason, text]) => (
                <li key={reason}>{text(gone.reasons[reason])}.</li>
              ))}
            </ul>
          </div>
        </details>
      )}
    </div>
  );
}
const names: Record<string, string> = {
  current: "Current",
  river: "River",
  "river-regularized": "River · conservative",
  gorse: "Gorse",
};
export default function LearningDashboard({
  settings,
  identity,
  historyCleared,
}: {
  settings: Preferences;
  identity: string | null;
  historyCleared: () => void;
}) {
  const outbox = useLearningOutbox(identity);
  const [status, setStatus] = useState<Status | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState<{ run: Run; engine: string } | null>(null),
    [deleting, setDeleting] = useState(false);
  async function reload() {
    try {
      setStatus(await learningRequest());
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  useEffect(() => {
    void reload();
    const timer = setInterval(() => void reload(), 5000);
    return () => clearInterval(timer);
  }, [identity]);
  async function select(runId: string | undefined, name: string) {
    setBusy(true);
    try {
      const value = await learningRequest({
        action: "select",
        runId,
        engine: name,
        expectedRevision: status?.selection.revision,
      });
      setStatus((old) => (old ? { ...old, selection: value } : old));
      setConfirm(null);
      window.dispatchEvent(new Event("forme-learning-selection"));
      setMessage(
        name === "current"
          ? "Discover is back on Current."
          : "This version is now selected for Discover. Missing or changed inventory falls back to Current.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="learning-dashboard">
      <Link className="backlink" href="/tools">
        ← Collection tools
      </Link>
      <Header
        title="Learning and evaluation"
        description="Learn from your saves and dislikes, see how the candidates compare, and choose what Discover uses."
      />
      {(message || outbox.error) && (
        <p className="notice" role="status">
          {outbox.error || message}
        </p>
      )}
      {outbox.rejected > 0 && (
        <p role="status">
          {outbox.rejected} feedback {outbox.rejected === 1 ? "operation was" : "operations were"}{" "}
          refused by the server and set aside, so they no longer hold up the rest.{" "}
          <button className="textbutton" onClick={outbox.discardRejected}>
            Discard
          </button>
        </p>
      )}
      {outbox.pending > 0 && (
        <p role="status">
          {outbox.pending} feedback operations kept on this device.{" "}
          <button className="textbutton" onClick={() => void outbox.flush()}>
            Retry feedback sync
          </button>
        </p>
      )}
      <div className="learning-overview">
        <section className="panel learning-section">
          <h2>Live ranking</h2>
          <p className="learning-current-value">
            {status?.selection.selected
              ? `${names[status.selection.selected.engine]} · selected version ${status.selection.selected.runId.slice(0, 8)}`
              : "Current remains selected."}
          </p>
          <p className="small">
            Switching to a candidate needs evidence and your approval. Your shopping filters still
            apply.
          </p>
          {status?.selection.selected && (
            <button
              className="btn light"
              disabled={busy}
              onClick={() => void select(undefined, "current")}
            >
              Return to Current
            </button>
          )}
        </section>
      </div>
      <section className="panel learning-section">
        <h2>Recommendation quality</h2>
        <p>
          {status?.events ?? 0} feedback events recorded. New votes evaluate earlier rankings before
          they train the next version.
        </p>
        <details className="learning-disclosure">
          <summary>When can I change the ranking?</summary>
          <div className="learning-detail-body">
            <p>
              Each candidate needs at least 20 scored decisions, including 5 positives and 5
              explicit style dislikes, plus 20 paired comparisons across 5 days. It must improve
              over Current by at least 0.05 with a positive conservative lower bound.
            </p>
            <p>
              This is an initial screening rule, not proof of recommendation quality. You review and
              approve any switch.
            </p>
          </div>
        </details>
        {status?.reports
          .filter((report) => report.channel === "shopping")
          .map((report) => (
            <div className="learning-report" key={report.channel}>
              <h3>Shopping judgments</h3>
              <details className="learning-disclosure learning-breakdown">
                <summary>Feedback breakdown</summary>
                <div className="learning-detail-body">
                  <p className="small">
                    {report.counts.positive} positive · {report.counts.style} style dislikes ·{" "}
                    {report.counts.material} material · {report.counts.color} colour ·{" "}
                    {report.counts.price} price · {report.counts.data} data reports ·{" "}
                    {report.counts.unneeded ?? 0} not needed · {report.counts.similar ?? 0} similar
                    · {report.counts.unknown} unknown motives · {report.counts.unscored} without
                    prior predictions
                  </p>
                </div>
              </details>
              <UncountedNote report={report} following={settings.following} />
              <div className="feedback-table-wrap">
                <table className="feedback-table">
                  <thead>
                    <tr>
                      <th>Candidate</th>
                      <th>Evidence</th>
                      <th>Paired comparisons</th>
                      <th>Review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ENGINE_IDS.slice(1).map((name) => {
                      const metric = report.engines[name],
                        run = [...(status?.runs ?? [])]
                          .reverse()
                          .find(
                            (row) =>
                              row.channel === report.channel &&
                              row.engines[name]?.mode === "learned",
                          );
                      return (
                        <tr key={name}>
                          <th>{names[name]}</th>
                          <td>
                            {metric.status.replaceAll("-", " ")} · {metric.days} days
                            {metric.dislikes && metric.dislikes.hides > 0 && (
                              <p className="small">
                                Pieces you hid: {metric.dislikes.hides} over {metric.dislikes.days}{" "}
                                {metric.dislikes.days === 1 ? "day" : "days"}, placed{" "}
                                {Math.round((metric.dislikes.meanPosition ?? 0) * 100)}% of the way
                                down (Current:{" "}
                                {Math.round((metric.dislikes.currentPosition ?? 0) * 100)}
                                %). Needs {DISLIKE_MIN_HIDES} pieces over {DISLIKE_MIN_DAYS} days.
                                {metric.route === "dislikes" && " Ready on this evidence."}
                              </p>
                            )}
                            {metric.pairs > 0 && (
                              <p className="small">
                                Gain vs Current:{" "}
                                {Number.isFinite(metric.meanDailyGain)
                                  ? `${(metric.meanDailyGain * 100).toFixed(1)} points`
                                  : "—"}
                                . Lower bound:{" "}
                                {metric.lowerGain != null
                                  ? `${(metric.lowerGain * 100).toFixed(1)} points`
                                  : "needs more days"}
                                .
                              </p>
                            )}
                          </td>
                          <td>{metric.pairs}</td>
                          <td>
                            <button
                              className="btn light"
                              disabled={busy || !status.canTrain || !metric.eligible || !run}
                              onClick={() => setConfirm({ run: run!, engine: name })}
                            >
                              Review activation
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="small">
                {report.metric} Unrated pieces are not dislikes; this is not a full-feed accuracy
                percentage.
              </p>
            </div>
          ))}
        <p className="small">
          {status?.job
            ? `Local training: ${status.job.state}. ${status.job.message ?? ""}`
            : "Feedback can train the next version on your computer."}
        </p>
        {status?.canTrain && (
          <button
            className="btn light"
            disabled={busy || status.job?.state === "running"}
            onClick={async () => {
              setBusy(true);
              try {
                await learningRequest({ action: "train" });
                await reload();
              } catch (e) {
                setMessage((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Train next candidates
          </button>
        )}
      </section>
      <LearningAnalyst pendingFeedback={outbox.pending} />

      <details className="panel learning-history learning-disclosure">
        <summary>Learning history</summary>
        <div className="learning-detail-body">
          <p>
            Keep a private copy of your feedback and analysis, or clear the learning history. Your
            saved and hidden pieces are kept.
          </p>
          <div className="learning-actions">
            <button
              className="textbutton"
              onClick={async () => {
                try {
                  const value = await fetch("/api/learning?export=1", { cache: "no-store" });
                  if (!value.ok) throw Error("History export unavailable.");
                  const blob = await value.blob(),
                    url = URL.createObjectURL(blob),
                    link = document.createElement("a");
                  link.href = url;
                  link.download = "forme-learning-history.json";
                  link.click();
                  URL.revokeObjectURL(url);
                } catch (e) {
                  setMessage((e as Error).message);
                }
              }}
            >
              Download private learning history
            </button>
            <button
              className="textbutton danger"
              disabled={busy || outbox.pending > 0 || !status?.canTrain}
              onClick={() => setDeleting(true)}
            >
              Delete learning history
            </button>
          </div>
        </div>
      </details>
      {deleting && (
        <Dialog title="Delete learning history?" close={() => setDeleting(false)}>
          <p>
            Delete this account’s recorded learning events, exposures and model history, and return
            to Current. Actual saves, hidden pieces, preferences and separate legacy study files
            remain. Download your learning history first if you want a copy.
          </p>
          <div className="inline">
            <button
              className="btn danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await learningRequest({
                    action: "clear",
                    confirmation: "DELETE LEARNING HISTORY",
                  });
                  historyCleared();
                  window.dispatchEvent(new Event("forme-learning-selection"));
                  setDeleting(false);
                  await reload();
                  setMessage("Learning history deleted. Discover uses Current.");
                } catch (e) {
                  setMessage((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Delete history and return to Current
            </button>
            <button className="btn light" onClick={() => setDeleting(false)}>
              Cancel
            </button>
          </div>
        </Dialog>
      )}
      {confirm && (
        <Dialog title="Activate this learned version?" close={() => setConfirm(null)}>
          <p>
            Use {names[confirm.engine]} version {confirm.run.id.slice(0, 8)} in Discover. You can
            return to Current any time. The evidence concerns the model configuration across later
            judgments; it does not guarantee every new piece will suit you.
          </p>
          <div className="inline">
            <button
              className="btn"
              disabled={busy}
              onClick={() => void select(confirm.run.id, confirm.engine)}
            >
              Activate {names[confirm.engine]}
            </button>
            <button className="btn light" onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
