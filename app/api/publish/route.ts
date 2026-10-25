import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { localAccess } from "@/lib/server/local-access";
import { guardCollection } from "@/lib/server/session";
import { publishPreview, publishSnapshot } from "@/lib/server/publish.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const fail = (error: string, status: number) => Response.json({ error }, { status, headers });
let publishing = false;

/** The owner's key lives only in this computer's environment; it is never sent to the browser or logged. */
function hosted() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
const snapshot = async () =>
  JSON.parse(await readFile(join(process.cwd(), "public/data/vinted.json"), "utf8"));

/** Free, read-only preview. Sends nothing to the hosted site. */
export async function GET(request: Request) {
  if (!localAccess(request)) return fail("Publishing is available only on this computer.", 403);
  {
    const denied = await guardCollection(request);
    if (denied) return denied;
  }
  const supabase = hosted();
  if (!supabase)
    return Response.json(
      {
        configured: false,
        message:
          "Publishing needs the owner key in .env.local on this computer (see docs/accounts-setup.md).",
      },
      { headers },
    );
  try {
    return Response.json(
      { configured: true, ...(await publishPreview({ supabase, snapshot: await snapshot() })) },
      { headers },
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not prepare the preview.", 502);
  }
}

/** Replaces what the hosted site shows with this computer's current listings. Costs no provider credits. */
export async function POST(request: Request) {
  if (!localAccess(request) || request.headers.get("content-type") !== "application/json")
    return fail("Local JSON requests only.", 403);
  {
    const denied = await guardCollection(request);
    if (denied) return denied;
  }
  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return fail("Unreadable request.", 400);
  }
  if (body?.action !== "publish") return fail("Unknown publish action.", 400);
  const supabase = hosted();
  if (!supabase) return fail("Publishing needs the owner key in .env.local on this computer.", 409);
  if (existsSync(join(process.cwd(), ".forme-data", "refresh.lock")))
    return fail("A collection run is in progress. Publish when it has finished.", 409);
  if (publishing) return fail("A publish is already running.", 409);
  publishing = true;
  try {
    const result = await publishSnapshot({ supabase, snapshot: await snapshot() });
    return Response.json({ ok: true, ...result }, { headers });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Publishing failed.", 502);
  } finally {
    publishing = false;
  }
}
