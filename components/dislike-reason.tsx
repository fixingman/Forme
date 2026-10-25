"use client";
import { useId } from "react";
import Dialog from "./ui/dialog";
import { REASON_GROUPS, REASON_LABELS } from "@/lib/domain/dislike-reasons.mjs";
import type { DislikeReason } from "@/lib/use-learning";

/**
 * The optional "why" after Not for me. The reasons are grouped into three short questions (the piece, the listing, your needs)
 * and shown as chips, the app's selection control, so eight choices read at a glance. Choosing one saves it and closes; "No
 * reason" is not a choice but what a hide already is, so the dialog only offers to return to it when a reason is set.
 */
export default function DislikeReasonDialog({
  reason,
  change,
  close,
}: {
  reason?: string;
  change: (reason: DislikeReason) => void;
  close: () => void;
}) {
  const id = useId(),
    chosen = reason && reason !== "unspecified" ? reason : undefined;
  return (
    <Dialog title="Why wasn’t this for you?" close={close} className="reason-dialog">
      <p>Optional. The piece is already hidden.</p>
      <div className="reason-groups">
        {REASON_GROUPS.map((group: { id: string; label: string; reasons: string[] }) => (
          <div
            className="reason-group"
            role="group"
            aria-labelledby={`${id}-${group.id}`}
            key={group.id}
          >
            <p className="eyebrow reason-group-title" id={`${id}-${group.id}`}>
              {group.label}
            </p>
            <div className="reason-options">
              {group.reasons.map((value) => (
                <button
                  key={value}
                  className={`chip ${chosen === value ? "active" : ""}`}
                  aria-pressed={chosen === value}
                  onClick={() => change(value as DislikeReason)}
                >
                  {REASON_LABELS[value as keyof typeof REASON_LABELS]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="small">Only style, material and colour tune your picks.</p>
      <div className="reason-footer">
        <button className="textbutton" onClick={close}>
          Not now
        </button>
        {chosen && (
          <button className="textbutton" onClick={() => change("unspecified")}>
            Remove reason
          </button>
        )}
      </div>
    </Dialog>
  );
}
