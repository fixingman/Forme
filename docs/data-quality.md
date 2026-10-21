# Data quality

Written 21 October 2026. Measured on the 848-listing local snapshot before and after; run `npm run data:coverage` for current numbers.

## What changed

| Field | Before | After | How |
|---|---|---|---|
| Style | 0% | 22% | Evidence-carrying inference: title keywords first (archive/vintage, denim, techwear, workwear, old season codes), then a small editorial brand reference (`data/brand-styles.json`). Always labelled inferred, never replaces a source value. |
| Collectible signals | none | 41 listings | Separate `collectibleSignals` evidence list ("vintage", "runway", "season 2004"). The numeric `rarity` field is untouched, so these do not feed the digest or "Rare find" until validated. |
| Department | 3% (search filter) | 8% | Unchanged policy: explicit wording only. |
| Availability | unknown for everything | checkable for saved items | Capped, previewed, queued provider check (below). |

Spot-check found one false positive ("Jean-Michel Basquiat" read as denim); the rule was tightened and a regression test added.

## Policies kept on purpose

- **Department is never inferred** from brand, size, silhouette or photo (`lib/gender.mjs`). The way to raise coverage is collection scope (Men's catalog searches are tagged `search-filter`) and provider fields, not guessing. Low department coverage is a collection decision, not a classifier gap.
- **Style is a taste label**, so inference is allowed but visible: the item page says what it was inferred from.
- **Rarity is not claimed.** Title mentions are not market scarcity. A real rarity score needs comparable-sale or listing-count data per piece.

## Availability checks

`Settings → Collection tools → Refresh feed → Saved items' availability` previews, for free, which saved Vinted listings are due (not sold/removed, not checked in the last 24 hours), up to three per run. Each check is one item-detail call costing up to 10 credits (searches cost 5), so the default 15-credit daily cap allows one; raise it explicitly for more. It runs through the same queue, heartbeat, billing guard and no-retry rules as searches.

- Sold is reported only for the provider's documented combination (`is_closed` and not `can_buy` and not `is_hidden` and not `is_reserved`). Hidden listings are `unavailable`, not sold.
- A 404 (deleted or withdrawn) is recorded as `unavailable`; failed calls are not charged.
- Confirmed sold/unavailable survives later search refreshes. Absence from a search is still never treated as proof of sale.
- Not run against the real provider as part of this work. Credit cost per call (10) is from the provider docs and should be confirmed from the `X-Credits-Used` header on the first real call.

## Remaining gaps

- Category is unknown for about a quarter of listings and sizes are missing or unmatched for a similar share; both come from short, free-text marketplace titles.
- Only three brands have verified exact provider brand IDs.
- Style coverage is capped by the brand reference and keyword rules; expanding the brand list is cheap, but each addition is an editorial judgement.
- Nothing measures whether the inferred styles match what users consider a match. Add saves-by-style once there is real usage.
