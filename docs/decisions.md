# FORME decisions

Last reviewed: 22 October 2026. This is durable project memory; changing status belongs in [project state](project-state.md). Dates below describe when a decision was recorded, not a claim of deployment.

Sources: user instructions in the October 20–22 project sessions, the memory plan approved on October 22, and the linked repository documents/code. Raw sessions contain private material and remain local. Where the user chose a goal but not its implementation, that distinction is explicit.

## Product and interface

**20–21 October — user direction, implemented in the local experience.** FORME is a personalized secondhand discovery app for mobile and desktop. Preserve the warm neutral palette and dark green navigation, with compact content and consistent Lucide icons. Keep the desktop sidebar collapsible. Reduce duplicate branding, introductory text and competing entry points.

- Home shows personal arrivals and observed price changes; Following covers followed brands; Discover recommends relevant brands outside those follows and explains its actual ranking rules.
- Use one global My sizes/departments editor beside Saved Items. Changes apply on confirmation; cancelling preserves preferences. Keep department chips consistent, including Not specified. Size matching stays conservative and category-aware, without invented international conversions.
- Cards show condition before size, omit missing-size filler, keep description text to one line, and display SEK once as `kr`. Do not restore the removed Sweden/SEK top-navigation pill or blanket limited-snapshot banner.
- Keep Follow → Neutral → Exclude ordering. Saved-search names are labels, not inferred criteria; new searches need an actual criterion. Browsing and preference changes filter existing data without paid requests.
- Collection diagnostics and experimental rarity/digest previews belong under Collection tools. Do not present unfinished experiments as supported core features.

Rationale: a clear shopping flow with fewer controls and honest recommendations. References: [core experience](core-experience.md), [README](../README.md), and the rendered shell in `components/forme.tsx`.

## Accounts and private beta

**21–22 October — user-approved direction.** Use Supabase for Postgres and authentication. The beta is single-owner across desktop and mobile, invite-only, passwordless, with collection restricted to the owner. No friend onboarding is required for the initial beta.

**22 October — implemented approach, real setup pending.** Commit `2088962` adds email-link and Google sign-in paths, invite checks, database row-level security, revision-based profile sync and hosted listing reads. Email links are the documented baseline; Google configuration is optional. The earlier planning note that authentication/sync were unimplemented is superseded by this code, not by evidence of a live deployment.

- Collection, translation and publishing remain on the owner's computer. The service-role key stays there; browser sessions cannot publish listings.
- Preserve local preferences and JSON exports. Sync can adopt an existing account profile, retaining the prior browser copy; concurrent edits use revision checks rather than silent overwrites.
- Vercel remains the documented hosting direction, not a provisioned service. Inngest/a hosted durable worker and a distributed spending ledger remain proposals for later work, not selected dependencies to add automatically.

**23 October — user decision.** Do not enable Google sign-in for now; email links only. The login page hides the Google button unless `FORME_GOOGLE_SIGNIN=1`, and `/auth/google` refuses while it is off. This narrows the earlier "email link or Google" direction; it can be reversed by setup alone.

Rationale: cross-device use without building password handling or prematurely moving paid collection into the cloud. Reference: [accounts setup, sync behavior and limitations](accounts-setup.md). Both passwordless paths now exist in code; which providers to enable in the real project remains a setup choice.

## Data trust

**21 October — implemented policies to preserve.**

- Retain marketplace identity, provenance, original text and per-item source observation times. Merging an old row into a fresh snapshot must not make that row newly observed.
- Department can come from explicit provider fields, explicit title wording or documented search scope. Never infer it from brand, size, silhouette or photos; distinguish search scope from item-level evidence.
- Style inference is allowed with visible evidence. Collectible title signals stay separate from verified rarity; never invent scarcity scores or live rarity badges.
- Unknown availability stays unknown. Missing limited-search results do not prove sale or removal. Explicit sold/unavailable observations retain their provenance and must survive later search refreshes.
- New to FORME describes first observation, not seller publication today. Price changes require actual stored observations. Demo claims remain fictional and distinct from live data.
- Keep exact-title English translation caches and originals. Uncached text remains pending; do not imply that collection includes paid translation.
- Validate public fields and outbound URLs; discard seller payloads. Do not silently replace failed live data with demo results or weaken filters to populate an empty feed.

References: [data trust](data-trust.md), [data quality and inference](data-quality.md), [Discover pilot](discover-pilot-2026-10-21.md), and shared rules in `lib/domain/`.

## Collection and spending

**20–22 October — user spending controls and implemented safeguards.** Use free cost previews and authorization bounded to the proposed paid work. A historical trial or completion allowance does not authorize another run. Changing a cap requires authorization for that change; never reset ledgers to bypass it.

Reserve the maximum cost before calls, retain checkpoints and uncertain reservations, and stop on unexpected responses or billing. No automatic retries of potentially billed calls. The background queue uses a heartbeat and marks stalled work interrupted; it does not make provider billing exactly once. Keep browsing, saving, polling and filter edits free of paid collection/translation calls.

The configured cap is persistent local state, distinct from the code default and the provider balance. Do not describe the local ledger as a shared account-wide limit. Recheck current provider costs before proposing new spending rather than treating old estimates as current prices.

References: [refresh controls](refresh-and-feedback.md), [worker operations](release.md#background-collection), and `lib/server/refresh-control.mjs`. The worker recovery section in the newer release notes supersedes the older refresh document's claim that recovery is unimplemented.

## Engineering and memory

**22 October — approved memory policy.** Shared rules and decisions live in Git; personal and operational details stay in ignored `.context/`. Agents update memory as they work and before handoff. Keep secrets out of both. Do not copy private transcripts into public docs.

Use the current checkout as the source of work, preserve preferences/exports/history, keep local URLs on explicit `127.0.0.1`, and follow the machine-routing guard in [AGENTS.md](../AGENTS.md#machine-routing-safety). Preserve Next.js's generated agent guidance and read installed version-specific guides before application code changes.

When a choice changes, date the replacement and mark the prior choice superseded. A code implementation is not proof of a live service, a historical test result is not a fresh test run, and a recommendation is not user approval.
