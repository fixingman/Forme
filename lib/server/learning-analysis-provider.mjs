import { LearningError } from "../domain/learning.mjs";
import {
  ANALYST_INSTRUCTIONS,
  ANALYSIS_RESPONSE_SCHEMA,
  digest,
} from "../domain/learning-analysis.mjs";
export const MAX_ANALYSIS_OUTPUT = 1800;
export function analysisConfiguration(env = process.env) {
  const provider = env.FORME_ANALYSIS_PROVIDER ?? "",
    model = env.FORME_ANALYSIS_MODEL ?? "",
    key = env.FORME_ANALYSIS_API_KEY ?? "";
  const positive = (name) => {
    const text = env[name];
    const value = Number(text);
    return text && Number.isFinite(value) && value > 0 && value <= 1000000 ? value : 0;
  };
  const inputUsd = positive("FORME_ANALYSIS_INPUT_USD_PER_MILLION"),
    outputUsd = positive("FORME_ANALYSIS_OUTPUT_USD_PER_MILLION"),
    dailyUsd = positive("FORME_ANALYSIS_DAILY_USD_LIMIT"),
    maxRunUsd = positive("FORME_ANALYSIS_MAX_RUN_USD");
  const configured =
    ["openai", "anthropic"].includes(provider) &&
    /^[a-zA-Z0-9_.:-]{1,100}$/.test(model) &&
    !!key &&
    inputUsd > 0 &&
    outputUsd > 0 &&
    dailyUsd > 0 &&
    maxRunUsd > 0;
  return {
    configured,
    provider: ["openai", "anthropic"].includes(provider) ? provider : null,
    model: /^[a-zA-Z0-9_.:-]{1,100}$/.test(model) ? model : null,
    inputUsd,
    outputUsd,
    dailyUsd,
    maxRunUsd,
  };
}
export function analysisRequestBody(packet, config) {
  const input = JSON.stringify({ packetHash: packet.hash, ...packet.payload });
  if (config.provider === "openai")
    return {
      model: config.model,
      instructions: ANALYST_INSTRUCTIONS,
      input,
      store: false,
      max_output_tokens: MAX_ANALYSIS_OUTPUT,
      text: {
        format: {
          type: "json_schema",
          name: "forme_learning_analysis",
          strict: true,
          schema: ANALYSIS_RESPONSE_SCHEMA,
        },
      },
    };
  if (config.provider === "anthropic")
    return {
      model: config.model,
      system: ANALYST_INSTRUCTIONS,
      messages: [{ role: "user", content: input }],
      max_tokens: MAX_ANALYSIS_OUTPUT,
      output_config: { format: { type: "json_schema", schema: ANALYSIS_RESPONSE_SCHEMA } },
    };
  throw new LearningError("No analysis provider is configured.", 409);
}
export function analysisQuote(packet, config) {
  if (!config.configured) return null;
  const request = analysisRequestBody(packet, config),
    bytes = Buffer.byteLength(JSON.stringify(request));
  if (bytes > 32768)
    throw new LearningError("Analysis evidence is too large. Prepare a smaller packet.");
  // UTF-8 bytes plus schema/message overhead form a deliberately loose token bound. No cache discount is assumed.
  const inputTokensBound = bytes + 4096,
    maxUsd =
      Math.ceil(
        ((inputTokensBound * config.inputUsd + MAX_ANALYSIS_OUTPUT * config.outputUsd) / 1e6) * 1e6,
      ) / 1e6;
  return {
    provider: config.provider,
    model: config.model,
    inputTokensBound,
    maxOutputTokens: MAX_ANALYSIS_OUTPUT,
    maxUsd,
    withinRunLimit: maxUsd <= config.maxRunUsd,
    configurationHash: digest(config),
  };
}
export async function requestAnalysis(
  packet,
  config,
  { env = process.env, fetchImpl = fetch } = {},
) {
  if (!config.configured) throw new LearningError("No analysis provider is configured.", 409);
  // Dedicated app key only. Never inherit agent sessions, global base URLs, proxies or machine routing.
  const key = env.FORME_ANALYSIS_API_KEY;
  if (!key) throw new LearningError("Analysis credentials are unavailable.", 409);
  const url =
    config.provider === "openai"
      ? "https://api.openai.com/v1/responses"
      : "https://api.anthropic.com/v1/messages";
  const headers = {
    "Content-Type": "application/json",
    ...(config.provider === "openai"
      ? { Authorization: `Bearer ${key}` }
      : { Authorization: `Bearer ${key}`, "anthropic-version": "2026-10-21" }),
  };
  const response = await fetchImpl(url, {
    method: "POST",
    headers,
    body: JSON.stringify(analysisRequestBody(packet, config)),
    signal: AbortSignal.timeout(30000),
    redirect: "error",
  });
  if (!response.ok)
    throw new LearningError(
      "The provider did not return an analysis. The reservation is retained; no retry was made.",
      502,
    );
  const reader = response.body?.getReader();
  if (!reader) throw new LearningError("The provider returned no analysis.", 502);
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 65536) {
      await reader.cancel();
      throw new LearningError("The provider response exceeded the analysis limit.", 502);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let data;
  try {
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new LearningError("The provider returned unreadable analysis.", 502);
  }
  let text;
  if (config.provider === "openai") {
    if (data.status !== "completed")
      throw new LearningError("Analysis was refused or incomplete. No retry was made.", 502);
    text = data.output
      ?.filter((row) => row.type === "message")
      .flatMap((row) => row.content ?? [])
      .filter((row) => row.type === "output_text")
      .map((row) => row.text)
      .join("");
  } else {
    if (data.stop_reason !== "end_turn")
      throw new LearningError("Analysis was refused or incomplete. No retry was made.", 502);
    text = data.content
      ?.filter((row) => row.type === "text")
      .map((row) => row.text)
      .join("");
  }
  if (!text) throw new LearningError("The provider returned no usable analysis.", 502);
  const usage = data.usage,
    inputTokens = usage?.input_tokens,
    outputTokens = usage?.output_tokens;
  return {
    text,
    usage:
      Number.isSafeInteger(inputTokens) &&
      inputTokens >= 0 &&
      Number.isSafeInteger(outputTokens) &&
      outputTokens >= 0
        ? { inputTokens, outputTokens }
        : null,
  };
}
