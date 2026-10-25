"use client";
import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/domain/presentation.mjs";

type Preview = {
  configured: boolean;
  message?: string;
  blocked?: string | null;
  local?: { listings: number; rejected: number; fetchedAt: string | null };
  hosted?: { listings: number; fetchedAt: string | null; publishedAt: string | null };
};
const count = (value: number) => `${value} listing${value === 1 ? "" : "s"}`;
const when = (value?: string | null) => (value ? formatDateTime(value) : "never");

/**
 * Puts this computer's current listings on the hosted site. The hosted app only reads what was published, and collection
 * itself stays on this computer, so this is the one step between a refresh and seeing it on a phone. It costs no provider
 * credits. The panel stays out of the way anywhere publishing is not possible (the hosted site, or no owner key).
 */
export default function PublishControls({ refreshed }: { refreshed?: () => Promise<void> }) {
  const [state, setState] = useState<"loading" | "unavailable" | "ready">("loading"),
    [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  async function load() {
    try {
      const response = await fetch("/api/publish", { cache: "no-store" });
      if (response.status === 403 || response.status === 401) return setState("unavailable");
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? "Could not prepare the preview.");
      setPreview(value);
      setState("ready");
    } catch (error) {
      setPreview(null);
      setFailed(true);
      setMessage((error as Error).message);
      setState("ready");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  if (state === "loading" || state === "unavailable") return null;
  async function publish() {
    setBusy(true);
    setFailed(false);
    setMessage("");
    try {
      const response = await fetch("/api/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "publish" }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? "Publishing failed.");
      setMessage(
        `Published ${count(value.published)} to the hosted site (it had ${value.previous}).${
          value.rejected ? ` ${value.rejected} failed validation and were left out.` : ""
        }`,
      );
      await load();
      await refreshed?.();
    } catch (error) {
      setFailed(true);
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const ready = !!preview?.configured && !!preview.local && !preview.blocked;
  return (
    <section className="panel publish-controls" id="publish">
      <h3>Hosted site</h3>
      <p>
        The hosted site shows the listings you last published. Collect on this computer, then
        publish to see the same pieces on your phone. Publishing costs no provider credits.
      </p>
      {preview?.configured === false && <p className="small section-note">{preview.message}</p>}
      {preview?.configured && preview.local && preview.hosted && (
        <dl className="publish-facts">
          <div>
            <dt>This computer</dt>
            <dd>
              {count(preview.local.listings)} · collected {when(preview.local.fetchedAt)}
            </dd>
          </div>
          <div>
            <dt>Hosted site</dt>
            <dd>
              {count(preview.hosted.listings)} · published {when(preview.hosted.publishedAt)}
            </dd>
          </div>
        </dl>
      )}
      {preview?.blocked && <p role="alert">{preview.blocked}</p>}
      <div className="inline">
        <button className="btn" disabled={!ready || busy} onClick={() => void publish()}>
          {busy ? "Publishing…" : "Publish to hosted site"}
        </button>
      </div>
      {message && (
        <p role={failed ? "alert" : "status"} className="small">
          {message}
        </p>
      )}
    </section>
  );
}
