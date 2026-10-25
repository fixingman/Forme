# FORME interface standard

Approved consolidation implemented 24 October 2026. Preserve the warm neutral surfaces, dark green navigation and compact shopping cards. This is the shared implementation reference, not a redesign proposal.

## Tokens and controls

`app/globals.css` owns the existing semantic colors (`--ink`, `--muted`, `--paper`, `--surface`, `--line`, `--soft`, `--accent`, `--danger`), a 4px-based spacing scale (`--space-1` through `--space-8`, selected steps), body/small text sizes, control radius and 44px interaction target. Reuse these rather than adding close variants per feature.

| Pattern | Use |
|---|---|
| `.btn` | Primary commitment; cost-labelled when it starts paid work |
| `.btn.light` | Secondary or cancel action |
| `.textbutton`, `.textlink` | Quiet action or navigation |
| `.chip` | Filter, view selection or compact top-bar control (Hidden pieces uses it for its reason filter, with counts); selected state uses `aria-pressed` or `aria-current` |
| `.icon-button` | Named compact action with an accessible label and 44px target |
| `Dialog` | Native modal, unique title ID, Escape/backdrop close, body scroll lock and focus return |

Keep one primary action per local task. Collection quotes and spending confirmation remain separate. Use the existing Lucide icons; decorative icons should be hidden from assistive technology. Preserve visible keyboard focus. Do not shrink touch targets to achieve compactness.

## Listings and dates

`ListingMetadata` and `ListingPrice` own card brand/title, condition-before-size and price history presentation. Both normal feeds and ranking previews use them; preview voting remains a separate action area. Item details reuse the same price/date rules, while keeping expanded provenance and availability context.

`lib/domain/presentation.mjs` formats recorded prices with Swedish currency presentation, up to two meaningful decimal places and one currency label. Whole amounts omit decimals. Never round a preview differently from the shopping feed. UI dates use English abbreviated month names and hour/minute precision without seconds. Unknown dates remain unknown; formatting never updates an observation time.

Missing live condition uses “Condition not provided”. Missing or “Not provided” sizes omit size filler. Demo condition defaults remain explicitly illustrative. Never manufacture availability, department, rarity or style evidence.

## Item page

Order, top to bottom: source (and a "New to FORME" marker, as on cards), brand, title, one translation line, **Size / Condition (/ Category)** facts, price with its note and any price change, **one status line**, **one action row**, the brand preference control, then **About this listing**. Reuse `ListingPrice` for the price, `listingCondition` / `listingSize` for facts and `itemStatus` (`lib/domain/item-status.mjs`) for the status line; do not restate these in the page.

- **Actions:** Save is the single primary button (heart icon, filled and `aria-pressed` when saved, "Remove from saved" as its title). View on Vinted is secondary (`.btn.light`, external-link icon, opens in a new tab and says so to screen readers). Not for me is a quiet text button; a hidden piece shows "Hidden from your feeds" beside Restore. Sample listings have no View on Vinted.
- **Status line** (words first, colour second; the dot only reinforces the label):

| State | Label | Tone | Detail |
|---|---|---|---|
| Provider-checked available | Available when last checked | ok | Checked *date* |
| Not checked, seen recently (the everyday default) | (not shown) | | |
| Not checked, not seen for over 7 days | Availability not confirmed | warn | Last seen *date* · over 7 days ago |
| Reserved | Reserved | warn | Reserved on Vinted · checked *date* |
| Sold | Sold | closed | Marked sold on Vinted · checked *date* |
| Removed or hidden | Removed or hidden | closed | No longer shown on Vinted · checked *date* |
| Sample listing | (none) | | |

  The line appears only when it tells the reader something. Only a provider check can produce Available, Reserved, Sold or Removed; without one, the default "not confirmed, last seen *date*" is true of nearly every listing, so it is left out, and only a listing not seen for over a week gets the warning. `itemStatus` still reports every state; the page decides what is worth showing. Sold and removed pieces stay saveable and openable so they can be confirmed.
- **Translation:** said once. Pending: "English title not available yet. Showing the original." Translated: a quiet "Translated · show original" disclosure (original title, original condition, a wording caveat). Already English: nothing. A condition that could not be translated is shown as the seller wrote it, on cards too.
- **Price:** shown alone (with any price change, as on cards). There is no per-price note about delivery and fees; boilerplate availability and price disclaimers are not repeated as paragraphs.
- **About this listing:** one line per fact with its evidence beside it (Department, Category, Style, and Mentions when present). Unknown stays "Not specified" / "Not classified". One footnote says marketplace labels are not authenticated and that category and style are FORME's inference.

## Feed continuity

Grid feeds reveal 24 pieces at a time when the reader nears the bottom. They reveal the existing snapshot and make no collection calls. A manual fallback is available only when IntersectionObserver is unavailable.

Keep revealed depth when pieces are hidden, saved, reordered or updated in the background. Returning from an item page restores the tab's remembered window and reading position. Route, style-query and global filter combinations have separate in-memory windows; a full reload starts fresh. No preference or listing payload is persisted by this UI cache.

## Feedback and shared states

- Piece feedback says **Not for me**; brand feedback explicitly names the brand and explains its wider scope.
- Undo notifications last four seconds, show a progress line without numeric seconds, pause on hover/focus and keep Undo/dismiss available. Reduced motion hides animation.
- Use the shared `Header`, `Empty` and `ListingSkeleton` patterns. Empty states explain the next useful action and never weaken filters automatically.
- Recoverable read failures retain usable content and provide retry. Background read failures do not replace the last good collection.
- Keep experimental/model setup details inside Collection tools. Normal shopping should not expose runtime or model infrastructure controls.

## Maintenance

Format UI changes with `npm run format:ui`; check with `npm run check:format:ui`. Prefer named page components and explicit action callbacks. `forme.tsx` owns persistent state and coordinates actions; page views should not create competing preference stores.

Verify affected flows with fixtures on desktop and narrow phones, including keyboard/focus, empty/error/loading states and reduced motion where relevant. Changes to scrolling must cover feedback deep in an expanded feed, background updates and item-page Back navigation, not only straight scrolling.
