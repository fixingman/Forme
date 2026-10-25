import { randomUUID } from "node:crypto";
import { LearningError, validId, evaluateEvidence } from "../domain/learning.mjs";
import {
  ANALYSIS_VERSION,
  ANALYST_INSTRUCTIONS,
  ANALYSIS_RESPONSE_SCHEMA,
  developmentEvidence,
  analysisFingerprint,
  validateAnalysis,
  digest,
} from "../domain/learning-analysis.mjs";
import { analysisStore } from "./learning-analysis-store.mjs";
import {
  analysisConfiguration,
  analysisQuote,
  requestAnalysis,
} from "./learning-analysis-provider.mjs";
export function learningAnalyst({
  root = process.cwd(),
  owner = "local",
  history,
  env = process.env,
  now = Date.now,
  request = requestAnalysis,
}) {
  const use = (fn) => {
    const store = analysisStore(root, owner);
    try {
      return fn(store);
    } finally {
      store.close();
    }
  };
  const config = () => analysisConfiguration(env);
  const find = (id) => {
    if (!validId(id)) throw new LearningError("Invalid analysis packet.");
    const packet = use((store) => store.get("packet", id));
    if (!packet) throw new LearningError("Analysis packet is unavailable.", 404);
    return packet;
  };
  const stale = (packet, h) => packet.fingerprint !== analysisFingerprint(h, packet.channel);
  const publicPacket = (packet, h) => {
    const { fingerprint, references, trainingRunId, ...visible } = packet;
    return { ...visible, stale: stale(packet, h) };
  };
  function exportPacket(packet) {
    return {
      app: "forme-learning-analyst",
      version: 1,
      packetId: packet.id,
      packetHash: packet.hash,
      instructions: ANALYST_INSTRUCTIONS,
      developmentEvidence: packet.payload,
      responseSchema: ANALYSIS_RESPONSE_SCHEMA,
      responseTemplate: {
        schemaVersion: 1,
        packetHash: packet.hash,
        summary: "Replace with the analyst summary.",
        findings: [],
        proposals: [],
        limitations: ["Development evidence is not release validation."],
      },
    };
  }
  async function prepare(channel) {
    const h = await history(),
      projection = developmentEvidence(h, channel),
      id = randomUUID(),
      payload = projection.payload;
    const packet = {
      id,
      channel,
      createdAt: new Date(now()).toISOString(),
      version: ANALYSIS_VERSION,
      payload,
      hash: digest(payload),
      fingerprint: analysisFingerprint(h, channel),
      references: projection.references,
      trainingRunId: projection.trainingRunId,
    };
    packet.quote = analysisQuote(packet, config());
    use((store) => store.put("packet", packet));
    return { ...publicPacket(packet, h), export: exportPacket(packet) };
  }
  async function importReport({ packetId, report }) {
    const packet = find(packetId),
      data = validateAnalysis(report, packet),
      id = randomUUID();
    const existing = use((store) =>
      store
        .list("report")
        .find((row) => row.packetId === packetId && digest(row.data) === digest(data)),
    );
    if (existing) return existing;
    return use((store) =>
      store.put("report", {
        id,
        packetId,
        packetHash: packet.hash,
        channel: packet.channel,
        createdAt: new Date(now()).toISOString(),
        origin: "imported",
        provider: null,
        model: null,
        data,
      }),
    );
  }
  async function run({ packetId, packetHash, approveDataTransfer, maxUsd }) {
    const packet = find(packetId),
      previous = use((store) => store.call(packetId));
    if (previous) {
      const report = use((store) => store.list("report").find((row) => row.attemptId === packetId));
      if (previous.status === "complete" && report) return report;
      throw new LearningError(
        "This packet already has a provider attempt. Its reservation is retained; no retry will be sent.",
        409,
      );
    }
    const configuration = config();
    if (!configuration.configured)
      throw new LearningError(
        "Provider is unconfigured. Export the evidence packet or import a report instead.",
        409,
      );
    const h = await history();
    if (stale(packet, h))
      throw new LearningError(
        "Feedback or candidates changed. Prepare fresh evidence before sending it.",
        409,
      );
    const quote = analysisQuote(packet, configuration);
    if (!packet.quote || packet.quote.configurationHash !== quote.configurationHash)
      throw new LearningError("Analysis configuration changed. Prepare a new cost preview.", 409);
    if (approveDataTransfer !== true || packetHash !== packet.hash || maxUsd !== quote.maxUsd)
      throw new LearningError(
        "Approve this evidence packet and its exact cost preview first.",
        403,
      );
    if (!quote.withinRunLimit)
      throw new LearningError(
        "This estimate exceeds the configured per-run analysis limit. No request was sent.",
        409,
      );
    if (packet.payload.evidence[0].decisions < 2)
      throw new LearningError(
        "At least two current development judgments in a trained snapshot are needed before calling a provider.",
        409,
      );
    use((store) => store.reserve(packet, quote, configuration, now()));
    try {
      const result = await request(packet, configuration, { env }),
        data = validateAnalysis(result.text, packet),
        id = randomUUID();
      const report = {
        id,
        packetId,
        attemptId: packetId,
        packetHash: packet.hash,
        channel: packet.channel,
        createdAt: new Date(now()).toISOString(),
        origin: "provider",
        provider: configuration.provider,
        model: configuration.model,
        usage: result.usage,
        data,
      };
      use((store) => {
        if (!store.get("packet", packetId))
          throw new LearningError("The evidence packet was deleted during analysis.", 409);
        store.put("report", report);
        store.finish(packetId, "complete", { usage: result.usage });
      });
      return report;
    } catch (error) {
      use((store) => store.finish(packetId, "uncertain"));
      throw new LearningError(
        error instanceof LearningError
          ? `${error.message} The request may be billed; no retry was made.`
          : "Analysis did not finish. It may be billed; the reservation is retained and no retry was made.",
        502,
      );
    }
  }
  async function track({ reportId, proposalId }) {
    if (!validId(reportId)) throw new LearningError("Invalid analysis report.");
    const report = use((store) => store.get("report", reportId));
    if (!report) throw new LearningError("Analysis report is unavailable.", 404);
    const packet = find(report.packetId),
      h = await history();
    if (stale(packet, h))
      throw new LearningError(
        "The analysis is historical. Prepare and review fresh evidence before starting an experiment.",
        409,
      );
    const proposal = report.data.proposals.find((row) => row.id === proposalId);
    if (!proposal?.candidate)
      throw new LearningError(
        "This proposal needs a reviewed code change before it can be tested.",
      );
    const existing = use((store) =>
      store
        .list("experiment")
        .find((row) => row.reportId === reportId && row.proposalId === proposalId),
    );
    if (existing) return existing;
    const experiment = {
      id: randomUUID(),
      reportId,
      proposalId,
      packetId: packet.id,
      createdAt: new Date(now()).toISOString(),
      channel: packet.channel,
      candidate: proposal.candidate,
      eventCutoff: h.events.at(-1)?.ordinal ?? 0,
      predictionCutoff: h.runs.at(-1)?.ordinal ?? 0,
      policy: packet.payload.labelPolicy,
      testPlan: proposal.testPlan,
    };
    use((store) => store.put("experiment", experiment));
    return experiment;
  }
  async function status() {
    const h = await history(),
      configuration = config(),
      stored = use((store) => ({
        packets: store.list("packet"),
        reports: store.list("report"),
        experiments: store.list("experiment"),
        calls: store.calls(now()),
      }));
    const packets = new Map(stored.packets.map((packet) => [packet.id, packet]));
    const experiments = stored.experiments
      .slice(-10)
      .reverse()
      .map((experiment) => {
        const metrics = evaluateEvidence({
          ...h,
          channel: experiment.channel,
          afterEventOrdinal: experiment.eventCutoff,
          afterPredictionOrdinal: experiment.predictionCutoff,
        });
        return { ...experiment, evidence: metrics.engines[experiment.candidate] };
      });
    const day = new Date(now()).toISOString().slice(0, 10),
      reservedUsd = stored.calls
        .filter((row) => row.day === day)
        .reduce((sum, row) => sum + row.reservedUsd, 0);
    return {
      configuration,
      reservedUsd,
      remainingUsd: Math.max(0, configuration.dailyUsd - reservedUsd),
      packets: stored.packets
        .slice(-5)
        .reverse()
        .map((packet) => ({ ...publicPacket(packet, h), export: exportPacket(packet) })),
      reports: stored.reports
        .slice(-10)
        .reverse()
        .map((report) => ({
          ...report,
          stale: !packets.has(report.packetId) || stale(packets.get(report.packetId), h),
          evidence: packets.get(report.packetId)?.payload.evidence ?? [],
        })),
      experiments,
      calls: stored.calls.slice(-10).reverse(),
    };
  }
  return { prepare, importReport, run, track, status };
}
