# FORME project state

Reviewed 24 October 2026 against the current working tree. This is the current handoff; dated milestones and earlier check results are retained in the [implementation log](history/implementation-log.md). Repository implementation is distinct from real-service or deployment verification.

Read [working rules](../AGENTS.md), [decisions](decisions.md) and the [design standard](design-system.md) before changing behavior. Optional private machine notes live in ignored `.context/private-memory.md`; a fresh clone does not require them.

## Current implementation

| Area | Implemented | Boundary |
|---|---|---|
| Shopping | Desktop/mobile Home, Following, Discover, saved searches/items, onboarding and global department/size preferences | Home shows personal arrivals/observed changes; Discover excludes followed brands and uses explainable taste rules. Filters never weaken to fill a feed. |
| Feedback | Piece-level Not for me throughout shopping; separate explicit brand exclusion; Undo and later restoration | Saved IDs/copies are preserved. Hidden saved pieces pause positive taste signals. |
| Preferences | `forme-v2` browser state, v1 migration, versioned JSON exports/retained saves, optional Supabase profile sync | The persistent shell owns preferences. UI refactoring adds no competing store or export migration. |
| Listings | Local SQLite observations/history and sanitized JSON fallback; owner-published Supabase snapshot reads | Observation times/provenance remain intact. Hosted snapshot reads do not replace local collection/history. |
| Accounts | Passwordless email-link routes, invite/owner checks, RLS and revision-protected profile sync | Google exists as an optional path but is disabled by owner choice. Real two-device sync and hosted web deployment remain unverified. |
| Collection | Free quotes, explicit paid confirmation, configurable daily cap/off mode, reservations/checkpoints, local worker/heartbeat/interruption handling, saved-item availability checks | Local owner-only work; no scheduling, automatic uncertain-billing retry, hosted collector or shared account spending ledger. |
| Recommendations | Existing production rules plus private Current/River/Gorse comparison with actual local adapters, frozen pools/feedback, blind reveal and preview-only choices | Preview is loopback/owner-only. It reranks a common eligible pool; it is not a production engine selection or proof of relevance superiority. FashionCLIP remains deferred. |
| Operations | CI configuration, secret/env checks, health API, redacted logs, local backup/restore drill | Current runtime health, latest GitHub CI, hosted monitoring and offsite recovery require separate verification. |

Details: [core experience](core-experience.md), [account setup](accounts-setup.md), [collection/feedback](refresh-and-feedback.md), [data trust](data-trust.md), [data quality](data-quality.md), [ranking preview](ranking-preview.md), [evaluation](recommendation-evaluation.md) and [release operations](release.md).

## Code and design ownership

- `app/` owns route/API/auth boundaries. The persistent app layout keeps `components/forme.tsx` mounted across navigation.
- `forme.tsx` coordinates preferences, migration/sync, source selection and actions. Named page views live in `components/pages/`; navigation lives in `components/layout/app-shell.tsx`; preference dialog content is separate.
- `components/listings/` owns feed context, cards, incremental windows, rails and shared metadata. `components/ui/` owns the dialog, page header, empty state and listing skeleton.
- `lib/domain/` holds framework-free data/ranking/spending/presentation rules. `lib/server/` and `lib/supabase/` own persistence, jobs and account clients.
- The existing semantic colors and shared spacing/control tokens remain in `app/globals.css`. Shared price/date/condition/size rules live in `lib/domain/presentation.mjs`. Normal cards and preview cards reuse listing metadata while keeping their actions distinct.
- UI sources are readable and formatted with pinned Prettier via `npm run format:ui` / `npm run check:format:ui`. See the design standard for interaction, accessibility and presentation rules.

24 October consolidation fixes the expanded-feed regression discovered during review: feedback no longer resets revealed depth to 24. Route/query/global-filter combinations retain separate tab-local in-memory windows; item-page return restores depth and position. Background reads preserve expanded depth. Reloading starts fresh. This UI cache contains no persisted preferences or listing payloads. The earlier straight-scroll tests did not cover this regression; dedicated deep-feedback/Back/background checks now do.

## Account and data behavior to preserve

LocalStorage remains the working preference copy. An empty account receives the initial browser profile; an existing profile can win on another device while preserving the displaced browser copy under `forme-v2-before-sync`. Revision conflicts adopt the newer account copy with a notice. Sidebar and Demo/Vinted choices remain per device. Keep these semantics and retained saved copies compatible; see [sync behavior](accounts-setup.md#what-happens-to-what-you-already-have).

Supabase configuration enables accounts; `FORME_REQUIRE_AUTH=1` enforces local sign-in. Hosted access requires authentication. Proxy session checks do not replace the invite/RLS boundary. Collection and publishing stay on the owner's computer with server-only keys. `npm run publish` is an external mutation, not a read-only verification step.

Dated real-service evidence from 22–23 October includes invited email-link sign-in, uninvited denial, a successful account profile save, Supabase schema/access checks and validated listing publication/owner reads with anonymous denial. Listing observation history was preserved locally during the authorized transfer. These are past observations, not fresh health or balance checks. No hosted web deployment or successful two-device session is established by that evidence.

## Verification

24 October consolidation verification: typecheck, the isolated Node 24 production build, all 170 unit tests and all 136 browser tests passed. New checks cover decimal-preserving prices, conservative missing metadata, minute-precision dates, deep-feed feedback/item-page Back on desktop and phone, and background-update continuity. UI formatting, tracked/untracked secret scanning and relative documentation links also passed. Desktop and 390px phone screenshots were visually checked with no horizontal overflow and no numeric Undo counter. Browser/build verification used an isolated source-only copy and fixtures, without credentials or real storage. These results do not establish hosted deployment or two-device behavior. Earlier dated checks remain in the implementation log; do not repeat their counts as new results.

Useful commands: `npm run typecheck`, `npm run test:unit`, `npm run build`, `npm test`, `npm run check:format:ui`, `npm run check:secrets`. The secret checker scans only tracked files; separately scan new files with `scanText` as described in AGENTS.md. Never use collection, translation, publishing or restore as a routine verification shortcut.

## Remaining work

The owner prioritised reason-aware feedback and a reliable self-improvement loop. A [draft learning/evaluation plan](recommendation-learning-plan.md) now distinguishes taste, affordability and data-quality feedback; proposes a durable event/exposure ledger, pre-feedback prediction evaluation and controlled Current/River/Gorse comparisons. It is a planning artifact, not implemented reason capture, continuous training, LLM judging or a live engine switch.

**24 October follow-up review — confirmed sync edge case, not yet fixed:** if another local edit is made while a profile PUT is pending and its debounce expires before that PUT finishes, the busy guard drops the follow-up push. The earlier success then clears the dirty marker even though the newest browser state was not uploaded. An isolated delayed-response browser probe reproduced different local/remote follows with `dirty=false`. Preserve/requeue changes made during a save and verify rapid edits/slow-network behavior before relying on the saved indicator. This case was outside the preceding passing suite.

1. Verify hosted web deployment, phone sign-in and real desktop/phone preference/save sync, including first-sync preservation, offline reconciliation and revision conflicts. Existing Supabase code/setup must not be described as wholly unimplemented.
2. Confirm reliable email delivery, deployed redirect URLs, release CI and runtime health. The owner reported Resend SMTP working locally; a hosted email-link round trip still needs verification.
3. Improve measured data quality and relevance: department/category/size coverage, verified brand IDs, title language handling, availability observations and a larger representative recommendation evaluation. The small private study does not justify replacing Current.
4. Finish hosted monitoring, staging and offsite restore-tested backup arrangements. Hosted collection/shared quota needs a later explicit design decision; it is not a prerequisite to retaining manual owner-side collection.
5. Keep deferred rarity scoring, digest delivery and additional marketplace adapters outside core navigation until supported. Provider caching/redisplay terms remain an open item before wider distribution.

Missing exact-title cache entries currently mark titles translation-pending even when the original is already English. Cached translation/condition mappings are free reads; Google is called only by an explicitly authorized `--google` run. Do not imply all translation operations necessarily incur a charge.

## Historical guidance and handoff

README is the entry point, this file is current status, decisions records durable choices, and feature guides own detailed behavior. Older phase/roadmap documents are explicitly historical; their “no auth/sync” and per-feed filter descriptions are superseded. Keep archived operational counts and past spending permissions out of current setup guidance.

For Supabase agent work, use the matching `.codex/config.toml` / `.mcp.json` entries and [MCP connection guide](accounts-setup.md#agent-mcp-connection). Configuration alone is not proof of authenticated tool access; dated successful calls do not prove tools are available in every new session.

Update current status and evidence after meaningful milestones. Put durable choices in decisions, dated history in the implementation log, and personal/machine/live account details in private memory. Preserve unresolved boundaries rather than converting old reports into current facts.
