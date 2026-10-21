# FORME v2

A mobile-first Next.js app built from `docs/prototype/forme-prototype.html`, with the original warm neutral palette, dark green navigation, and sample catalog. The original HTML remains untouched.

## Project layout

```
app/                 Next.js routes and API handlers (app/api/*)
components/          React UI
lib/                 Client/shared TypeScript: preferences, catalog, navigation, backups of settings
  domain/            Framework-free logic (.mjs): trust rules, classification, sizes, gender,
                     recommendations, refresh/availability planning, Vinted normalisation
  server/            Server-only code: jobs, budget ledger, SQLite store, backup, health, logging
scripts/
  data/              Collection, translation, import, audit and coverage commands
  ops/               Worker, backup/restore, environment and secret checks
  probes/            One-off provider experiments (spend credits when run)
data/                Reference data (brand IDs, brand styles, translations, review list)
public/              Static assets and the Vinted import helpers
docs/                Roadmap, release runbook, data-quality notes; docs/prototype/ holds the v1 HTML
tests/
  unit/              node:test logic tests (npm run test:unit)
  e2e/               Playwright browser tests (npm test)
  fixtures/          Sample listings used by tests
```

## Run locally

Use Node.js 24 or newer (see `.nvmrc`); the local database uses `node:sqlite`.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000. Production: `npm run build`, then `npm start`.

## What works

- First-visit setup for followed brands, departments and grouped sizes, without replacing existing users’ preferences. Setup can be revisited from Settings.
- Home shows real newly collected personal arrivals, observed price changes and compact saved-search summaries. Following covers followed brands; live Discover recommends related brands outside those follows and explains each recommendation.
- Shared saves, dismissals with undo/restoration, source links, English cached titles with originals, and persistent preferences across navigation and reloads.
- Saved-search creation/editing/deletion and matching listing carousels. New searches require at least one actual criterion; creating one filters the current collection without initiating paid collection.
- Style preferences and editing beside Discover filters. Live style filters only appear when classified matches exist; there is no live AI style model.
- Brand autocomplete, custom follows, and exclusive Follow → Neutral → Exclude controls.
- Consistent typography and icons, collapsible desktop sidebar, mobile navigation, keyboard dialogs, loading/error/empty states and missing-photo fallbacks.
- Settings handles personal preferences, hidden pieces and backup/import. **Settings → Collection tools** holds data mode, collection coverage, explicit cost controls, profile checkpoints and recommendation diagnostics. These are local tools, not an authenticated admin area.
- Rare Finds and daily digest previews remain under experimental tools, outside primary navigation. Scheduled delivery and live rarity classification are not connected.

See [data trust and audit](docs/data-trust.md) and [core experience notes](docs/core-experience.md) for behavior and verification boundaries.

## Operations

`npm run worker` runs the collection worker; `npm run backup`, `npm run backup:drill` and `npm run restore` handle backups; `npm run data:coverage` reports field coverage; `npm run env:check` and `npm run check:secrets` check configuration. See [release basics](docs/release.md) and [data quality](docs/data-quality.md).

## Getting data

The scraped marketplace snapshot (`public/data/vinted.json`) is deliberately not committed. A fresh clone starts without live listings; the app shows an explicit empty/failed-snapshot state and can be switched to demo data from the welcome screen or Settings. To collect real listings, copy `.env.example` to `.env.local`, add your own provider key, preview the cost with `npm run data:discovery-plan`, and run `npm run data:refresh` or `npm run data:discover` yourself. Never commit `.env.local`.

## Data and integration boundaries

`lib/catalog.ts` is the single sample catalog, retaining v1 listing IDs and imagery. `lib/preferences.ts` centralizes search matching, style matching, exclusions and digest selection. `components/forme.tsx` renders the interactive application. Its state lives in the root layout so route caching cannot restore an old preference snapshot.

Preferences use `forme-v2` in localStorage. If that key is absent, a valid `forme-v1` record on the **same browser origin** is imported. The v1 key is preserved. Storage from a file:// prototype, another host, another port or another browser is separate and cannot be automatically read by this app. Storage failures leave the app usable in memory with a visible explanation.

In Demo mode, listings, condition, prices, rarity and availability are fictional. Photos are illustrative remote Unsplash images inherited from the original prototype. “New today” means `age === 0` in this fixed demo snapshot; the data does not refresh from a marketplace. Excluded brands are hidden from feeds, while previously saved IDs remain stored. Direct product URLs can still show an excluded item with a notice.

Style ideas are preset rule-based starting points. Live Vinted listings are collected through a third-party provider and stored locally in SQLite with a sanitized JSON fallback. There is no live AI style model, checkout, authentication, email delivery or scheduled notification service. The saved digest time is a preview preference only. Accounts and cross-device sync still require a hosted backend.

## Verification

```sh
npm run build
npm test
```

Playwright tests use installed Google Chrome (`channel: 'chrome'`) and automatically start the local server. They cover browser history, shared saved states, preference migration, search editing/deletion, styles, brand exclusions, digest settings and mobile layout.

## Vercel readiness

The frontend uses a standard Next.js build (`npm run build`), but the current live backend is local-only: loopback-protected APIs and filesystem storage are not production hosting architecture (collection now runs as background jobs, but on local storage). A hosted database, sign-in, durable jobs and managed secrets are required before deployment. See [production roadmap](docs/production-roadmap.md). This project has not been published. Local browser preferences do not transfer to a new origin automatically.

## Visual direction

The October refinement removes the oversized Home introduction and duplicated desktop branding, reduces product cards to two text sizes, uses `kr` once per price, removes price dividers, and reduces the number of competing Home sections. Search summaries use compact horizontal cards on small screens; Saved Searches exposes matching listing rows.

References consulted: [NN/g — Good Visual Design](https://www.nngroup.com/articles/good-visual-design/), [Dribbble — Fashion product cards](https://dribbble.com/search/fashion-product-card), and [Lucide React](https://lucide.dev/guide/react/). These informed hierarchy and consistency; no third-party page or design was copied.

### Live Vinted snapshot

FORME defaults to **Vinted**. Use **Settings → Collection tools → Listing data** to return to Demo. The collector now reads the supplied private settings backup to plan Swedish-market queries for followed brands and specific saved searches. The completed first pass contains 824 listings from all 51 planned queries (49 brands and two saved searches), after one explicit quality exclusion; collection coverage is shown in Collection tools. Saved searches filter this shared snapshot; creating a search does not yet collect additional marketplace results.

Run `npm run data:refresh` locally to collect a new snapshot. This is the only integration command that spends provider credits. Pass `-- --settings "/absolute/path/to/forme-settings.json"` to use a new settings backup, or `-- --plan` to preview queries without sending requests. Later runs reuse `.forme-data/settings.json`. It uses `SCRAPEBADGER_API_KEY` from `.env.local` (or the process environment); the browser reads only sanitized `public/data/vinted.json`. Browsing, saving and reloading never call the provider. Bright Data enrichment is not enabled.

The collector deduplicates by marketplace/item ID, retains first-seen times, discards seller payloads, validates URLs and SEK prices, and publishes a replacement snapshot only after every query in that run succeeds. The existing snapshot survives errors. A six-hour cache, exclusive local lock, timeout, no automatic retries, and 15 reserved credits per UTC day bound this local trial. Failed/interrupted requests still consume the local reservation; exact billing comes from the provider dashboard. Provider credit-price changes are outside this cap's control. `.forme-data/usage.json` records local reservations and reported usage; deleting it resets the guard.

Live listings expose actual photos, condition, size, price and original Vinted links. Saved listing copies persist in this browser even if the next snapshot omits them. A cached listing is not a guarantee of current availability. Collection time and first-seen time are not publication times, so live items do not receive “New today” badges or enter today's digest yet. Live style classification and rarity scoring are also pending.

For an initial Vercel preview, refresh locally and deploy the sanitized snapshot with the app. The snapshot updates on the next deployment; no API keys are needed in the hosted app for this mode. Before automated collection or horizontal scaling, move snapshots, the quota ledger and locking to a shared persistent database, protect refresh jobs, and use a durable queue. The local ledger is not a distributed or account-wide spending limit. Future Tradera/Blocket adapters should return the same provenance fields (`source`, `sourceId`, `sourceKey`) and use globally unique UI IDs before mixing marketplaces.

Validation: `node --test tests/unit/normalization.test.mjs`, `npm test`, and `npm run build`. Browser tests use the snapshot or mocks and spend no credits.

### English listing text

The current personalized snapshot has reviewed English titles and fixed English condition labels. Original seller titles and conditions are preserved and expandable on the item page. `data/title-translations.json` caches translations by exact original title; changed titles cannot reuse an outdated translation. Saved listings are localized when displayed as well.

Run `npm run data:translate` to apply cached translations to the current snapshot at no API cost. Collection also applies existing cached translations automatically. New, uncached titles remain original and are marked as pending on the detail page; unsupported condition labels retain their original text in the disclosure and show “Condition not translated.”

For additional titles, configure a Google Cloud Translation Basic API key as `GOOGLE_TRANSLATE_API_KEY` in `.env.local`, then explicitly run `npm run data:translate -- --google`. This contacts Google's official v2 NMT endpoint only for uncached titles, with automatic language detection and English as target. Each run allows one batch of at most 100 unique titles and 5,000 characters, with a timeout and no retries. No browser requests or scheduled translation billing are involved. The key is not supplied in this workspace, so Google translation has not been exercised against the live service. Current reviewed translations incurred no translation API charge.

API reference: https://docs.cloud.google.com/translate/docs/reference/rest/v2/translate

### Settings backup and Vinted follows import

Settings now supports downloading and restoring a versioned JSON backup containing followed/excluded brands, saved searches, styles and rules, digest settings, saved IDs and retained listing copies, listing mode and sidebar state. File imports are local, validated (including a 2 MB size limit), previewed before application, and saved to this browser. Restoring replaces the current settings; download a backup before replacing them. The export is built from known preference fields and contains no API keys, browser cookies or login tokens.

A separate Vinted brands import merges brand names into existing follows. It deduplicates case-insensitively and preserves exclusions. Open `/vinted-import.html` for a bookmarklet exporter that reads only loaded brand links on `/member/personalization/brands/followed`, downloads a local JSON file and makes no requests. Scroll/load the full list before exporting. This is a manual import, not continuous account synchronization; it does not import sellers, sizes, saved searches or favorites.

Investigation: Dia was running and AppleScript could open the Vinted page, but reading its DOM was blocked with “JavaScript execution via AppleScript requires the --enable-applescript-javascript launch flag.” No launch flags, cookies or browser profile files were changed or copied. The exporter has browser-fixture coverage; the current live Vinted DOM and completeness of an actual account export remain unverified. The generic computer-use tool also failed to initialize because the configured writable root contains a symlink.

Vinted documents personalization here: https://www.vinted.com/help/424/31-wat-is-personalisatie
Historical evidence of the followed-brand page and brand links: https://greasyfork.org/en/scripts/466601-vinted-search-followed-brands/code (current DOM still requires verification).

No-drag import: Settings also accepts brand names pasted one per line with preview before merging. The exporter instructions include a copyable bookmark address and manual bookmark-editing steps for Dia; dragging from the in-app browser is not required.

### Personalized collection coverage

The supplied October 20 backup contains 49 followed brands and three starter saved searches. It produces 51 queries: 49 brand searches and two keyword searches. “Vintage accessories” has no keyword or brand and is skipped rather than issuing a broad marketplace request. Search names are labels, not inferred filter rules: “Japanese trousers” currently means keyword `trousers`, size M, max 4,000 SEK; no Japanese-origin classification is implied.

Each manual refresh requests up to 20 rows for each of three least-recently-collected queries, reserving up to 15 credits. The 15-credit UTC daily cap remains in place. A full first pass over 51 queries requires 17 separate refresh days at this cap; there is no scheduler. Query coverage does not imply exhaustive inventory coverage. Full pagination and provider-side brand-ID resolution are not yet implemented.

Brand jobs accept only the matching structured brand label (ignoring case, punctuation and diacritics). This rejects unrelated keyword matches but can miss aliases and sub-brands; those need explicit mapping or provider brand IDs later. Saved-search results also honor keyword, size, budget and brand rules. Exclusions apply during collection. Every item records the query memberships that found it, allowing deduplication across queries while retaining rows for queries not refreshed in this batch. A row leaving a search page is not treated as confirmed sold. Previous price/status history and sold checks remain pending.

Preferences and the complete collection plan stay in ignored `.forme-data/`; only the sanitized listing snapshot and query coverage are served to the browser. Browser tests use a frozen fixture so checks do not depend on changing marketplace inventory or spend credits.

### One-time completion

`npm run data:refresh -- --complete --plan` previews uncovered queries. `npm run data:refresh -- --complete` uses the explicitly authorized one-time allowance (at most 240 credits per plan) to collect only uncovered queries, with progress saved after each successful query. Explicit recovery via `--complete --retry-once` can reserve five extra credits per interrupted attempt, at most ten extra credits total (maximum 250 including uncertain charges); it does not alter regular daily limits. `.forme-data/completion-allowances.json` tracks reserved and consumed credits across interrupted runs; resuming reuses that reservation. The regular refresh command retains its 15-credit daily cap. Requests are spaced 13 seconds apart after an observed trial rate-limit response; errors stop the run without automatic retries. A failed response with unknown billing conservatively consumes its reserved request credits.

Larger grid feeds initially render 24 cards, with a Show more control for the rest. Query coverage means each planned query has been checked once, sampling up to 20 results per query; it does not mean every matching marketplace listing has been collected.

Data-quality check: a toy listing tagged as Comme des Garçons Play x The North Face was independently returned with the same label and a children’s modelling-clay category by Bright Data. It is explicitly excluded in `data/listing-review.json`. This confirms the two providers agree on that anomalous record, not that marketplace brand labels are reliably correct. Further label/category validation is needed before broad production use. The single Bright Data detail check’s actual charge was not reported in its response.

October 20 completion audit: 48 additional queries completed, with 240 credits reported for those successful requests. Two interrupted attempts have unknown billing, so the local guard reserved an additional ten credits (250 total for this completion operation). A separate single Bright Data detail check was used to investigate one brand/category mismatch; its actual charge was not returned. No pending title translations remain in this snapshot. All of these counts describe a one-time sample; ongoing freshness checks and automatic preference synchronization remain future work.

### My sizes

Each feed has one compact My sizes switch and an edit icon. Choose letter sizes, numbered labels, waist labels or a custom label, then save once. Matching applies to Home, Discover, Following, saved-search results, Rare Finds, the digest and Saved Items. Switching it off reveals all sizes while retaining the selection; detail pages and saved IDs remain accessible. Settings includes the same editor.

One-size/adjustable items and listings without a size have independent inclusion choices. Matching reads explicit seller labels (including `M / 38 / 10`, `46 | W30`, decimal commas, and `EU` prefixes). It does not guess international conversions or infer shoe-versus-clothing categories from a bare number. Numeric clothing and shoe labels can therefore overlap; choose the labels used on listings. Existing saved-search size rules intersect with My sizes.

Sizes persist in localStorage and settings backups. Older backups without size preferences remain valid and start with filtering off. Changing these preferences filters the existing snapshot and makes no provider requests. Collection can read the optional setting in a future backend sync; it currently continues collecting the same brand queries, preserving the option to show all sizes.

The user's confirmed starting labels are M, L, W31, W32, EU 48 and EU 50, with one-size pieces included. The private `.forme-data/size-profile.json` supplies this one-time local-pilot setup through `/api/size-profile`. A browser marker prevents later reloads from replacing edits made in the app. The endpoint serves only sanitized size fields, returns no profile on Vercel, and contains no marketplace credentials. Expanded label banks and a custom-label field let the user add values over time.

## Recommendation foundations (21 October 2026)

See [the next-phase implementation and limitations](docs/next-phase-plan.md). Grouped size preferences, a private local SQLite store, explicit settings checkpoints, and related-brand Discover rules are available. Run `npm run data:import` after replacing a snapshot manually. `npm run data:discovery-plan` previews expansion without spending credits. Settings remain in the browser until explicitly saved through Settings → Local database. This storage is disabled on Vercel; a hosted database and authentication are still required before deployment.

The first paid Discover pilot is complete: [results, quality review and costs](docs/discover-pilot-2026-10-21.md). `npm run data:discover` previews the fixed pilot. `npm run data:discover -- --collect` uses its existing one-time ledger and does not repeat completed calls. Home now shows new-to-FORME items and observed price changes; saved/dismissed feedback affects rule-based ranking.

Settings now provides free refresh previews, explicit paid runs, a persistent daily credit cap and recommendation feedback review. See [refresh controls, precision and limitations](docs/refresh-and-feedback.md). The default daily cap is 15 credits and includes prior local collection spending; this implementation did not spend additional credits. Upstream size IDs are still unverified, so size matching remains local after fetching.

For the remaining product work and the proposed path to a deployed private beta, see [the production roadmap](docs/production-roadmap.md). This roadmap does not mean cloud services have been provisioned or the local-only backend has been made public.
