# Personal recommendation pilot

Implemented on 21 October 2026, without additional paid collection.

1. **Categories and size groups.** Conservative title-based hints separate clothing, trousers, footwear, accessories, homeware, beauty and toys. Unknown remains unknown. These hints are not verified marketplace taxonomy. Clothing, waist and shoe selections are independent; legacy numeric labels are retained as unassigned until reviewed. The user's explicitly confirmed top sizes 48/50 belong to clothing. No international size conversions are assumed. Clothing filters do not remove homeware or accessories; one-size inclusion still applies to wearable accessories.
2. **Persistent local foundation.** A private SQLite database holds the existing 824 listings, price observations, and a revision-protected settings copy. Imports are idempotent and retain first-seen timestamps. Settings → Local database lets the user check a copy, save current settings or preview and restore it. Saving is explicit, not automatic; browser persistence and JSON backups remain available. Collection uses the last saved database profile unless `--settings PATH` is supplied, and checkpoints update the database. Saves and dismissals are recorded as changes at settings checkpoints, not as a complete clickstream.
3. **First Discover rules.** Following shows followed brands. Live Discover excludes followed/excluded brands and dismissed listings, applies sizes, and requires a relationship in a small editorial brand graph. Saved-item categories provide a modest ranking signal; brands are interleaved. Reasons are visible and Not interested has Undo. The graph is an editable seed, not a learned model. Demo remains an explicitly illustrative exploration feed. Unclassified live styles are not invented to populate filters.
4. **Candidate collection plan.** `npm run data:discovery-plan` prints up to three related-brand queries and the existing collector's maximum-credit estimate. It sends no provider requests. The current snapshot mostly covers followed brands, so Discover may have no suitable listings. Suggested brands are clearly distinguished from available products. No additional collection has been authorized or executed as part of this phase.

## Local commands

- `npm run data:import`: import the current normalized snapshot, without provider requests.
- `npm run data:discovery-plan`: inspect potential expansion without requests.
- `npm run data:refresh -- --plan`: inspect the normal followed-brand/search plan, using the saved local profile when present.
- `npm run data:refresh`: unchanged paid collection limits; updates database after successful checkpoints.

`.forme-data/` stays gitignored. Database files have mode 0600. APIs accept only loopback Host requests and matching origins, are disabled on Vercel, and have no account authentication. This is local single-user storage, not a deployment database. Keep the app bound to 127.0.0.1.

Before a hosted release: authenticated profiles, a hosted transactional database, schema migrations, background jobs and account-wide spending controls. Before calling recommendations useful: collect a small approved candidate batch, review category errors, and measure saves/dismissals. No ML or paid LLM is required for this first rule-based stage. Home remains a summary; real new-arrival and price-change presentation can use the observation history in a subsequent phase.

## Clothing departments

Men / Women / Unisex preferences are now available in Settings and included in JSON and local database backups. Can's confirmed preference is Men + Unisex, with unknown departments hidden. All feeds, including Discover, saved searches, digest previews and saved-item feeds, use the same rule. Direct links to saved details remain readable.

The original 824-item snapshot contains no department fields. Only explicit title wording is used as a fallback (16 men, 4 unisex, 22 women, 782 unknown at implementation). Brands, sizes, silhouettes and images are never used to assign gender. Known homeware is exempt. Unknown clothing remains hidden unless the user enables the clearly labelled option. Labels may be inaccurate; this is a department filter, not a guarantee about the seller's data.

Future normalization preserves recognized gender/department labels when supplied by the provider, without reading seller gender. Conflicting provider labels remain unknown. No provider-specific category IDs or request filters have been guessed, and no paid requests were made. Proper department coverage is still needed before collecting a larger discovery batch.

## Authorized pilot completed

The related-brand collection was subsequently authorized and completed on 21 October 2026. See [the pilot results and spending](discover-pilot-2026-10-21.md): 60 returned rows, 24 accepted additions, 8 recommendations under the confirmed preferences, exactly 15 reported provider credits, and no paid translation request. Home now uses real first-seen and price-observation history; no price changes have yet been observed.
