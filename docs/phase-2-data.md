# Phase 2: real listings and Vinted feasibility

> Historical document (20–22 October 2026). Its status, setup assumptions and proposals may be superseded. Use [current project state](project-state.md), [decisions](decisions.md) and [accounts setup](accounts-setup.md) for current guidance. Past paid-run commands are not new spending authorization.

Research date: 18 October 2026. Status: source selection; no live Vinted connection established.

## Product scope

Start with a Sweden/SEK discovery pilot, pending confirmation. FORME helps users discover and save listings, then sends them to the source marketplace to purchase. No selling, checkout or messaging integration in this phase.

First milestone: 50–100 real, permitted listings covering a small selection of followed brands and saved searches. This is a proposed pilot size, not a claim about source coverage or API limits. Prove relevance, image accuracy, duplicate handling, availability and freshness before increasing ingestion volume or adding notifications.

## Verified access findings

Vinted Pro Integrations is restricted to allowlisted Pro businesses. Its documented features cover inventory, orders and item-change webhooks. The published documentation does not establish marketplace-wide discovery access. A Pro API credential alone therefore does not establish that FORME can search other sellers' listings.

Source: https://pro-docs.svc.vinted.com/

Vinted's Swedish terms, effective 8 October 2026, restrict external automated tools unless permitted, content reuse without prior written consent, and data extraction/scraping. An unofficial endpoint or third-party subscription does not by itself establish permission for FORME's intended use.

Source: https://www.vinted.se/terms-and-conditions (section 6)

These are source-selection constraints, not a determination of the legality of every potential implementation.

## Routes to evaluate

| Route | What it could provide | What must be established |
| --- | --- | --- |
| Direct Vinted arrangement | A licensed discovery/search feed | Whether access exists, Swedish coverage, image/display rights, retention and refresh rules |
| Licensed third-party data provider | Normalized listings through an API | Provenance and rights for FORME's display/reuse, current Swedish inventory, update/removal handling, costs and limits |
| Participating sellers | Small real inventory pilot from sellers' original data and photos | Permission covering supplied data/images; inventory scope, reliable updates and source links |
| Existing Vinted Pro access | Inventory associated with approved business accounts | Exact scope and permissions; do not assume marketplace-wide search |

No provider is selected or represented as licensed yet. A seller-supplied pilot can validate the product but cannot validate marketplace-wide coverage. Do not silently substitute it for the intended Vinted discovery experience.

## Data model required before a live feed

- Namespaced identity: source plus source listing ID. Preserve existing demo saves separately; do not let real IDs collide with demo integers.
- Original listing URL and source market. Market availability must be established by the source, not inferred solely from the website language or currency.
- Title, source brand ID/name, category, size and source condition. Missing values remain unknown rather than receiving the prototype's fixed “Very good” label.
- Price as integer minor units plus currency. Buyer protection and shipping are separate nullable amounts, not invented totals. Never relabel a foreign price as SEK without an explicit conversion policy.
- Permitted image URLs and image-use conditions. Remove inherited illustrative photos from live cards.
- Source publication timestamp, first-seen timestamp, last successful verification timestamp, and source update timestamp where available.
- Availability: available, reserved, sold, removed or unknown; only use states the source can establish. A failed refresh is not evidence that an item sold.
- Derived style labels with method/version and confidence. Keep these separate from marketplace facts.
- No fictional rarity score on real listings. Leave rarity unavailable until evidence supports a defined ranking model.

## Proposed architecture

Approved source → server-side adapter → validation and normalization → persistent listing store → query API → existing FORME feeds.

Keep source credentials server-side. Select the database/queue only after source cadence and deployment needs are known. A serverless deployment must not rely on writing a local JSON file as its persistent database.

A single ingestion pipeline upserts on source + listing ID and records successful refreshes. It handles pagination, provider-specific limits, retries/backoff and deletions. The interface must support source outages, empty matches and partial results as distinct states. Do not silently switch a failed real feed to demo listings.

Shared listing queries power Home, Discover, Following and Saved Searches. Existing local preferences can remain for the private pilot, with a versioned migration for namespaced saved IDs. Accounts and synchronized preferences are a later decision.

## Replacing prototype assumptions

1. Remove static imports as the source for live feed results. Keep demo mode explicit and isolated.
2. Replace `age === 0` with real timestamps and a defined new-arrival policy. An old listing discovered today is “new to FORME,” not necessarily newly listed on Vinted.
3. Record a per-user/per-search seen watermark for genuinely new matches. Deduplicate digest content and delivery attempts.
4. Render source currency, actual condition and source images. Show last checked time when relevant.
5. Provide “View on Vinted” for verified source links. Handle sold or missing items without discarding saved references.
6. Replace illustrative style and rarity claims with labeled inference or no label.

## Pilot acceptance criteria

- Every real card has a stable source ID, working source URL, permitted image provenance, accurate price/currency and explicit availability knowledge.
- Re-importing the same batch creates no duplicates.
- Price/status updates modify the existing listing without losing saved state.
- An ingestion failure preserves last-known data with its age and never pretends to have refreshed successfully.
- Excluded brands remain excluded across every view; search and style filters use the same listing records.
- Test sold/removal events, missing fields, inconsistent brand/size labels, multiple currencies and source outages.
- Record measured update latency and missing-field rate. Do not promise “real time” before measuring the chosen source.
- No automatic notification delivery until freshness and duplicate handling pass.

## Draft access inquiry — not sent

We are developing FORME, a personalized secondhand-fashion discovery application, initially for shoppers in Sweden. Users would explore relevant listings by brand, style and saved searches, then follow a link to Vinted to purchase.

Do you offer an approved partnership, API or licensed feed for discovering marketplace listings beyond a merchant's own inventory? We would like to clarify Swedish-market coverage, permitted listing fields and images, display/attribution requirements, refresh and deletion rules, rate limits, caching/retention, and whether saved-search notifications are allowed. We can begin with a limited pilot.

## Decisions awaiting user input

- Existing API access, partner contact or candidate data provider?
- Confirm Sweden as the first buyer market.
- Private personal pilot or eventual public commercial service? This affects source licensing and infrastructure scope.

Current app remains the working prototype. This document does not claim a live integration, data license, provider agreement or deployed backend.

## Candidate services investigated

User confirmed no existing data/API access.

- **Bright Data Vinted Scraper API:** advertises search/category discovery and listing extraction, with structured output. The product page lists 5,000 free records/month and $1.50 per 1,000 records pay-as-you-go at research time. These are advertised terms, not a verified quote or observed cost. Swedish buyer-market coverage and FORME's public display/image rights remain unverified. Source: https://brightdata.com/products/web-scraper/vinted
- **Apify marketplace Vinted actors:** an example is `sourabhbgp/vinted-scraper`, advertising listing search/detail extraction. This is a third-party actor on Apify, not Vinted's official API. Actor quality, billing, maintenance, country support and terms must be evaluated for the specific actor; platform availability is not evidence of a Vinted license. Source: https://apify.com/sourabhbgp/vinted-scraper
- **Official Pro integration application:** marketed to selected luxury/designer secondhand sellers for inventory and sales integration. This is not a verified application route for FORME's buyer-facing marketplace search use case. Source: https://www.vinted.co.uk/pro/integrations

No vendor account was opened, payment authorized, collection run or external message sent. No claim of vendor performance has been independently tested.

Recommendation: ask Vinted about a discovery partnership and ask any candidate vendor to confirm Swedish-market coverage and intended display/reuse rights in writing. In parallel, use a small seller-authorized dataset to validate the ingestion contract if available. Do not make the public product dependent on an unverified scraper service.

Vendor evaluation questions: Can FORME display original photographs and listing text? What authorization or licensing supports that use? Which buyer markets and currencies are covered? Can sold/removed status be refreshed reliably? How are deletions conveyed? Does each refresh count as another billable record? Are source publication timestamps available, or only collection timestamps? What happens during a Vinted outage or access change?

## Implemented pilot update — October 20, 2026

The earlier access-research notes above describe the original investigation. FORME now has a live-data pilot: 824 sanitized Vinted listings from a complete first pass over 49 followed-brand queries and two saved-search queries. Each query samples at most 20 rows. One explicit toy/brand mismatch was excluded after a Bright Data cross-check. Current titles and condition labels have cached English versions with original text retained.

Collection remains an explicit local command with shared snapshots, query checkpoints, per-plan completion accounting and a regular 15-credit daily cap. Default quotas are not a distributed production budget. Rate limiting and interrupted requests were observed; paced resumable collection completed the first pass. This is feasibility evidence, not an established long-term service-level guarantee. See README for operations and billing limits.
