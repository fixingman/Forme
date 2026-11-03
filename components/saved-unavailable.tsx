"use client";
import { useState } from "react";
import type { Listing } from "@/lib/catalog";
import Dialog from "./ui/dialog";
import Grid from "./listings/listing-grid";

/**
 * Saved pieces a provider check has confirmed are gone. They are kept apart from the pieces you can still buy and are never removed
 * on their own: removing a saved piece also drops it as an example for your recommendations, and a sold piece can still say what you
 * like, so the choice is yours.
 */
export default function SavedUnavailable({
  items,
  remove,
}: {
  items: Listing[];
  remove: (ids: number[]) => void;
}) {
  const [confirming, setConfirming] = useState(false),
    count = items.length,
    pieces = count === 1 ? "piece" : "pieces";
  if (!count) return null;
  return (
    <section className="saved-unavailable" aria-labelledby="saved-unavailable-title">
      <div className="saved-unavailable-head">
        <h2 id="saved-unavailable-title">No longer available ({count})</h2>
        <button className="btn light" onClick={() => setConfirming(true)}>
          Remove from Saved ({count})
        </button>
      </div>
      <p className="small section-note">
        Marked sold, or removed from Vinted, the last time they were checked. They stay saved until
        you remove them.
      </p>
      <Grid values={items} id="unavailable" />
      {confirming && (
        <Dialog title={`Remove ${count} ${pieces} from Saved?`} close={() => setConfirming(false)}>
          <p>
            {count === 1 ? "This piece is" : "These pieces are"} no longer on Vinted. Removing{" "}
            {count === 1 ? "it" : "them"} unsaves {count === 1 ? "it" : "them"}, so{" "}
            {count === 1 ? "it" : "they"} stop{count === 1 ? "s" : ""} counting as{" "}
            {count === 1 ? "a piece" : "pieces"} you saved when FORME learns what you like.
          </p>
          <div className="inline">
            <button
              className="btn"
              onClick={() => {
                remove(items.map((item) => item.id));
                setConfirming(false);
              }}
            >
              Remove {count} {pieces}
            </button>
            <button className="btn light" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
