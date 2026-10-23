# FORME project state

Last reviewed: 22 October 2026, against commit `dd83747` plus the badge/translation audit notes. This page summarizes inspected code and dated reports; it does not certify a deployment or current runtime health.

## Read first

Read [agent working rules](../AGENTS.md) and [durable decisions](decisions.md). Use [accounts setup](accounts-setup.md) for the current beta implementation and [release operations](release.md) for local jobs, backups and health. Optional private notes are in ignored `.context/private-memory.md`; shared work must not depend on that file.

## Architecture and implemented milestones

| Area | What exists in the repository | Verification boundary |
|---|---|---|
| App | Next.js 16 / React 19, TypeScript, mobile/desktop shopping shell, onboarding, saved searches, saves/dismissals and global department/size preferences | [Core experience](core-experience.md) describes the local flows; no fresh UI test was run for this memory update. |
| Preferences | `forme-v2` localStorage, same-origin v1 migration, versioned settings backups and retained saved listings; optional Supabase account sync | Sync code is present, not verified against a real Supabase project in this handoff. |
| Local listings/history | SQLite under `.forme-data/` and sanitized `public/data/vinted.json` fallback; source observations, first-seen and price history | Files are ignored and not supplied by a fresh clone. Missing live data is explicit; demo is a deliberate choice. |
| Accounts and hosted reads | Passwordless auth routes, session proxy, invite checks, profile API/sync, RLS migration, hosted listing reads and an owner-side publish command | Commit `2088962`; [setup notes](accounts-setup.md) report stand-in auth tests and Postgres-engine policy tests, not live Supabase verification. |
| Collection | Free plans, explicit capped runs, SQLite queue/reservations, local lock, worker/heartbeat, checkpoints and interruption recovery; saved-item availability checks | Collection remains local. No hosted queue, remote collection trigger or distributed quota is implemented. |
| Data quality | Shared validation, provenance, conservative departments/sizes, cached English titles, evidence-labelled style inference and separate collectible signals | Coverage is incomplete. Historical percentages and listing counts in feature docs are dated samples, not current metrics. |
| Operations | CI/Dependabot configuration, health API, redacted logs, environment/secret checks, backup/restore and a restore drill | Tooling exists. Current GitHub CI results, runtime health and offsite recovery were not checked for this update. |

Code layout: `app/` has routes and API handlers; `components/` has UI; `lib/domain/` has framework-free rules; `lib/server/` has persistence, auth and jobs; `lib/supabase/` has the server client; `supabase/migrations/` has database policy/schema. Scripts are grouped under `scripts/data/`, `scripts/ops/` and `scripts/probes/`; tests under `tests/unit/` and `tests/e2e/`.

## Account behavior to carry forward

Supabase configuration enables the account path; ordinary loopback development can continue without enforced login. `FORME_REQUIRE_AUTH=1` enables local enforcement. Inspect `lib/server/auth-policy.mjs` and `lib/server/session.ts` before changing access behavior; the proxy is only an initial session gate, not the invite authorization boundary.

LocalStorage remains the working preference copy. An empty account receives the initial browser profile; an existing account profile can win on another device, preserving the displaced browser copy in `forme-v2-before-sync`. Revision conflicts adopt the newer account profile with a notice. Foreground/network reconciliation picks up changes; sidebar and data-mode choices remain per device. See [the setup guide](accounts-setup.md#what-happens-to-what-you-already-have) for recovery behavior.

Hosted listings are a published snapshot, not a hosted replacement for the collection worker or complete local price-history database. `npm run publish` writes validated listings using the owner's local service-role key. Publishing is an external mutation; it is not a verification command for documentation work.

## Next work and unresolved choices

Audit findings, 22 October: card `isNew` currently requires a post-baseline listing first seen on the browser's current calendar day, while Home arrivals use a rolling seven-day window. SQLite derives `newlyCollected`; the JSON fallback and owner publishing path do not reconstruct it when absent. Align these paths and the intended badge window before treating badge absence as proof that a listing is old. A temporary-database check reproduced the day-window mismatch and missing-flag behavior; the 13 targeted home-activity, normalization and data-trust tests passed.

Translation-pending currently means an exact-title cache entry is missing, even for already-English text; no language check is made. Cached titles and condition mappings require no translation request. Google is contacted only by the explicit `--google` command, separately from collection; whether a request incurs a charge depends on account usage/allowance, so do not describe all translation runs as necessarily paid.

0. **22–23 October, real-service evidence:** `npm run auth:check` against the live project passed (migration applied, tables and `save_profile` refused to signed-out callers, email enabled, public sign-up turned off after it first reported ON). The owner reported a successful email-link sign-in on `http://127.0.0.1:3000` with sign-in enforced, after adding the invite row; an uninvited state was also seen and correctly signed out. Not yet verified: Supabase's built-in email delivery was unreliable during testing (custom SMTP or Google is the likely fix), phone sign-in, profile sync between two real devices, hosted listings and any Vercel deployment.
1. Finish account delivery/setup: make email delivery dependable, review production redirect URLs and the cross-device email template, or configure optional Google sign-in. Migration, signup restrictions and the owner's invitation have evidence above; do not repeat them as wholly unstarted work.
2. Validate phone sign-in, real-device preference/save sync, signed-in row isolation, first-sync preservation and revision conflicts. Local email-link sign-in and an uninvited denial were reported working; two-device behavior remains unverified.
3. Confirm hosting and provision the app only within the requested deployment scope. Vercel is documented; no live deployment is established by this memory. Keep collection and private keys on the owner's computer and publish deliberately.
4. Reconcile data-quality gaps: department/category/size coverage, verified brand IDs, untranslated new titles, availability checks and measured recommendation relevance. Do not manufacture missing evidence to fill gaps.
5. Finish hosted release operations: green CI for the latest release, staging/monitoring, managed secrets and offsite restore-tested backups. On 23 October, GitHub showed successful main app CI for `39f3441` ([run](https://github.com/fixingman/Forme/actions/runs/39682318034)); newer dependency-update branches had mixed results, including a Playwright failure. A shared spending ledger/durable hosted collector is later work requiring an explicit design choice.

Other deferred features: scheduled digest delivery, validated live rarity scoring, learned style recommendations, and additional marketplace adapters. There is no requirement to expand to friends for the initial beta. Provider caching/redisplay terms remain an open item before wider distribution.

## Historical documentation and checks

The [production roadmap](production-roadmap.md) and [core experience notes](core-experience.md) predate the account commit: their statements that auth/sync do not exist are historical. The [accounts setup](accounts-setup.md) and inspected code describe the newer implementation. Older README passages also describe earlier snapshots and collection counts; do not use them as live metrics.

For operations and data behavior, use [release notes](release.md), [data trust](data-trust.md), [data quality](data-quality.md) and [refresh controls](refresh-and-feedback.md). The older refresh document says crash recovery is absent; `lib/server/refresh-control.mjs` and the newer release notes show heartbeat-based interruption recovery. Preserve reservations and no-retry behavior.

The attached historical session reports passing builds, typechecks, unit/browser suites and a successful local restore drill. Those results predate this memory update and some predate the account commit. Test counts are not an acceptance contract. Initial memory creation checked documentation links, referenced commands, whitespace, secrets and private-file exclusion. The subsequent badge/translation audit ran the targeted checks described above; it made no application changes, paid provider calls or cloud setup.

Useful commands: `npm run typecheck`, `npm run test:unit`, `npm run build`, `npm test`, and `npm run check:secrets`. See [AGENTS.md](../AGENTS.md#verification) for when to run them and the untracked-file scan caveat. Never use collection, translation, publishing or restore as a routine verification shortcut.

## Handoff maintenance

Update the review date and code baseline after meaningful changes. Replace completed next steps with their actual outcome and evidence, retaining limitations. Keep durable choices in [decisions](decisions.md), private observations in local notes, and detailed operational instructions in their owning docs. Record a newly discovered disagreement between memory and code before relying on either.
