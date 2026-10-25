# FORME project state

Reviewed 25 October 2026 against the current working tree. This is the current handoff; dated milestones and earlier check results are retained in the [implementation log](history/implementation-log.md). Repository implementation is distinct from real-service or deployment verification.

Read [working rules](../AGENTS.md), [decisions](decisions.md) and the [design standard](design-system.md) before changing behavior. Optional private machine notes live in ignored `.context/private-memory.md`; a fresh clone does not require them.

## Current implementation

| Area | Implemented | Boundary |
|---|---|---|
| Shopping | Desktop/mobile Home, Following, Discover, saved searches/items, onboarding and global department/size preferences | Home shows personal arrivals/observed changes; Discover excludes followed brands and uses explainable taste rules. Filters never weaken to fill a feed. |
| Feedback | Immediate piece hide, optional style/price/data reasons, later editing, Undo/Restore; durable owner event outbox/journal | Save/export compatibility remains. Legacy reasons are not invented; hosted journal migration awaits application. |
| Preferences | `forme-v2` browser state, v1 migration, versioned JSON exports/retained saves, optional Supabase profile sync | The persistent shell owns preferences. UI refactoring adds no competing store or export migration. |
| Listings | Local SQLite observations/history and sanitized JSON fallback; owner-published Supabase snapshot reads | Observation times/provenance remain intact. Hosted snapshot reads do not replace local collection/history. |
| Accounts | Passwordless email-link routes, invite/owner checks, RLS and revision-protected profile sync | Google exists as an optional path but is disabled by owner choice. The existing Vercel endpoint responds and enforces signed-out access; the new release and real two-device sync still need verification. |
| Collection | Free quotes, explicit paid confirmation, configurable daily cap/off mode, reservations/checkpoints, local worker/heartbeat/interruption handling, saved-item availability checks | Local owner-only work; no scheduling, automatic uncertain-billing retry, hosted collector or shared account spending ledger. |
| Recommendations | Current default plus reason-aware River, conservative River and Gorse; frozen pre-vote predictions, per-channel forward reports, owner-controlled pinned activation/rollback | Training/selection are owner-computer work. No engine activated; sparse evidence is not a winner. Existing legacy blind preview remains separate. FashionCLIP and affordability learning are deferred. |
| Advisory analysis | Development-only evidence export, validated report import/history, optional structured-output adapters, explicit future-comparison tracking | Provider deliberately unconfigured. No live LLM calls or model analysis quality verified; no automatic activation/code changes. |
| Operations | CI configuration, secret/env checks, health API, redacted logs, local backup/restore drill | Current runtime health, latest GitHub CI, hosted monitoring and offsite recovery require separate verification. |

Details: [core experience](core-experience.md), [account setup](accounts-setup.md), [collection/feedback](refresh-and-feedback.md), [data trust](data-trust.md), [data quality](data-quality.md), [ranking preview](ranking-preview.md), [learning loop](learning-loop.md), [advisory analyst](learning-analyst.md), [evaluation](recommendation-evaluation.md) and [release operations](release.md).

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

25 October learning-loop verification: typecheck, UI formatting, the isolated Node 24 production build, all 206 unit tests and the pinned adapter suite passed. PGlite executed the actual new migration and tested owner isolation, idempotency, selection revisions and deletion. An isolated native HTTP/browser run exercised River, conservative River and Gorse on fixture feedback; all three returned learned coverage, preview reasons reached the journal, Current stayed selected and the 390px view had no horizontal overflow. The current-copy full browser run passed 184 of 185 cases; its remaining offline-save test had a fixture timing race. After synchronizing the outage/debounce gates, the final targeted run passed all 24 account-queue, hidden-piece and learning browser checks on the latest production build. There are no unresolved application-check failures from this work. No real account writes, provider credits or engine activation were involved. Supabase migration application and real cross-device learning remain unverified.

25 October broader-feed verification: new category rules (tests/unit/classification.test.mjs) and the brand-ID lookup (tests/unit/brand-lookup.test.mjs, provider stubbed, including cap, billing, HTTP and network failure paths) pass; the brand lookup then ran once against the real provider on 25 October (20 of 20 brands resolved, 60 credits, owner-approved). Category coverage measured 71.6% → 84% on the local snapshot.

25 October hidden-list verification: `hiddenAt`, reason filter and Show more are covered by unit tests (reason buckets, ISO validation, normalizer) and by browser tests that were repeated three times for stability. Code inspected and tests run; not verified against the real Supabase service. The date is stored but not shown.

25 October reasons verification: after adding Not the right material / colour, typecheck, UI formatting, the production build, all 219 unit tests and all 192 browser tests passed. Browser tests stub the learning API, and Playwright now uses an isolated `FORME_DATA_DIR`, so test runs no longer write to the real learning journal (it stayed at 84 rows). Not verified against the real service. Hidden-piece retention is an open owner decision.

25 October advisory-analyst verification: typecheck, UI formatting, the isolated Node 24 production build, all 232 unit tests, all 203 browser tests and the pinned recommendation-adapter checks passed. Checks cover development-only projection, corrected labels, packet/citation validation, unconfigured export/import, stale reports, future-only experiment boundaries, explicit transfer/cost consent, owner access and retained uncertain-billing reservations. Build/browser sources matched the current `app/`, `components/` and `lib/` trees. Provider HTTP calls were mocked; no real LLM calls, credentials, paid collection, engine activation or routing changes were involved. Desktop/390px screenshots used fixtures. Real provider/model compatibility and analysis quality remain unverified by owner choice.

25 October learning UX cleanup: the page now groups the active ranking and feedback task, separates history management, and uses the shared heading/body scale with explicit spacing. **Recommendation analysis** replaces the cramped inline analyst heading; provider status, Prepare → Review → Test steps, evidence and report actions have separate hierarchy. Technical explanations use disclosures. Typecheck, UI formatting, the isolated production build, 240 unit tests and 10 affected learning/analyst browser cases passed. Fixture screenshots cover desktop and 390px; keyboard disclosure behavior and 375px overflow were checked. The provider remains unconfigured; no paid requests or ranking-policy changes were involved. These checks do not re-verify unrelated concurrent collection changes.

25 October release preflight: the existing repository homepage (`https://forme-kohl.vercel.app`) responds on Vercel, redirects signed-out page requests to login, and returns 401 for signed-out listing/learning APIs. GitHub reports the existing main deployment successful; that does not verify this newer branch. Read-only live Supabase checks pass for private-beta auth, invites, profiles and listings. Both learning tables return missing-schema responses and still need the learning migration. The local backup/restore drill passed for all four current files; environment checks passed with local sign-in enforcement reported as optional. Dashboard sign-in is required for the next database/deployment checks because this session has no Supabase MCP tools or Vercel CLI login. The release snapshot passed the production build, 251 unit tests, all 203 browser tests and the pinned adapter suite, with fixtures and no provider credits. GitHub rejected PR creation with the current integration token, so the authorized merge uses a fast-forward push. `vercel.json` temporarily holds automatic `main` deployments until the missing learning schema is ready; remove that hold before the production release.

Useful commands: `npm run typecheck`, `npm run test:unit`, `npm run build`, `npm test`, `npm run check:format:ui`, `npm run check:secrets`. The secret checker scans only tracked files; separately scan new files with `scanText` as described in AGENTS.md. Never use collection, translation, publishing or restore as a routine verification shortcut.

## Remaining work

The owner approved the full reason-aware learning sequence. [Learning and evaluation](learning-loop.md) now includes durable feedback delivery, optional reasons, frozen evaluation, actual local candidates and deliberate activation/rollback. Current remains selected. The [advisory analyst](learning-analyst.md) is implemented with its provider unconfigured by owner choice. API provider selection/configuration and an explicitly approved live smoke test remain optional future work. Training and evidence preparation make no LLM calls. The new Supabase migration has passed local owner/RLS/idempotency/concurrency checks, but is **not applied or verified on the hosted project** because this session has no Supabase MCP tools. Apply it and test signed-in cross-device feedback before claiming hosted learning is ready.

The earlier in-flight profile-save race is fixed: pending edits are requeued and dirty state only clears after the newest acknowledgement. Preserve the delayed-save/offline regression coverage. This establishes fixture behavior, not real phone sync.

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
