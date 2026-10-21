# Refresh controls and feedback review

Implemented 21 October 2026. No additional provider collection was run during this work.

## Collection precision

Exact Vinted brand IDs are verified for the first Discover cohort: Auralee 2053426, Lemaire 295938 and Studio Nicholson 663899. The reference file keeps primary-source URLs and verification dates in `data/vinted-brands.json`. Supported refreshes send `brand_ids` and still validate returned brand names and public listing fields. Unmapped brands use a clearly reported text-search fallback with the same strict validation; the plan reports how many searches have exact filters.

Department preferences scope clothing searches to the Men's catalog when Men is selected and Women is excluded. Search scope remains distinct from an item-level gender label. This does not exhaust unisex listings filed elsewhere, and these scoped refreshes do not refresh homeware. Sizes are matched locally after fetching using separate clothing, waist and shoe groups. Reliable upstream size IDs have not been verified; none are guessed. Lower yield remains possible, so improvement over the first pilot is not yet measured.

References: [Auralee](https://www.vinted.se/brand/2053426-auralee), [Lemaire](https://www.vinted.se/brand/295938-lemaire), [Studio Nicholson](https://www.vinted.se/catalog/2623-chodaki-i-mule/brand/663899-studio-nicholson), [provider search filters and current five-credit search cost](https://scrapebadger.com/ecommerce-scraper-api/vinted).

## Explicit refresh flow

Settings → Refresh listings:

1. Choose Discover or Following, and one to three brand searches.
2. Preview for free. The plan lists the brands, filtering behavior, maximum results and maximum provider credits (5/10/15).
3. Only **Run refresh** starts collection. Previewing, opening Settings, changing the cap and polling local progress do not contact the provider.

Plans expire after ten minutes and are bound to the submitted preferences. Changing preferences invalidates the preview. Completed/failed plan IDs do not repeat requests. A shared file lock prevents concurrent refreshes and conflicts with CLI collection or translation. Successful queries checkpoint before subsequent calls; there are no automatic retries. Results retain old listing fetch timestamps, preserve the existing collection, and import into price-history storage.

Existing cached English translations are reused. No paid translation endpoint is called by these refreshes. New untranslated titles are retained for review and counted in the outcome; the refresh does not promise to translate unseen text automatically.

## Budget accounting

The private `.forme-data/refresh.sqlite` stores plans, results, reservations and the daily cap. The default cap is 15 credits and can only be changed explicitly in Settings (5–100). A run is limited to three searches regardless of the daily cap. The UTC-day budget includes ordinary collection ledger reservations, completion reservations, the previous Discover pilot, and new UI refreshes. The command-line collectors also honor this configured cap once the controls have initialized it.

At implementation, today's pilot already used 15 reported/reserved credits. The default cap consequently leaves zero available. This was verified in the running app without raising the cap or making paid requests.

The maximum batch cost is reserved transactionally before the first provider call. Failed/uncertain calls keep reservations; unexpected charges also consume the cap. This is conservative local accounting, not a provider account-balance query or an account-wide guarantee. Provider billing outside FORME is not tracked. No process is scheduled automatically. If the server is interrupted mid-run, the lock and reservation remain for manual review rather than silently retrying potentially billed requests; automatic crash recovery is not implemented.

## Feedback review

Settings → Recommendation feedback shows saved and hidden counts, current eligible Discover pieces, and per-brand collected/eligible/saved/hidden counts. Hidden pieces can be reviewed and restored individually, including keys that have left the current snapshot. Restoring immediately updates the browser preference and ranking pool.

Saves boost brands and categories; Not interested hides a listing and applies a bounded brand penalty. This is the existing transparent rule-based ranking system. Counts are preference signals, not inferred clicks, impressions, conversion rates or proof that relevance has improved. Saved-item snapshots and known active listings provide context; unmatched IDs remain visible as outside the current collection. Browser persistence, JSON backup, and explicit local-profile checkpoints remain available.

## Local pilot boundary and verification

The refresh API requires loopback Host / matching Origin, JSON input, a bounded request body, and validated FORME settings. It is disabled on Vercel. Keys remain server-side and status exposes only availability. No authentication, cloud job runner, distributed budget, or automatic brand/size-reference lookup was introduced.

Verified: build; complete browser suite (32 tests); logic tests covering free previews, prior spend, configured CLI caps, exact filters, missing/changed billing, stale preferences, lock conflicts, duplicate submissions and reversible feedback. The real free preview kept charges unchanged, with Run disabled at the daily cap; desktop/mobile review found no browser errors or horizontal overflow.
