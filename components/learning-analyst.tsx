"use client";
import { useEffect, useState } from "react";
import Dialog from "./ui/dialog";
import { formatDateTime } from "@/lib/domain/presentation.mjs";
type Fact = { id: string; [key: string]: unknown };
type Quote = {
  provider: string;
  model: string;
  maxUsd: number;
  maxOutputTokens: number;
  withinRunLimit: boolean;
};
type Packet = {
  id: string;
  hash: string;
  channel: string;
  createdAt: string;
  stale: boolean;
  quote: Quote | null;
  payload: { evidence: Fact[]; scope: string; limitations: string[] };
  export: unknown;
};
type Proposal = {
  id: string;
  kind: string;
  candidate: string | null;
  rationale: string;
  evidenceIds: string[];
  testPlan: string;
};
type Report = {
  id: string;
  packetId: string;
  createdAt: string;
  origin: string;
  provider: string | null;
  model: string | null;
  stale: boolean;
  evidence: Fact[];
  data: {
    summary: string;
    findings: { id: string; finding: string; evidenceIds: string[]; confidence: string }[];
    proposals: Proposal[];
    limitations: string[];
  };
};
type Experiment = {
  id: string;
  reportId: string;
  proposalId: string;
  createdAt: string;
  candidate: string;
  channel: string;
  evidence: {
    eligible: boolean;
    status: string;
    pairs: number;
    days: number;
    meanDailyGain: number;
    lowerGain: number | null;
  };
};
type Status = {
  configuration: {
    configured: boolean;
    provider: string | null;
    model: string | null;
    dailyUsd: number;
  };
  reservedUsd: number;
  remainingUsd: number;
  packets: Packet[];
  reports: Report[];
  experiments: Experiment[];
  calls: { id: string; status: string; reservedUsd: number }[];
};
const labels: Record<string, string> = {
  collect_feedback: "Gather more judgments",
  compare_regularization: "Compare conservative River",
  compare_existing_engines: "Compare existing engines",
  review_material_features: "Review material features",
  review_color_features: "Review colour features",
  inspect_data_quality: "Inspect listing data",
  review_coverage: "Review model coverage",
  review_diversity: "Review variety",
};
const names: Record<string, string> = {
  current: "Current",
  river: "River",
  "river-regularized": "River · conservative",
  gorse: "Gorse",
};
const usd = (value: number) => "$" + value.toFixed(4);
async function api(body?: unknown) {
  const response = await fetch("/api/learning-analysis", {
    cache: "no-store",
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error ?? "Analysis is unavailable.");
  return result;
}
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    ),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
function Evidence({ ids, facts }: { ids: string[]; facts: Fact[] }) {
  return (
    <details className="analyst-evidence">
      <summary>Evidence: {ids.join(", ")}</summary>
      <pre>
        {JSON.stringify(
          facts.filter((row) => ids.includes(row.id)),
          null,
          2,
        )}
      </pre>
    </details>
  );
}
export default function LearningAnalyst({ pendingFeedback = 0 }: { pendingFeedback?: number }) {
  const [status, setStatus] = useState<Status | null>(null),
    [packet, setPacket] = useState<Packet | null>(null),
    [channel, setChannel] = useState("shopping"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [importing, setImporting] = useState(false),
    [reportText, setReportText] = useState(""),
    [confirming, setConfirming] = useState(false),
    [consent, setConsent] = useState(false);
  async function reload(preferredId?: string) {
    try {
      const value = await api();
      if (
        !value.configuration ||
        !["packets", "reports", "experiments", "calls"].every((key) => Array.isArray(value[key]))
      )
        throw Error("Analysis history is unavailable.");
      setStatus(value);
      setPacket(
        (previous) =>
          value.packets.find((row: Packet) => row.id === (preferredId ?? previous?.id)) ??
          value.packets[0] ??
          null,
      );
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  useEffect(() => {
    void reload();
    const refresh = () => void reload();
    window.addEventListener("forme-learning-selection", refresh);
    return () => window.removeEventListener("forme-learning-selection", refresh);
  }, []);
  async function prepare() {
    setBusy(true);
    setMessage("");
    try {
      const value = await api({ action: "prepare", channel });
      setPacket(value);
      await reload(value.id);
      setMessage("Evidence is ready to review. Preparing it makes no model call.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function importReport() {
    if (!packet) return;
    setBusy(true);
    try {
      await api({ action: "import", packetId: packet.id, report: reportText });
      setImporting(false);
      setReportText("");
      await reload();
      setMessage("Advisory report imported. Review its evidence and proposals below.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function run() {
    if (!packet?.quote) return;
    setBusy(true);
    setConfirming(false);
    setMessage("Analysis requested. This request will not be retried automatically.");
    try {
      await api({
        action: "run",
        packetId: packet.id,
        packetHash: packet.hash,
        approveDataTransfer: consent,
        maxUsd: packet.quote.maxUsd,
      });
      await reload();
      setMessage("Analysis is ready. Review the evidence before acting on a proposal.");
    } catch (error) {
      setMessage((error as Error).message);
      await reload();
    } finally {
      setBusy(false);
    }
  }
  async function track(report: Report, proposal: Proposal) {
    setBusy(true);
    try {
      await api({ action: "track", reportId: report.id, proposalId: proposal.id });
      await reload();
      setMessage(
        "Comparison tracked. New predictions and your later feedback will supply its evidence.",
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const call = packet && status?.calls.find((row) => row.id === packet.id),
    canRun =
      !!status?.configuration.configured &&
      !!packet?.quote?.withinRunLimit &&
      !packet.stale &&
      !call &&
      Number(packet.payload.evidence[0]?.decisions) >= 2;
  return (
    <details className="panel analyst-panel">
      <summary>
        <strong>LLM failure analysis</strong>
        <span className="small"> Explain mistakes and propose tests</span>
      </summary>
      <p>
        Your judgments remain the taste reference. The analyst reviews development evidence and
        proposes changes for review.
      </p>
      <p className="small analyst-cycle">
        Selected version → future rankings → your feedback → evaluation → next candidates → review →
        selected version.
      </p>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <p className="small">
        {status?.configuration.configured
          ? `${status.configuration.provider} · ${status.configuration.model}. Reserved today: ${usd(status.reservedUsd)} of ${usd(status.configuration.dailyUsd)}.`
          : "Provider not configured. Export and import are available; no model calls are enabled."}
      </p>
      <div className="analyst-controls">
        <label>
          Feedback source
          <select value={channel} onChange={(event) => setChannel(event.target.value)}>
            <option value="shopping">Shopping judgments</option>
            <option value="preview">Private preview judgments</option>
          </select>
        </label>
        <button
          className="btn light"
          disabled={busy || pendingFeedback > 0 || !status}
          onClick={() => void prepare()}
        >
          Prepare evidence
        </button>
        <button className="textbutton" disabled={busy} onClick={() => void reload()}>
          Refresh analysis history
        </button>
      </div>
      {pendingFeedback > 0 && (
        <p className="small">Sync pending feedback before preparing an analysis.</p>
      )}
      {packet && (
        <section className="analyst-packet" aria-label="Prepared analysis evidence">
          <h3>Prepared {packet.channel === "preview" ? "preview" : "shopping"} evidence</h3>
          <p className="small">
            {formatDateTime(packet.createdAt)} ·{" "}
            {Number(packet.payload.evidence[0]?.decisions ?? 0)} development judgments. Account
            details, listing links, images, raw titles and future validation answers are omitted.
            Text traits remain inference.
          </p>
          {packet.stale && (
            <p className="notice">
              Feedback or candidates changed. Prepare fresh evidence before a provider call or new
              tracked comparison.
            </p>
          )}
          <details className="analyst-evidence">
            <summary>Review the exact evidence packet</summary>
            <pre>{JSON.stringify(packet.export, null, 2)}</pre>
          </details>
          <div className="inline">
            <button
              className="btn light"
              onClick={() => download(packet.export, "forme-analysis-packet.json")}
            >
              Download evidence packet
            </button>
            <button
              className="btn light"
              disabled={busy}
              onClick={() => {
                setReportText("");
                setImporting(true);
              }}
            >
              Import analyst report
            </button>
            {status?.configuration.configured && (
              <button
                className="btn"
                disabled={busy || pendingFeedback > 0 || !canRun}
                onClick={() => {
                  setConsent(false);
                  setConfirming(true);
                }}
              >
                Review provider request
              </button>
            )}
          </div>
          {packet.quote && (
            <p className="small">
              Conservative estimate: up to {usd(packet.quote.maxUsd)}, using configured model rates
              and at most {packet.quote.maxOutputTokens} output tokens.{" "}
              {packet.quote.withinRunLimit ? "" : "This exceeds the configured per-run limit."}{" "}
              Provider billing is authoritative.
            </p>
          )}
          {call && (
            <p className="small">
              Provider attempt: {call.status}. Reserved {usd(call.reservedUsd)}. This packet cannot
              send another request.
            </p>
          )}
        </section>
      )}
      {!!status?.reports.length && (
        <section aria-label="Analyst reports">
          <h3>Advisory reports</h3>
          {status.reports.map((report) => (
            <article className="analyst-report" key={report.id}>
              <p className="small">
                {formatDateTime(report.createdAt)} ·{" "}
                {report.origin === "imported"
                  ? "Imported · model origin unverified"
                  : `${report.provider} · ${report.model}`}{" "}
                {report.stale ? "· Historical snapshot" : ""}
              </p>
              <p>{report.data.summary}</p>
              {report.data.findings.map((finding) => (
                <div className="analyst-finding" key={finding.id}>
                  <p>{finding.finding}</p>
                  <p className="small">
                    Author confidence: {finding.confidence}; advisory, not statistical evidence.
                  </p>
                  <Evidence ids={finding.evidenceIds} facts={report.evidence} />
                </div>
              ))}
              {report.data.proposals.map((proposal) => {
                const tracked = status.experiments.some(
                  (row) => row.reportId === report.id && row.proposalId === proposal.id,
                );
                return (
                  <div className="analyst-proposal" key={proposal.id}>
                    <h4>{labels[proposal.kind] ?? proposal.kind}</h4>
                    <p>{proposal.rationale}</p>
                    <p className="small">
                      <strong>Test:</strong> {proposal.testPlan}
                    </p>
                    <Evidence ids={proposal.evidenceIds} facts={report.evidence} />
                    {proposal.candidate ? (
                      <button
                        className="btn light"
                        disabled={busy || report.stale || tracked || pendingFeedback > 0}
                        onClick={() => void track(report, proposal)}
                      >
                        {tracked
                          ? "Comparison tracked"
                          : `Track future ${names[proposal.candidate]} comparison`}
                      </button>
                    ) : (
                      <p className="small">
                        Draft proposal: needs a reviewed implementation before it can be tested.
                      </p>
                    )}
                  </div>
                );
              })}
              {report.data.limitations.map((value, index) => (
                <p className="small" key={index}>
                  {value}
                </p>
              ))}
            </article>
          ))}
        </section>
      )}
      {!!status?.experiments.length && (
        <section aria-label="Tracked analysis comparisons">
          <h3>Future evidence</h3>
          {status.experiments.map((experiment) => (
            <article className="analyst-report" key={experiment.id}>
              <h4>
                {names[experiment.candidate]} ·{" "}
                {experiment.channel === "preview" ? "private preview" : "shopping"}
              </h4>
              <p className="small">
                Started {formatDateTime(experiment.createdAt)}. Only predictions and judgments after
                this comparison started count.
              </p>
              <p>
                {experiment.evidence.status.replaceAll("-", " ")} · {experiment.evidence.pairs}{" "}
                judged pairs across {experiment.evidence.days} days.
              </p>
              <p className="small">
                Future rankings and your later votes update this comparison. Use the activation
                review above to choose a version when enough evidence exists.
              </p>
            </article>
          ))}
        </section>
      )}
      <p className="small">
        Reports are advisory. Proposals cannot change your preferences, labels, collection budget or
        selected version. Learning-history export includes these reports; deleting learning history
        removes them while retaining billing reservations.
      </p>
      {importing && packet && (
        <Dialog title="Import analyst report" close={() => setImporting(false)}>
          <p>
            Ask your chosen model to use the downloaded packet, then paste its JSON response.
            Imported reports are labelled as unverified in origin.
          </p>
          <label className="analyst-import-label">
            Analyst JSON
            <textarea
              rows={12}
              maxLength={24000}
              value={reportText}
              onChange={(event) => setReportText(event.target.value)}
            />
          </label>
          <div className="inline">
            <button
              className="btn"
              disabled={busy || !reportText.trim()}
              onClick={() => void importReport()}
            >
              Validate and import
            </button>
            <button className="btn light" onClick={() => setImporting(false)}>
              Cancel
            </button>
          </div>
        </Dialog>
      )}
      {confirming && packet?.quote && (
        <Dialog title="Send this evidence for analysis?" close={() => setConfirming(false)}>
          <p>
            Send the reviewed development packet to {packet.quote.provider}, using{" "}
            {packet.quote.model}. The conservative estimate is {usd(packet.quote.maxUsd)} under your
            configured rates. Remaining daily allowance: {usd(status?.remainingUsd ?? 0)}.
          </p>
          <p className="small">
            One request, no automatic retries. If billing is uncertain, the reservation stays in
            place.
          </p>
          <label className="checkline">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            Approve this evidence transfer and cost preview.
          </label>
          <div className="inline">
            <button className="btn" disabled={busy || !consent} onClick={() => void run()}>
              Run analysis · up to {usd(packet.quote.maxUsd)}
            </button>
            <button className="btn light" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </Dialog>
      )}
    </details>
  );
}
