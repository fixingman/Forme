import { learningContext } from "@/lib/server/learning-access";
import { learningAnalyst } from "@/lib/server/learning-analysis.mjs";
import { LearningError } from "@/lib/domain/learning.mjs";
import { originOf } from "@/lib/server/auth-policy.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
async function analyst(request: Request) {
  const ctx = await learningContext(request);
  if ("denied" in ctx) return ctx;
  if (!ctx.canTrain)
    return {
      denied: json({ error: "Learning analysis is available on the owner’s computer." }, 403),
    };
  return {
    service: learningAnalyst({ owner: ctx.owner, history: () => ctx.service.exportHistory() }),
  };
}
const failure = (error: unknown) =>
  json(
    {
      error:
        error instanceof LearningError
          ? error.message
          : "Analysis is unavailable. No ranking changes were made.",
    },
    error instanceof LearningError ? error.status : 500,
  );
export async function GET(request: Request) {
  try {
    const ctx = await analyst(request);
    if ("denied" in ctx) return ctx.denied;
    return json(await ctx.service.status());
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    if (
      request.headers.get("origin") !== originOf(request.headers, request.url) ||
      !/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")
    )
      throw new LearningError("Same-origin JSON required.", 403);
    const reader = request.body?.getReader();
    if (!reader) throw new LearningError("Missing analysis request.");
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > 32768) {
        await reader.cancel();
        throw new LearningError("Analysis request is too large.", 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    let body;
    try {
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new LearningError("Invalid analysis JSON.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new LearningError("Invalid analysis request.");
    const ctx = await analyst(request);
    if ("denied" in ctx) return ctx.denied;
    const service = ctx.service;
    if (body.action === "prepare") return json(await service.prepare(body.channel));
    if (body.action === "import") return json(await service.importReport(body));
    if (body.action === "run") return json(await service.run(body));
    if (body.action === "track") return json(await service.track(body));
    throw new LearningError("Unknown analysis action.");
  } catch (error) {
    return failure(error);
  }
}
