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

## 25 October: wider category rules and brand-ID lookup

Measured on the 972-listing local snapshot with `npm run data:coverage`.

| Field | Before | After | How |
|---|---|---|---|
| Category classified | 71.6% (696) | 84% (816) | More title words, accent-folded: bomber, longsleeve, tshirt, blouse, raincoat, leggings, joggers, Tabi/GATs, bracelet, tote; homeware and beauty goods (dripper, ornament, serving dish, deodorant, parfum); common Scandinavian, German, French, Polish and Finnish garment words. |
| Pieces the size filter can judge | 574 | 637 | A size is only checked once a piece is known to be clothing, bottoms or shoes. All 63 newly recognised pieces carry a size label. |
| Style (inferred) | 25.4% | 28.6% | Follows from the category: style is only inferred for fashion categories. |

Every changed listing was reviewed by hand: all changes were unknown → a category, and none moved between known categories. Still unknown (156) are mostly titles that only name the brand ("Eytys", "Auralee"), fabric-only titles and a few objects (a ukulele); these stay unknown on purpose. Words that are ordinary language in another market ("bra" = good in Swedish, "kappa" = a brand, singular "short") are deliberately not used.

**Brand IDs.** The provider's search results carry no brand ID, so exact IDs come from its brand lookup (`GET /v1/vinted/brands`, 3 credits per brand, failed calls not charged). `npm run brands:resolve` previews for free and runs only with `--confirm <credits>` equal to the quoted maximum. It goes through the same queue as collection, so the daily cap, reservations, the single-worker lock and the no-automatic-retry rule apply. Only one brand whose name is the same ignoring case, accents and punctuation is accepted ("Nike ACG" is never "Nike"; two equally named brands are left ambiguous). Results are saved on this computer in `.forme-data/brand-ids.json` as they arrive; hand-verified entries in `data/vinted-brands.json` always win. Brands whose listings are all homeware, beauty or toys are left out unless named with `--brand`. Not run against the real provider yet.

**Department** is unchanged and still never inferred. The provider's search results have no gender field; a department comes only from explicit title wording or from searching inside the Men's catalog (catalog 5), which the refresh does when your department preference is men only. Raising it means re-collecting with that scope, which costs credits (5 per brand search).

## Policies kept on purpose

- **Department is never inferred** from brand, size, silhouette or photo (`lib/domain/gender.mjs`). The way to raise coverage is collection scope (Men's catalog searches are tagged `search-filter`) and provider fields, not guessing. Low department coverage is a collection decision, not a classifier gap.
- **Style is a taste label**, so inference is allowed but visible: the item page says what it was inferred from.
- **Rarity is not claimed.** Title mentions are not market scarcity. A real rarity score needs comparable-sale or listing-count data per piece.

## Availability checks

`Settings → Collection tools → Refresh feed → Saved items' availability` previews, for free, which saved Vinted listings are due (not sold/removed, not checked in the last 24 hours), up to three per run. Each check is one item-detail call costing up to 10 credits (searches cost 5), so the default 15-credit daily cap allows one; raise it explicitly for more. It runs through the same queue, heartbeat, billing guard and no-retry rules as searches.

- Sold is reported only for the provider's documented combination (`is_closed` and not `can_buy` and not `is_hidden` and not `is_reserved`). Hidden listings are `unavailable`, not sold.
- A 404 (deleted or withdrawn) is recorded as `unavailable`; failed calls are not charged.
- Confirmed sold/unavailable survives later search refreshes.
- The same item-detail response carries the listing's current photos, so a check also replaces a retired photo link when the address differs (sellers re-uploading photos makes the stored address return 404). Only a plain https address on Vinted's own image domain is accepted, nothing else about the listing changes, and the result message counts refreshed photo links. This is written to the provider docs' response shape (`photo.url` / `photos[].url`) and has not been confirmed against a real response; check the "photo links refreshed" count after the first real run. It applies only to saved items, since those are what availability checks cover. On the item page a dead photo shows an "Open on Vinted" link; cards show the plain placeholder. Absence from a search is still never treated as proof of sale.
- Not run against the real provider as part of this work. Credit cost per call (10) is from the provider docs and should be confirmed from the `X-Credits-Used` header on the first real call.

## Remaining gaps

- Category is unknown for about 16% of listings and sizes are missing for about 23%; both come from short, free-text marketplace titles. A missing size is never guessed.
- Three brands have hand-verified exact provider brand IDs; the rest await a paid lookup (see above).
- Style coverage is capped by the brand reference and keyword rules; expanding the brand list is cheap, but each addition is an editorial judgement.
- Nothing measures whether the inferred styles match what users consider a match. Add saves-by-style once there is real usage.
