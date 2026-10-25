"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/** How long the Undo toast stays. Short on purpose: it is an offer, and hidden pieces stay restorable from Settings. */
export const UNDO_TOAST_MS = 4000;

/**
 * A self-dismissing toast with Undo. A hairline bar shows how long is left.
 * The countdown pauses while the pointer is over it or a control inside has keyboard focus, and then
 * resumes from where it stopped (it never restarts). Mount it with a `key` so a new message starts a new countdown.
 */
export default function UndoToast({
  message,
  undoLabel,
  onUndo,
  onDismiss,
  onReason,
  duration = UNDO_TOAST_MS,
}: {
  message: string;
  undoLabel: string;
  onUndo: () => void;
  onDismiss: () => void;
  onReason?: () => void;
  duration?: number;
}) {
  const [hovered, setHovered] = useState(false),
    [focused, setFocused] = useState(false);
  const paused = hovered || focused,
    remaining = useRef(duration),
    dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    if (paused) return;
    const started = performance.now();
    const end = setTimeout(() => dismiss.current(), remaining.current);
    return () => {
      clearTimeout(end);
      remaining.current = Math.max(0, remaining.current - (performance.now() - started));
    };
  }, [paused]);
  const mouse = (on: boolean) => (event: React.PointerEvent) => {
    if (event.pointerType === "mouse" || event.pointerType === "pen") setHovered(on);
  };
  return (
    <div
      className={`toast toast-action${paused ? " is-paused" : ""}`}
      role="status"
      onPointerEnter={mouse(true)}
      onPointerLeave={mouse(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <span className="toast-message">{message}</span>
      <button className="toast-undo" onClick={onUndo} aria-label={undoLabel}>
        Undo
      </button>
      {onReason && (
        <button className="toast-undo toast-reason" onClick={onReason}>
          Add reason
        </button>
      )}
      <button className="toast-close" aria-label="Dismiss feedback notice" onClick={onDismiss}>
        <X aria-hidden="true" />
      </button>
      <span
        className="toast-bar"
        aria-hidden="true"
        style={{ animationDuration: `${duration}ms` }}
      />
    </div>
  );
}
