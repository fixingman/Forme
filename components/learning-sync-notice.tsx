"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

/** Normal acknowledgements stay quiet. A delayed/offline queue remains visible without moving the feed. */
export default function LearningSyncNotice({ pending, error }: { pending: number; error: string }) {
  const [waiting, setWaiting] = useState(false);
  const queued = pending > 0;
  useEffect(() => {
    if (!queued) return;
    const timer = setTimeout(() => setWaiting(true), 2000);
    return () => {
      clearTimeout(timer);
      setWaiting(false);
    };
  }, [queued]);
  if (!error && !(queued && waiting)) return null;
  return (
    <div className="toast learning-sync-notice" role="status">
      {queued
        ? `Feedback kept on this device · ${pending} pending.`
        : "Learning sync is unavailable."}{" "}
      {error ? "Learning sync will retry when connected." : "Waiting for learning sync."}{" "}
      <Link href="/tools/learning">Learning details</Link>
    </div>
  );
}
