# Data trust: implemented checks and remaining gaps

21 October 2026. These changes validate and explain cached data. They do not authenticate garments or establish current marketplace availability.

## Current audit

848 cached records pass identity, price, SEK currency, marketplace/image URL and observation-time checks. No records are rejected in this batch. There are 782 unknown departments, 42 departments from explicit title wording and 24 from Men’s search scope; none has an individual provider department label. Category hints are unavailable for 217 records. All 848 titles have a usable reviewed English cache entry, with original wording retained. All 848 availability states remain unknown. No cached item currently exceeds the seven-day stale threshold.

These are data-quality counts, not recommendation accuracy rates or independent verification. Both SQLite and JSON snapshots were audited. Legacy database import times differ from source fetch times; source fetch times now control displayed freshness. The audit does not perform provider calls.

Run `npm run data:audit` to inspect the JSON fallback. It prints issues and exits nonzero if any rows are excluded. The in-app report under Settings → Collection tools → Data quality describes the snapshot actually loaded in that browser, including per-item stale counts and provenance gaps.

## Boundaries enforced

- Database reads and fallback JSON both pass the shared validation gate. Wrong identities, null/non-numeric/negative prices, unsupported currencies, mismatched item URLs, unsafe image URLs and invalid/future observation timestamps are excluded from browsing and counted with reasons. Duplicate identities retain the newest record. Excluded source records remain in their original source file for investigation; serving does not rewrite that file.
- Provider normalization rejects missing/blank/boolean prices rather than converting them to zero. Brand and condition remain marketplace labels. Seller/profile payloads are discarded; served items use a public-field allowlist.
- Availability is unknown unless an explicit provider flag is observed. Reported sold, reserved or closed records leave shopping/recommendation feeds, while saved copies and item details retain their status. Missing search results never prove sale or deletion. No active availability polling was added. Search-only responses may omit these flags entirely.
- Source fetch time controls freshness. A new partial batch does not freshen retained rows. A cached import cannot create a new source observation. Seven days is a product display threshold, not a promised refresh interval; older prices are labelled on cards and details.
- Older database imports can add historical observations but cannot roll back the latest payload. Different prices for the same instant are rejected atomically, including equivalent timestamps with timezone offsets. Currency changes and duplicate identities within an import are rejected. Price-change displays require matching stored observations, not incoming derived fields. Legacy import-only observations later than a source fetch are excluded from change calculations without deleting history.
- Cached translations must have a valid English target, known provider and usable text for the exact original title. Unusable entries fall back to the original and remain pending. Unknown condition labels are not guessed.
- Department and size rules remain conservative. Search scope, explicit title wording and provider labels have distinct provenance. Category hints are text inference, not verified marketplace taxonomy. Live rarity badges are not manufactured.
- Detail pages show observation time, availability uncertainty, translation context and price scope. Item prices exclude shipping and buyer fees; no totals are invented. No blanket disclaimer has been reintroduced across feeds.
- Backup/export retains availability provenance and observation times. Vinted outbound URLs must match the saved item ID.

Provider schema reference checked: [ScrapeBadger’s official Node SDK Vinted documentation](https://github.com/scrape-badger/scrapebadger-node/blob/main/docs/vinted.md). `status` is condition; reservation/closed flags are separate. No seller fields are needed for FORME’s current experience.

## What still requires real data work

Current availability, exact item category/department coverage and independent quality review cannot be recovered from absent fields. A subsequent bounded provider detail sample should measure coverage and usefulness before expanding spend. Keep item-detail checks focused on saves or high-ranked recommendations, and record the observation time and actual response provenance. Do not treat a successful page fetch, a missing limited search result or a title classifier as a verified available listing.

The existing explicit budget preview/cap remains unchanged. This implementation made no paid provider or translation calls, changed no personal preferences and did not replace the collection or erase price history.
