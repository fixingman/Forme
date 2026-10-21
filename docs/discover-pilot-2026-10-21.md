# Discover pilot — 21 October 2026

The user authorized one search each for Auralee, Lemaire and Studio Nicholson: up to 60 returned rows and 15 provider credits total. All three requests completed, at 5 reported credits each. No paid translation request was made.

| Brand query | Returned | Passed listing validation and exact-brand matching |
|---|---:|---:|
| Auralee | 20 | 0 |
| Lemaire | 20 | 8 |
| Studio Nicholson | 20 | 16 |
| Total | 60 | 24 |

The existing 824 listings were preserved, producing 848 normalized listings. All 24 accepted additions have cached English titles and retain original text. Titles were translated/reviewed in this session; no Google translation API was called. Existing condition-label translations applied.

## Relevance review

With the confirmed Men + Unisex and size preferences, 8 listings qualify for Discover: 2 Lemaire and 6 Studio Nicholson. Four accepted rows are explicit Zara collaborations and respect the user's Zara exclusion even though their primary marketplace brand is Studio Nicholson. After these exclusions, 12 rows match size rules; four lack sufficiently clear category information for recommendation eligibility. They remain stored rather than being assigned invented product types. No size-system conversions or photo-based gender assignments were made.

The eight rendered recommendations and their photos were reviewed on desktop. Titles describe the visible clothing categories. This is a relevance review, not authentication, seller verification, a fit guarantee, or a fresh availability check. Mobile rendering fits the viewport without browser errors.

The provider supports `catalog_ids`, and Vinted's Men category is ID 5. Requests used `catalog_ids=5`, `market=se`, `per_page=20`, and `order=newest_first`. The returned search fields did not supply department metadata. Accordingly, the accepted items retain `genderSource=search-filter` and `collectionCatalogIds=5`; item details distinguish this search scope from a seller/item label. Explicit supplied or title labels take precedence during normalization, including women and unisex. This batch samples the Men's catalog and does not exhaust unisex listings filed elsewhere.

References: [provider search parameters](https://scrapebadger.com/ecommerce-scraper-api/vinted), [Vinted Men catalog](https://www.vinted.se/catalog/5-men).

## App behavior

- Home shows relevant pieces first observed after the seeded baseline within the last seven days, labelled **New to FORME**. This does not claim the seller published them today.
- Price changes compare observations of the same source key, showing the prior price and change. Cached rows merged into a later collection retain their own fetch timestamps and do not create new observations merely because the combined snapshot changed. No real price changes are currently recorded; Home explicitly says so. Temporary database tests verify this behavior without inserting fabricated changes into the live database.
- Saved-item categories and brands boost recommendation ranking. Not interested hides the item and applies a bounded penalty to the same brand. Brand interleaving maintains variety. Feedback remains a transparent local rule system, with browser persistence and explicit database settings checkpoints.
- Ordinary followed-brand refreshes preserve the separate Discover cohort. Excluded collaborations and all other shared preferences apply consistently to the feeds.

## Spending and reruns

`scripts/collect-discover.mjs --collect` uses the private `.forme-data/discovery-pilot-v1.json` ledger, the existing collection lock, per-request reservations, and per-brand checkpoints. The fixed pilot has at most three calls. Completed searches are not repeated; uncertain or failed calls stop without automatic retries. A subsequent run can republish completed checkpoints without provider calls. The ordinary collector's existing daily cap was not raised. No detail lookups or automatic polling were added.

Validation: production build; 34 Node tests; 29 browser tests; real desktop/mobile smoke checks (8 recommendation cards, no console errors, no horizontal overflow).
