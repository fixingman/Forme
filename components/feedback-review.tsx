"use client";
import { feedbackReview } from "@/lib/domain/feedback-review.mjs";
import { hiddenEntries } from "@/lib/domain/hidden-pieces.mjs";
import HiddenPieceList, { type HiddenEntry } from "./hidden-piece-list";
import type { Preferences } from "@/lib/preferences";
import type { Listing } from "@/lib/catalog";
export default function FeedbackReview({
  source,
  settings,
  restore,
  editReason,
}: {
  source: Listing[];
  settings: Preferences;
  restore: (key: string) => void;
  editReason?: (key: string) => void;
}) {
  const review = feedbackReview(source, settings) as {
    savedCount: number;
    hiddenCount: number;
    eligibleCount: number;
    brands: { brand: string; collected: number; eligible: number; saved: number; hidden: number }[];
    hidden: { key: string; item: Listing | null }[];
  };
  return (
    <section className="panel" aria-labelledby="feedback-title">
      <h3 id="feedback-title">Recommendation feedback</h3>
      <p>
        {review.savedCount} saved · {review.hiddenCount} not interested · {review.eligibleCount}{" "}
        eligible Discover pieces
      </p>
      <p className="small">
        Your styles and saved pieces shape Discover through brands and text hints about category,
        material, color and fit. Hidden-piece feedback is retained when a listing leaves the
        collection; restoring it removes that signal. These are explainable preferences, not
        measured recommendation accuracy.
      </p>
      <div className="feedback-table-wrap">
        <table className="feedback-table">
          <caption>Discovery-brand coverage and current signals</caption>
          <thead>
            <tr>
              <th>Brand</th>
              <th>Collected</th>
              <th>Eligible</th>
              <th>Saved</th>
              <th>Hidden</th>
            </tr>
          </thead>
          <tbody>
            {review.brands.map((row) => (
              <tr key={row.brand}>
                <th scope="row">{row.brand}</th>
                <td>{row.collected}</td>
                <td>{row.eligible}</td>
                <td>{row.saved}</td>
                <td>{row.hidden}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!review.brands.length && (
        <p>Add a style, follow a brand or save a piece to start shaping Discover.</p>
      )}
      {review.hidden.length > 0 && (
        <details>
          <summary>Review hidden pieces ({review.hiddenCount})</summary>
          <HiddenPieceList
            entries={
              hiddenEntries({
                keys: settings.dismissed,
                source,
                remembered: settings.tasteFeedback,
              }) as HiddenEntry[]
            }
            restore={restore}
            editReason={editReason}
          />
        </details>
      )}
    </section>
  );
}
