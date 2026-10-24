# FORME decisions

Last reviewed: 24 October 2026. This is durable project memory; changing status belongs in [project state](project-state.md). Dates below describe when a decision was recorded, not a claim of deployment.

Sources: user instructions in the October 20–22 project sessions, the memory plan approved on October 22, and the linked repository documents/code. Raw sessions contain private material and remain local. Where the user chose a goal but not its implementation, that distinction is explicit.

## Product and interface

**20–21 October — user direction, implemented in the local experience.** FORME is a personalized secondhand discovery app for mobile and desktop. Preserve the warm neutral palette and dark green navigation, with compact content and consistent Lucide icons. Keep the desktop sidebar collapsible. Reduce duplicate branding, introductory text and competing entry points.

- Home shows personal arrivals and observed price changes; Following covers followed brands; Discover recommends relevant brands outside those follows and explains its actual ranking rules.
- Use one global My sizes/departments editor beside Saved Items. Changes apply on confirmation; cancelling preserves preferences. Keep department chips consistent, including Not specified. Size matching stays conservative and category-aware, without invented international conversions. **24 October — user-approved refinement:** when an item's category cannot be classified, a letter size (XS–XXXXL, or a range of them) is still a clothing size, so one that is not among the owner's clothing sizes hides the item instead of passing as “unspecified”. This only ever hides: a matching size, and any numeric, waist or shoe size, still follow the include-unspecified setting. Underwear words (underwear, boxers, briefs, trunks, pyjamas, undershirt) and socks now classify as clothing. Socks are sized in European shoe sizes, so a sock size written as an EU range or number (40-43, EU 42) is matched against the owner's saved shoe sizes (same unit, no conversion); UK/US-labelled and S/M/L sock sizes, and any sock when no shoe size is saved, follow the include-unspecified setting. Source: owner request, 24 October.
- **24 October — user direction:** place piece feedback above the recommendation explanation on Discover cards (renamed **Not for me** in the later 24 October decision below).
- Cards show condition before size, omit missing-size filler, keep description text to one line, and display SEK once as `kr`. Do not restore the removed Sweden/SEK top-navigation pill or blanket limited-snapshot banner.
- Keep Follow → Neutral → Exclude ordering. Saved-search names are labels, not inferred criteria; new searches need an actual criterion. Browsing and preference changes filter existing data without paid requests.
- Collection diagnostics and experimental rarity/digest previews belong under Collection tools. Do not present unfinished experiments as supported core features.

Rationale: a clear shopping flow with fewer controls and honest recommendations. References: [core experience](core-experience.md), [README](../README.md), and the rendered shell in `components/forme.tsx`.

**23 October — user direction and implemented ranking policy.** Make Discover respond to the owner's taste using saved pieces, explicit/custom styles and reversible Not interested feedback. Keep ranking explainable and conservative: editorial brand/style references are starting points, title/category hints are inference rather than verified garment facts, and relevance weights never bypass department, size, exclusion, review or availability rules. Retained saved copies can supply signals when the original listing leaves the feed. Store a bounded summary of hidden-piece signals in optional profile data, compatible with v1 exports; restoration stops using that signal. Recommendation quality remains unmeasured, rather than proven by test coverage. Source: the owner's request to improve Discover; implementation details in [refresh and feedback](refresh-and-feedback.md#feedback-review).

**24 October — user direction, implemented locally.** Make **Not for me** available throughout the shopping experience, with a separate explicit brand-level **Not interested** control. Piece feedback hides that item across feeds and supplies a bounded negative taste signal; it never becomes an automatic brand exclusion. A hidden saved piece stays saved, while its positive recommendation contribution pauses until restored. Brand feedback uses the existing excluded-brand preference, hides that brand across feeds, and stops following it. Explain this scope before applying the card/detail brand action. Preserve Undo, Settings → Hidden pieces, Your brands → Excluded, account/backup compatibility and retained saves. This supersedes the former Discover-only dismissal placement/scope; it does not select or integrate River/Gorse. Source: owner request to offer feedback throughout the product and directly mark an entire brand not interested.

**23 October — implementation policy.** “New to FORME” on live cards and Home means a post-baseline listing first seen within the rolling last seven days. It does not mean seller publication today or a fresh availability check. The experimental daily digest still uses the browser's calendar day. This replaces the former card-only same-day window.

**24 October — user research preference, no dependency selected.** Prioritize River and Gorse when evaluating a learned recommendation system. FashionCLIP may be an optional add-on; the owner is unconvinced of its performance and does not want it treated as the core approach. Assess recommendation quality on FORME feedback before replacing the current rules. This preference authorizes comparison, not provisioning a service or enabling model/paid collection calls.

**24 October — user-approved evaluation scope.** The owner’s “go” authorizes the proposed local comparison of Gorse, River and existing rules, including isolated evaluation dependencies and a private blind labeling exercise. It does not select a production engine, authorize paid collection/model calls, import study votes into the account, or provision a hosted recommender. Keep FashionCLIP deferred. See [evaluation method and results](recommendation-evaluation.md).

## Accounts and private beta

**21–22 October — user-approved direction.** Use Supabase for Postgres and authentication. The beta is single-owner across desktop and mobile, invite-only, passwordless, with collection restricted to the owner. No friend onboarding is required for the initial beta.

**22 October — implemented approach, real setup pending.** Commit `2088962` adds email-link and Google sign-in paths, invite checks, database row-level security, revision-based profile sync and hosted listing reads. Email links are the documented baseline; Google configuration is optional. The earlier planning note that authentication/sync were unimplemented is superseded by this code, not by evidence of a live deployment.

- Collection, translation and publishing remain on the owner's computer. The service-role key stays there; browser sessions cannot publish listings.
- Preserve local preferences and JSON exports. Sync can adopt an existing account profile, retaining the prior browser copy; concurrent edits use revision checks rather than silent overwrites.
- Vercel remains the documented hosting direction, not a provisioned service. Inngest/a hosted durable worker and a distributed spending ledger remain proposals for later work, not selected dependencies to add automatically.

**23 October — user decision.** Do not enable Google sign-in for now; email links only. The login page hides the Google button unless `FORME_GOOGLE_SIGNIN=1`, and `/auth/google` refuses while it is off. This narrows the earlier "email link or Google" direction; it can be reversed by setup alone.

**23 October — user decision.** Send sign-in email through Resend over SMTP, using Resend's shared test sender because the owner has no domain to verify. This delivers only to the Resend account's own address, which suffices for a single owner; it is a stopgap, not a deliverability plan. A key pasted into chat is treated as exposed and must be revoked; keys go only into Supabase's SMTP password field.

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

**23 October — explicit user decision.** Use **manual refresh with freshness reminders**, rather than scheduled collection. The initial implementation reminded after 24 hours without a recorded marketplace check; its banner/entry point is superseded by the 24 October UX decision below. Expose a free cost plan; only an explicit Run refresh authorizes the previewed collection. Rotate brands by least-recent successful check, including empty searches, within the selected feed and existing batch/cap limits. Free five-minute/foreground reads may pick up already-published FORME listings; these reads do not collect, translate or publish. Source: the owner's answer to the daily opt-in versus manual question. This does not approve a paid run, change a cap or select a hosted scheduler.

**24 October — user-requested simplification, informed by a focused Claude UX review.** The full freshness banner and competing “Check for updates” / “Preview refresh” controls were too heavy. Replace them with one quiet relative “Latest check” line below the shopping page heading and one local-only “Find new pieces” action. Exact time and partial-coverage context stay available on tap/focus. **Superseded in placement on 24 October (owner request):** both now live in one top-bar control, a refresh icon with the time since the latest check counting up (seconds, then minutes, hours, days), present on every page. The label “Find new pieces” stays as its accessible name; the exact time is a tooltip. On hosted domains it is a plain timestamp, not a button. The in-place cost preview, caps and no-retry rules are unchanged. Open a compact in-place cost preview, defaulted to the current feed; show brand names and the maximum credits before the separate cost-labelled confirmation. Keep free background reads, manual collection, existing caps/reservations and no-retry behavior. Budget/history and diagnostics use progressive disclosure in Collection tools. Do not imply a full-feed availability refresh or display a collection action on a hosted domain. This replaces the 23 October banner/reminder presentation, not its manual-spending policy. Source: the owner's feedback that the page was overkill and request for Claude/design input; the Claude review is retained privately, with recommendations assessed against inspected code.

References: [refresh controls](refresh-and-feedback.md), [worker operations](release.md#background-collection), and `lib/server/refresh-control.mjs`. The worker recovery section in the newer release notes supersedes the older refresh document's claim that recovery is unimplemented.

## Engineering and memory

**22 October — approved memory policy.** Shared rules and decisions live in Git; personal and operational details stay in ignored `.context/`. Agents update memory as they work and before handoff. Keep secrets out of both. Do not copy private transcripts into public docs.

Use the current checkout as the source of work, preserve preferences/exports/history, keep local URLs on explicit `127.0.0.1`, and follow the machine-routing guard in [AGENTS.md](../AGENTS.md#machine-routing-safety). Preserve Next.js's generated agent guidance and read installed version-specific guides before application code changes.

When a choice changes, date the replacement and mark the prior choice superseded. A code implementation is not proof of a live service, a historical test result is not a fresh test run, and a recommendation is not user approval.
