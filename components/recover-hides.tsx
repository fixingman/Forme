"use client";
import { useEffect, useState } from "react";
import type { Preferences } from "@/lib/preferences";
import { hidesToCarry } from "@/lib/domain/profile-merge.mjs";
import { formatDateTime } from "@/lib/domain/presentation.mjs";

const ASIDE = "forme-v2-before-sync",
  HANDLED = "forme-aside-handled";
type Aside = { savedAt?: string; settings: Preferences };
function readAside(): Aside | null {
  try {
    const value = JSON.parse(localStorage.getItem(ASIDE) ?? "null");
    return value?.settings && Array.isArray(value.settings.dismissed) ? value : null;
  } catch {
    return null;
  }
}
/**
 * When another device's changes replaced this browser's copy, the older copy is kept aside. If it holds hides the current list lacks,
 * offer them back. Choosing either answer marks that kept copy as dealt with, so a piece restored on purpose afterwards is never
 * offered again.
 */
export default function RecoverHides({
  keys,
  recover,
}: {
  keys: string[];
  recover: (settings: Preferences) => void;
}) {
  const [aside, setAside] = useState<Aside | null>(null),
    [handled, setHandled] = useState<string | null>(null);
  useEffect(() => {
    setAside(readAside());
    try {
      setHandled(localStorage.getItem(HANDLED));
    } catch {}
  }, [keys]);
  if (!aside) return null;
  const stamp = aside.savedAt ?? "unknown";
  const count = hidesToCarry(aside.settings, { dismissed: keys }, { includeUndated: true }).length;
  if (!count || handled === stamp) return null;
  const finish = () => {
    try {
      localStorage.setItem(HANDLED, stamp);
    } catch {}
    setHandled(stamp);
  };
  return (
    <div className="notice recover-hides" role="status">
      <p>
        {count} {count === 1 ? "piece" : "pieces"} you hid on this browser{" "}
        {count === 1 ? "was" : "were"} left out when your account was updated
        {aside.savedAt ? ` (${formatDateTime(aside.savedAt)})` : ""}. Bring{" "}
        {count === 1 ? "it" : "them"} back to your hidden pieces?
      </p>
      <div className="inline">
        <button
          className="btn light"
          onClick={() => {
            recover(aside.settings);
            finish();
          }}
        >
          Bring {count === 1 ? "it" : "them"} back
        </button>
        <button className="textbutton" onClick={finish}>
          Not now
        </button>
      </div>
    </div>
  );
}
