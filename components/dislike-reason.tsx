"use client";
import Dialog from "./ui/dialog";
import { REASON_LABELS, REASONS } from "@/lib/domain/learning.mjs";
import type { DislikeReason } from "@/lib/use-learning";
export default function DislikeReasonDialog({
  reason,
  change,
  close,
}: {
  reason?: string;
  change: (reason: DislikeReason) => void;
  close: () => void;
}) {
  return (
    <Dialog title="Why wasn’t this for you?" close={close} className="reason-dialog">
      <p>Optional. The piece is already hidden.</p>
      <div className="reason-options">
        {REASONS.map((value: string) => (
          <button
            key={value}
            className="btn light"
            aria-pressed={(reason ?? "unspecified") === value}
            onClick={() => change(value as DislikeReason)}
          >
            {REASON_LABELS[value as keyof typeof REASON_LABELS]}
          </button>
        ))}
      </div>
      <p className="small">
        Style feedback refines your taste. Material and colour are remembered as specific dislikes,
        not as a verdict on the brand. Price and listing issues are kept separate. You can change
        this later in Hidden pieces.
      </p>
      <button className="textbutton" onClick={close}>
        Not now
      </button>
    </Dialog>
  );
}
