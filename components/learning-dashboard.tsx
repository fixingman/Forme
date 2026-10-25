"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Preferences } from "@/lib/preferences";
import type { Listing } from "@/lib/catalog";
import { createBackup } from "@/lib/settings-backup";
import { ENGINE_IDS, REASON_LABELS } from "@/lib/domain/learning.mjs";
import { learningRequest, useLearningOutbox, type DislikeReason } from "@/lib/use-learning";
import Dialog from "./ui/dialog";
import { Header, Empty } from "./ui/page-states";
import DislikeReasonDialog from "./dislike-reason";
import ListingMetadata from "./listings/listing-metadata";
import ProductPhoto from "./product-photo";
import { formatDateTime } from "@/lib/domain/presentation.mjs";
type Engine = { mode: string; keys: string[]; fallbackKeys?: string[] };
type Comparison = {
  id: string;
  createdAt: string;
  items: Listing[];
  engines: Record<string, Engine>;
  training: { positive: number; negative: number };
  profileFingerprint?: string;
};
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
    }
  >;
  metric: string;
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
const names: Record<string, string> = {
  current: "Current",
  river: "River",
  "river-regularized": "River · conservative",
  gorse: "Gorse",
};
export default function LearningDashboard({
  settings,
  savedListings,
  items,
  identity,
  historyCleared,
}: {
  settings: Preferences;
  savedListings: Listing[];
  items: Listing[];
  identity: string | null;
  historyCleared: () => void;
}) {
  const outbox = useLearningOutbox(identity);
  const [status, setStatus] = useState<Status | null>(null),
    [comparison, setComparison] = useState<Comparison | null>(null),
    [engine, setEngine] = useState("current"),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [shown, setShown] = useState(12);
  const [choices, setChoices] = useState<
      Record<string, { choice: string; id: string; reason?: string }>
    >({}),
    [reasonKey, setReasonKey] = useState<string | null>(null),
    [confirm, setConfirm] = useState<{ run: Run; engine: string } | null>(null),
    [consent, setConsent] = useState(false),
    [deleting, setDeleting] = useState(false);
  const profileFingerprint = JSON.stringify([settings, savedListings, items]);
  const staleComparison = !!comparison && comparison.profileFingerprint !== profileFingerprint;
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
  async function create() {
    if (busy || !identity) return;
    setBusy(true);
    setMessage("Preparing a frozen comparison with the local models…");
    try {
      const value = await learningRequest({
        action: "snapshot",
        profile: createBackup(settings, { mode: "live", collapsed: false }, savedListings),
        items,
        channel: "preview",
        comparison: true,
      });
      setComparison({ ...value, profileFingerprint });
      setChoices({});
      setEngine("current");
      setShown(12);
      setMessage("Ready. Votes stay separate from your FORME saves.");
      await reload();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function vote(item: Listing, choice: string) {
    if (!comparison || staleComparison) return;
    const key = item.sourceKey!,
      exposureId = crypto.randomUUID(),
      id = crypto.randomUUID();
    if (
      !outbox.enqueue({
        id: exposureId,
        action: "exposure",
        exposure: { id: exposureId, runId: comparison.id, keys: [key], channel: "preview" },
      })
    )
      return;
    const action = choice === "save" ? "save" : choice === "dismiss" ? "dismiss" : "restore";
    // Clear the preceding active state first; Skip/Undo are neutral, never inverse-gradient dislikes.
    const reset = [
      {
        id: crypto.randomUUID(),
        key,
        action: "restore",
        channel: "preview",
        occurredAt: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        key,
        action: "unsave",
        channel: "preview",
        occurredAt: new Date().toISOString(),
      },
    ];
    const event = {
      id,
      key,
      action,
      channel: "preview",
      item,
      occurredAt: new Date().toISOString(),
      exposureId,
      ...(action === "dismiss" ? { reason: "unspecified" } : {}),
    };
    if (
      outbox.enqueue({
        id,
        action: "events",
        events: choice === "skip" ? reset : [...reset, event],
      })
    )
      setChoices((previous) => ({ ...previous, [key]: { choice, id } }));
  }
  function reason(key: string, value: DislikeReason) {
    const parent = choices[key];
    if (!parent) return;
    const id = crypto.randomUUID();
    if (
      outbox.enqueue({
        id,
        action: "events",
        events: [
          {
            id,
            key,
            action: "reason",
            targetId: parent.id,
            reason: value,
            channel: "preview",
            occurredAt: new Date().toISOString(),
          },
        ],
      })
    )
      setChoices((previous) => ({ ...previous, [key]: { ...parent, reason: value } }));
    setReasonKey(null);
  }
  async function select(runId: string | undefined, name: string) {
    setBusy(true);
    try {
      const value = await learningRequest({
        action: "select",
        runId,
        engine: name,
        expectedRevision: status?.selection.revision,
        allowPreviewTraining: consent,
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
  const view = comparison?.engines[engine],
    byKey = new Map(comparison?.items.map((item) => [item.sourceKey, item]) ?? []);
  return (
    <div className="learning-dashboard">
      <Link className="backlink" href="/tools">
        ← Collection tools
      </Link>
      <Header
        title="Learning and evaluation"
        description="Your judgments are the reference. Train candidates, check later predictions and control what Discover uses."
      />
      {(message || outbox.error) && (
        <p className="notice" role="status">
          {outbox.error || message}
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
      <section className="panel">
        <h2>Live ranking</h2>
        <p>
          {status?.selection.selected
            ? `${names[status.selection.selected.engine]} · selected version ${status.selection.selected.runId.slice(0, 8)}`
            : "Current remains selected."}
        </p>
        <p className="small">
          Learning never changes your sizes, departments, excluded brands or collection budget. A
          model switch requires evidence and your confirmation.
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
      <section className="panel">
        <h2>Forward evidence</h2>
        <p>
          {status?.events ?? 0} recorded feedback events. Predictions are evaluated before their
          answers can train later versions.
        </p>
        <p className="small">
          Initial review gate: at least 20 scored decisions, including 5 positive and 5 explicit
          style dislikes, paired comparisons across 5 different days, and a positive conservative
          lower bound with a useful gain. This is a screening policy, not proof from a tiny sample.
        </p>
        {status?.reports.map((report) => (
          <div className="learning-report" key={report.channel}>
            <h3>
              {report.channel === "preview" ? "Private preview judgments" : "Shopping judgments"}
            </h3>
            <p className="small">
              {report.counts.positive} positive · {report.counts.style} style dislikes ·{" "}
              {report.counts.price} price · {report.counts.data} data reports ·{" "}
              {report.counts.unknown} unknown motives · {report.counts.unscored} without prior
              predictions
            </p>
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
                            row.channel === report.channel && row.engines[name]?.mode === "learned",
                        );
                    return (
                      <tr key={name}>
                        <th>{names[name]}</th>
                        <td>
                          {metric.status.replaceAll("-", " ")} · {metric.days} days
                        </td>
                        <td>{metric.pairs}</td>
                        <td>
                          <button
                            className="btn light"
                            disabled={busy || !status.canTrain || !metric.eligible || !run}
                            onClick={() => {
                              setConfirm({ run: run!, engine: name });
                              setConsent(false);
                            }}
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
      </section>
      <section className="panel">
        <h2>Give fresh feedback</h2>
        <p>
          Compare Current, River and Gorse on the same eligible pieces. Would save is a preview
          opinion and does not save the piece in FORME. Add a reason after Not for me to separate
          taste from price or listing issues.
        </p>
        <p className="small">
          Earlier study files stay separate. Unknown motives are not relabelled as style dislikes.
          Unavailable or cold-start models are labelled explicitly.
        </p>
        <button
          className="btn"
          disabled={busy || outbox.pending > 0 || !items.length || !identity}
          onClick={() => void create()}
        >
          {busy ? "Preparing…" : "Create learning comparison"}
        </button>
      </section>
      {staleComparison && (
        <p className="notice" role="status">
          Your preferences or inventory changed. Create a fresh learning comparison before rating
          more pieces.
        </p>
      )}
      {comparison && !staleComparison && (
        <>
          <div className="preview-tabs" role="group" aria-label="Learning engine">
            {ENGINE_IDS.map((name) => (
              <button
                className={`chip ${engine === name ? "active" : ""}`}
                key={name}
                aria-pressed={engine === name}
                onClick={() => setEngine(name)}
              >
                {names[name]}
              </button>
            ))}
          </div>
          <p className="small section-note">
            Snapshot {formatDateTime(comparison.createdAt)} · {comparison.training.positive}{" "}
            positive / {comparison.training.negative} style training examples.{" "}
            {view?.mode === "learned"
              ? `Actual learned ordering. ${view.fallbackKeys?.length ?? 0} previously judged pieces retain fallback order.`
              : `${view?.mode ?? "unavailable"}: Current order is used where the model is not ready.`}
          </p>
          {!comparison.items.length ? (
            <Empty title="No new eligible pieces to review">
              Your filters and earlier feedback still apply.
            </Empty>
          ) : (
            <div className="grid preview-grid">
              {view?.keys.slice(0, shown).map((key) => {
                const item = byKey.get(key);
                if (!item) return null;
                const choice = choices[key];
                return (
                  <article className="product" key={key}>
                    <div className="photo">
                      <ProductPhoto src={item.imageUrl} alt={item.title} />
                    </div>
                    <div className="productmeta">
                      <ListingMetadata item={item} />
                      <div className="preview-choices">
                        {[
                          ["save", "Would save"],
                          ["dismiss", "Not for me"],
                          ["skip", "Skip"],
                        ].map(([value, label]) => (
                          <button
                            className="chip"
                            key={value}
                            aria-label={`${label}: ${item.title}`}
                            aria-pressed={choice?.choice === value}
                            onClick={() => vote(item, value)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {choice?.choice === "dismiss" && (
                        <button className="textbutton" onClick={() => setReasonKey(key)}>
                          {choice.reason
                            ? REASON_LABELS[choice.reason as keyof typeof REASON_LABELS]
                            : "Add reason"}
                        </button>
                      )}
                      {choice && (
                        <button className="textbutton" onClick={() => vote(item, "skip")}>
                          Clear preview choice
                        </button>
                      )}
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
                Show more review pieces
              </button>
            </div>
          )}
        </>
      )}
      {reasonKey && (
        <DislikeReasonDialog
          close={() => setReasonKey(null)}
          reason={choices[reasonKey]?.reason}
          change={(value) => reason(reasonKey, value)}
        />
      )}
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
                  setComparison(null);
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
          {confirm.run.channel === "preview" && (
            <label className="checkline">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />
              Use this model’s private-preview learning for Discover. My actual saves remain
              unchanged.
            </label>
          )}
          <div className="inline">
            <button
              className="btn"
              disabled={busy || (confirm.run.channel === "preview" && !consent)}
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
