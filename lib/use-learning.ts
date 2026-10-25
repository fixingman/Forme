"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBackup } from "./settings-backup";
import type { Preferences } from "./preferences";
import type { Listing } from "./catalog";
import { listingKey } from "./domain/recommendations.mjs";
import { validKey } from "./domain/learning.mjs";
import {
  pendingOperations,
  queueOperation,
  acknowledgeOperation,
} from "./domain/learning-outbox.mjs";
export type DislikeReason =
  | "style"
  | "material"
  | "color"
  | "price"
  | "data"
  | "unneeded"
  | "similar"
  | "unspecified";
type Operation = {
  id: string;
  action: "events" | "exposure";
  events?: unknown[];
  exposure?: unknown;
};
const locks = new Set<string>();
function readQueue(key: string): Operation[] {
  return pendingOperations(localStorage, key);
}
export async function learningRequest(body?: unknown) {
  const response = await fetch("/api/learning", {
    cache: "no-store",
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const value = await response.json();
  if (!response.ok) throw Error(value.error ?? "Learning history is unavailable.");
  return value;
}
function stagingScope() {
  const key = "forme-learning-pending-session";
  let value = JSON.parse(sessionStorage.getItem(key) ?? "null");
  if (!value) {
    let expected = null;
    try {
      expected = JSON.parse(localStorage.getItem("forme-sync") ?? "null")?.user ?? null;
    } catch {}
    value = { id: crypto.randomUUID(), expected };
    sessionStorage.setItem(key, JSON.stringify(value));
  }
  return { key: "forme-learning-outbox-v1:pending:" + value.id, expected: value.expected };
}
export function useLearningOutbox(identity: string | null, captureUnassigned = false) {
  const storageKey = identity ? "forme-learning-outbox-v1:" + identity : null;
  const [pending, setPending] = useState(0),
    [error, setError] = useState("");
  const currentKey = useRef(storageKey);
  currentKey.current = storageKey;
  const refresh = useCallback(() => {
    if (storageKey || captureUnassigned)
      try {
        setPending(readQueue(storageKey ?? stagingScope().key).length);
      } catch (e) {
        setError((e as Error).message);
      }
  }, [storageKey, captureUnassigned]);
  const flush = useCallback(async () => {
    if (!storageKey || locks.has(storageKey)) return;
    locks.add(storageKey);
    try {
      let queue = readQueue(storageKey);
      while (queue.length) {
        const op = queue[0];
        await learningRequest({
          action: op.action,
          ...(op.action === "events" ? { events: op.events } : { exposure: op.exposure }),
        });
        if (currentKey.current !== storageKey) return;
        acknowledgeOperation(localStorage, storageKey, op.id);
        queue = readQueue(storageKey);
        setPending(queue.length);
      }
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      locks.delete(storageKey);
      window.dispatchEvent(new Event("forme-learning-queue"));
    }
  }, [storageKey]);
  const enqueue = useCallback(
    (operation: Operation) => {
      if (!storageKey && !captureUnassigned) return false;
      try {
        const key = storageKey ?? stagingScope().key;
        queueOperation(localStorage, key, operation);
        setPending(readQueue(key).length);
        window.dispatchEvent(new Event("forme-learning-queue"));
        void flush();
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      }
    },
    [storageKey, flush, captureUnassigned],
  );
  useEffect(() => {
    if (!storageKey) {
      refresh();
      return;
    }
    try {
      const staged = stagingScope();
      if (!staged.expected || staged.expected === identity) {
        for (const op of readQueue(staged.key)) {
          queueOperation(localStorage, storageKey, op);
          acknowledgeOperation(localStorage, staged.key, op.id);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    }
    refresh();
    void flush();
    const wake = () => void flush(),
      timer = setInterval(wake, 15000);
    window.addEventListener("online", wake);
    window.addEventListener("forme-learning-queue", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", wake);
      window.removeEventListener("forme-learning-queue", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [storageKey, flush, refresh]);
  return { pending, error, setError, enqueue, flush };
}
export function useLearning({
  settings,
  savedListings,
  items,
  identity,
  discover,
  enabled = true,
}: {
  settings: Preferences;
  savedListings: Listing[];
  items: Listing[];
  identity: string | null;
  discover: boolean;
  enabled?: boolean;
}) {
  const { enqueue, flush, pending, error, setError } = useLearningOutbox(identity, enabled);
  const [view, setView] = useState<{
    id: string;
    items: Listing[];
    selectedKeys: string[] | null;
    selectedName: string;
    contextKey: string;
  } | null>(null);
  const generation = useRef(0),
    seen = useRef(new Map<string, string>()),
    wasDiscover = useRef(false);
  const profile = useMemo(
    () => createBackup(settings, { mode: "live", collapsed: false }, savedListings),
    [settings, savedListings],
  );
  const fingerprint = JSON.stringify([settings, savedListings, items]);
  const contextKey = JSON.stringify([
    settings.gender,
    settings.sizing,
    settings.following,
    settings.excluded,
    settings.styles,
    settings.styleRules,
    items,
  ]);
  const latest = useRef({ view });
  latest.current = { view };
  useEffect(() => {
    const clear = () => {
      setView(null);
      seen.current.clear();
    };
    clear();
    window.addEventListener("forme-learning-selection", clear);
    return () => window.removeEventListener("forme-learning-selection", clear);
  }, [identity]);
  useEffect(() => {
    const newVisit = discover && !wasDiscover.current;
    wasDiscover.current = discover;
    if (!identity || !discover || !items.length) return;
    const version = ++generation.current;
    const timer = setTimeout(() => {
      void learningRequest({ action: "snapshot", profile, items, channel: "shopping" })
        .then((result) => {
          if (version === generation.current) {
            setView((previous) => {
              if (!newVisit && previous?.contextKey === contextKey) {
                // Feedback must not split one review into incomparable one-vote pools.
                // Refresh selection validity, while retaining the pre-vote prediction/exposure IDs.
                return {
                  ...previous,
                  selectedKeys: result.selectedKeys,
                  selectedName: result.selectedName,
                };
              }
              seen.current.clear();
              return { ...result, contextKey };
            });
          }
        })
        .catch((e) => {
          if (version === generation.current) setError(e.message);
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      generation.current++;
    };
  }, [identity, discover, fingerprint]);
  const visible = useCallback(
    (item: Listing, position?: number) => {
      const current = latest.current.view,
        key = listingKey(item);
      if (!current?.items.some((row) => listingKey(row) === key)) return undefined;
      const token = current.id + "|" + key,
        previous = seen.current.get(token);
      if (previous) return previous;
      const id = crypto.randomUUID();
      if (
        enqueue({
          id,
          action: "exposure",
          exposure: {
            id,
            runId: current.id,
            keys: [key],
            channel: "shopping",
            surface:
              /^(?:\/|\/(?:discover|following|saved|searches(?:\/\d+)?|items\/\d+|tools\/learning))$/.test(
                window.location.pathname,
              )
                ? window.location.pathname
                : "unknown",
            trigger: position === undefined ? "decision" : "visible",
            positions: position === undefined ? {} : { [key]: position },
          },
        })
      ) {
        seen.current.set(token, id);
        return id;
      }
      return undefined;
    },
    [enqueue, view?.id],
  );
  const record = useCallback(
    (key: string, action: string, item?: Listing, reason?: DislikeReason, targetId?: string) => {
      if (!enabled || !validKey(key) || (item && item.source !== "vinted")) return undefined;
      const id = crypto.randomUUID(),
        exposureId = item ? visible(item) : undefined;
      const event = {
        id,
        key,
        action,
        channel: "shopping",
        occurredAt: new Date().toISOString(),
        ...(item ? { item } : {}),
        ...(reason ? { reason } : {}),
        ...(targetId ? { targetId } : {}),
        ...(exposureId ? { exposureId } : {}),
      };
      return enqueue({ id, action: "events", events: [event] }) ? id : undefined;
    },
    [enabled, visible, enqueue],
  );
  return {
    record,
    visible,
    flush,
    pending,
    error,
    selectedKeys: view?.selectedKeys ?? null,
    selectedName: view?.selectedName ?? "current",
  };
}
