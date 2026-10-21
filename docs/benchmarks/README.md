# Vinted provider smoke test — 19 October 2026

This was a small live trial using the supplied accounts. No recurring collection, subscription changes or automatic retry jobs were created. The application still shows its explicit demo catalog.

## Results

| Operation | Result | Observed duration | Reported usage |
| --- | --- | --- | --- |
| ScrapeBadger search: Our Legacy, Sweden, 10 results | HTTP 200; 10 returned | 982 ms | 5 credits |
| ScrapeBadger search: Acne Studios, Sweden, 10 results | HTTP 200; 10 returned | 524 ms | 5 credits |
| ScrapeBadger search: leather jacket, Sweden, 10 results | HTTP 200; 10 returned | 558 ms | 5 credits |
| Bright Data dataset list and schema | HTTP 200 | Not compared | Billing not reported |
| Bright Data detail lookup, three URLs | HTTP 400 | 1,013 ms | Billing unknown |
| Bright Data single-item diagnostic | HTTP 200; one listing | 5,817 ms | Billing unknown |

ScrapeBadger explicitly reported 15 credits across the three search requests. No dollar conversion or account-balance reconciliation was performed. Bright Data did not return usage in the header recorded by this test; do not claim zero cost for its failed request or metadata calls. Search results and detail extraction are different workloads, so the durations do not establish a provider speed ranking.

## Observed data quality

Thirty search result rows were returned. Two sample rows per query were retained for inspection; this is not a full completeness audit or thirty verified unique listings. These samples included source IDs, source links, titles, structured prices in SEK, brands and condition labels. Some sizes were null. The `status` field is item condition, not sale availability. The samples exposed one photo per listing and no explicit source publication timestamp in their top-level field names.

For item 10440300038, both providers agreed on the title “Our legacy x Stüssy bandana”, brand Our Legacy and price 500 SEK. Bright Data returned six image URLs and a category path in its response. Its numeric availability and protection-price fields require mapping before use. In particular, a raw protection-price value must not be assumed to use the same units or meaning as the item price.

The initial Bright Data batch validation error was not retained; its cause remains unproven. The subsequent one-item request succeeded. A single success does not resolve batch support or establish reliability.

## Recommendation

Proceed provisionally with ScrapeBadger as the discovery candidate and retain Bright Data as an optional enrichment candidate. Fetch detailed data only for selected listings, rather than for every result. Keep the two behind separate adapters so the app does not depend on either response schema.

Before enabling real feeds: preserve listing IDs across refreshes, validate price units, map condition separately from availability, keep seller personal fields out of the app model, and distinguish first-seen time from original publication time. Add source failure and stale-data states; never silently replace real data with demo listings.

Before selecting a production provider: run a separately budgeted multi-day comparison, verify freshness and removals, measure duplicate/relevance rates, and reconcile actual account deductions. No automated multi-day job has been scheduled.

## Files and repeat-run protection

- `scrapebadger-probe.json`: request timing, reported credits and six sample listing summaries.
- `brightdata-metadata-probe.json`: Vinted collector ID discovery.
- `brightdata-details.json`: batch outcome and sanitized single-item result.
- `../../scripts/provider-probe.mjs`: fixed three-query search probe or metadata-only check.
- `../../scripts/brightdata-detail-probe.mjs`: fixed three-URL detail probe; submission intent is saved before sending.

The scripts refuse to overwrite existing run reports to reduce accidental repeated billing. They are investigation utilities, not production collectors. The unsuccessful batch script should not be rerun until the input/batch behavior is understood. API credentials live only in `.env.local` (Git-ignored, owner-readable), not in source or reports. API requests do not use keys in URL query parameters.
