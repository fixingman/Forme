"use client";
import { useState } from "react";
import { createBackup, parseBackup, type Backup } from "@/lib/settings-backup";
import type { Preferences } from "@/lib/preferences";
import type { Listing } from "@/lib/catalog";
export default function LocalProfile({
  settings,
  display,
  savedListings,
  restore,
}: {
  settings: Preferences;
  display: Backup["display"];
  savedListings: Listing[];
  restore: (backup: Backup) => void;
}) {
  const [revision, setRevision] = useState<number | null>(null),
    [pending, setPending] = useState<Backup | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function inspect() {
    setBusy(true);
    setPending(null);
    try {
      const response = await fetch("/api/local-profile", { cache: "no-store" });
      if (!response.ok) throw new Error("Local database unavailable. File backups still work.");
      const value = await response.json();
      setRevision(value.revision);
      if (value.profile) {
        setPending(parseBackup(value.profile));
        setMessage("Local copy loaded for review. Your browser settings have not changed.");
      } else setMessage("No local profile yet. Save your current settings to create one.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (revision === null) return;
    setBusy(true);
    try {
      const response = await fetch("/api/local-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: createBackup(settings, display, savedListings),
          baseRevision: revision,
        }),
      });
      if (response.status === 409) {
        setRevision(null);
        setPending(null);
        throw new Error(
          "Another tab updated the local copy. Check it again before saving. Your browser settings are unchanged.",
        );
      }
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? "Could not save settings.");
      setRevision(value.revision);
      setPending(null);
      setMessage("Settings saved on this computer. Future collection plans can use this copy.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h3>Local database</h3>
      <p>
        Keep a copy of your preferences and saved items on this computer. Changes stay in your
        browser until you save here. This is a personal pilot, without cloud sync.
      </p>
      <div className="inline">
        <button className="btn light" disabled={busy} onClick={() => void inspect()}>
          Check local copy
        </button>
        {revision !== null && (
          <button className="btn" disabled={busy} onClick={() => void save()}>
            Save current settings locally
          </button>
        )}
      </div>
      {pending && (
        <div className="notice">
          <p>
            Local revision {revision}: {pending.settings.following.length} followed brands,{" "}
            {pending.settings.saved.length} saved items. Restoring replaces your current browser
            preferences.
          </p>
          <button
            className="btn light"
            onClick={() => {
              try {
                restore(pending);
                setPending(null);
                setMessage("Local settings restored to this browser.");
              } catch (error) {
                setMessage((error as Error).message);
              }
            }}
          >
            Restore local copy
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
