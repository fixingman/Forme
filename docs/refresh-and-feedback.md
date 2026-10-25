# Refresh controls and feedback review

Implemented 21 October; updated 24 October 2026 for personalized Discover and a simplified manual collection flow. Verification below uses fixtures and mocks; no provider credits were spent during these changes.

## Collection precision

Exact Vinted brand IDs are verified for the first Discover cohort: Auralee 2053426, Lemaire 295938 and Studio Nicholson 663899. The reference file keeps primary-source URLs and verification dates in `data/vinted-brands.json`. Supported refreshes send `brand_ids` and still validate returned brand names and public listing fields. Unmapped brands use a clearly reported text-search fallback with the same strict validation; the plan reports how many searches have exact filters.

Department preferences scope clothing searches to the Men's catalog when Men is selected and Women is excluded. Search scope remains distinct from an item-level gender label. This does not exhaust unisex listings filed elsewhere, and these scoped refreshes do not refresh homeware. Sizes are matched locally after fetching using separate clothing, waist and shoe groups. Reliable upstream size IDs have not been verified; none are guessed. Lower yield remains possible, so improvement over the first pilot is not yet measured.

References: [Auralee](https://www.vinted.se/brand/2053426-auralee), [Lemaire](https://www.vinted.se/brand/295938-lemaire), [Studio Nicholson](https://www.vinted.se/catalog/2623-chodaki-i-mule/brand/663899-studio-nicholson), [provider search filters and current five-credit search cost](https://scrapebadger.com/ecommerce-scraper-api/vinted).

## Explicit refresh flow

From any page on this computer, press the refresh icon in the top bar (named **Find new pieces**). This stays on the current page and opens a small dialog that obtains a free cost preview. Discover and Following default to their own scope; other shopping feeds use Your edit. The default is up to three brand searches. **Search options** changes scope or batch size, including larger batches up to 120 brand searches / 600 quoted credits. The actual quote includes only eligible brands, so it can be smaller. Saved-item availability checks retain their separate one-to-three-item limit. No paid request occurs while changing options.

The preview shows the brands, maximum credits and today's remaining local allowance. Only the separate **Find pieces · up to N credits** confirmation authorizes collection. Cancel, Escape and closing the dialog never start a run. A failed quote can be retried for free; a failed or expired run confirmation clears the quote and never automatically resubmits collection. Background collection may continue after the dialog closes.

Settings → Collection tools is the advanced path: refresh is first; source selection remains available, while Budget and history, plan details, data quality, recommendation diagnostics and local settings checkpoints are collapsed until requested. Cap edits still need an explicit Save daily cap action.

Plans expire after ten minutes and are bound to the submitted preferences. Changing preferences invalidates the preview. Completed/failed plan IDs do not repeat requests. A shared file lock prevents concurrent refreshes and conflicts with CLI collection or translation. Successful queries checkpoint before subsequent calls; there are no automatic retries. Results retain old listing fetch timestamps, preserve the existing collection, and import into price-history storage.

Existing cached English translations are reused. No paid translation endpoint is called by these refreshes. New untranslated titles are retained for review and counted in the outcome; the refresh does not promise to translate unseen text automatically.

## Freshness and rotation

The owner chose manual refreshes, with no scheduled collection. After the 24 October design feedback, the top bar (left of My sizes, on every page) holds one control: a refresh icon with the time since the latest recorded check, counting up in seconds, then minutes, hours and days. Locally it is the **Find new pieces** button; its exact time is a tooltip and screen readers hear “Latest check 3 minutes ago” as its description. On hosted domains it is a plain timestamp, not a button. Individual pieces may have been checked earlier than the latest check. The former full banner, “A refresh is due” prompt, stale-count summary and separate Check for updates button are removed. The date itself gives quiet freshness context. A successful empty search advances the collection check time without altering any retained listing's observation time or availability.

While live mode is visible and online, the browser reads FORME's stored/published listings for free every five minutes and on foreground/network return, throttled to at most once per minute. Failed background reads retain the last usable feed. These reads never call the paid collector or translator. Updates collected locally still need deliberate publishing before other devices see them; this feature does not add automatic publication or deployment. The local-only collection action is hidden on hosted domains.

Manual plans use followed brands and/or taste-derived discovery brands. Least-recently-checked brands go first, with taste priority breaking ties. Successful queries, even those returning no accepted results, checkpoint bounded history keyed by brand/catalog scope. Failed or uncertain calls do not count as successful checks and are not retried. Existing legacy query coverage is used as historical rotation context. Results are limited searches, not exhaustive marketplace or availability checks.

Live **New to FORME** cards and Home arrivals share a rolling seven-day first-seen window, require post-baseline newness, and reject future first-seen times. Demo badges remain illustrative. The experimental daily digest retains its same-calendar-day definition. SQLite exports after collection preserve derived newness and original per-item observations for fallback reads and deliberate publishing.

## Budget accounting

The private `.forme-data/refresh.sqlite` stores plans, results, reservations and the daily cap. Fresh installations default to 15 credits. Collection tools → Budget and history allows an explicit cap of 5–600 credits, or turning **Limit daily spending** off and pressing **Save daily cap**. Off mode is stored as `cap=0` and reports `remainingCredits=null`, never a fabricated provider balance. It keeps all accounting and still requires a separate quoted run confirmation. Brand-search plans remain bounded to 120 searches / 600 credits; availability checks retain their separate limit. The default quote remains three searches. The UTC-day budget includes ordinary collection ledger reservations, completion reservations, the previous Discover pilot, and new UI refreshes. The command-line collectors also honor this configured cap once the controls have initialized it, including off mode. The ordinary collector uses its legacy 15-credit fallback only when no control database exists. Historical one-time pilot/completion allowances stay separate and are not reset or expanded by switching the daily cap off.

Historical 21 October report: that day's pilot had used 15 reported/reserved credits, leaving zero under the code's default cap. This is not a current balance or configured-cap reading.

The maximum batch cost is reserved transactionally before the first provider call. Failed/uncertain calls keep reservations; unexpected charges also consume the cap. This is conservative local accounting, not a provider account-balance query or an account-wide guarantee. Provider billing outside FORME is not tracked. No process is scheduled automatically. The worker heartbeats and marks stalled work interrupted while preserving reservations; it never retries potentially billed calls. See [worker recovery](release.md#background-collection).

## Feedback review

Settings → Collection tools → Recommendation feedback shows saved and hidden counts, current eligible Discover pieces, and per-brand collected/eligible/saved/hidden counts. Hidden pieces can be reviewed and restored individually, including keys that have left the current snapshot. Restoring immediately updates the browser preference and ranking pool.

Explicit styles, including custom style rules, and saved pieces extend the editorial related-brand map. Saves boost matching brands/styles and bounded text hints about category, material, color and fit. Recently observed listings receive a small boost using their own timestamps. Ranking interleaves brands for variety and explains the evidence used. No click tracking, external model or provider request is involved.

**Not for me** is available on cards throughout Home, Following, Discover, saved searches, Saved Items and the preview grids, plus item detail pages. It hides that piece across feeds, applies a small bounded brand penalty, and modestly reduces repeated shared traits only after multiple dismissals. Saved IDs and retained copies are preserved; an active dislike pauses the saved piece’s positive taste contribution until restored. The feedback notice offers Undo, dismisses after four seconds and shows a thin progress line without a numeric seconds counter. Hover or keyboard focus pauses its remaining time. Settings → Hidden pieces offers later restoration.

The adjacent **…** brand control opens an explicit **Not interested in [brand]** action with its all-feed scope disclosed. It uses the existing excluded-brand preference and stops following the brand; it does not create fabricated item dislikes. Undo restores the previous brand state. Later changes remain available under Your brands → Excluded. Brand exclusions and piece feedback continue through existing settings backup/account fields.

Up to 200 compact feedback summaries survive outside the current collection in optional `tasteFeedback` profile data. Only currently dismissed keys contribute; Undo/Restore immediately stops using a signal. Existing backups without this field still work, and new v1 exports/account profiles retain it. Inferred hints do not populate verified listing fields. Department, size, excluded brands, review and availability filters remain hard constraints. Counts are preference signals, not inferred clicks, impressions, conversion rates or proof that relevance has improved. Saved-item snapshots and known active listings provide context; unmatched IDs remain visible as outside the current collection. Browser persistence, JSON backup, and explicit local-profile checkpoints remain available.

## Ranking preview

Collection tools also links to the owner’s local [Ranking preview](ranking-preview.md), with Current / River / Gorse views and a fixed blind comparison. Its ratings, model snapshots and optional earlier-study imports stay separate from real saves and hidden pieces. Switching views reads frozen results; a new comparison is needed to train on new preview feedback. It never calls collection or translation.

## Local pilot boundary and verification

The refresh API requires loopback Host / matching Origin, JSON input, a bounded request body, and validated FORME settings. Collection writes are disabled on Vercel and require the configured owner authorization when sign-in is enforced. Keys remain server-side and status exposes only availability. Accounts and hosted reads now exist separately; see [accounts setup](accounts-setup.md). There is still no cloud job runner, distributed budget, or automatic brand/size-reference lookup.

Historical 21 October verification: build; complete browser suite (32 tests); logic tests covering free previews, prior spend, configured CLI caps, exact filters, missing/changed billing, stale preferences, lock conflicts, duplicate submissions and reversible feedback. The real free preview kept charges unchanged, with Run disabled at the daily cap; desktop/mobile review found no browser errors or horizontal overflow.

23 October verification: typecheck, production build, all 129 unit tests and all 68 browser tests passed. Checks used fixtures/mocks in an isolated checkout copy, including hard-filter preservation, retained taste feedback and v1 backup round-trip, mixed-feed query rotation after empty responses, original observation/newness preservation, manual spending gates, free published-data polling and mobile overflow. No real provider relevance/yield evaluation, spending, publishing or deployment was performed.

24 October UX verification: typecheck, production build, 129 unit tests and 71 Playwright tests passed using the isolated fixture copy. Added/updated checks cover in-place free quotes, explicit cost confirmation, duplicate clicks, cancellation/Escape/focus return, failed/expired quotes, allowance gating and progressive disclosure. Desktop/mobile feed and dialog screenshots were inspected; no provider collection or publication was used for verification.
