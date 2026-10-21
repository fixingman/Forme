# FORME: local pilot to private beta

Assessment: 21 October 2026. This is a proposed roadmap, not a claim that production deployment has happened. No hosting, accounts, services, paid collection, credential rotation or database migration was performed for this assessment.

## What has been proven

Real provider collection, normalized public listings, explicit cost previews, a local spending cap, grouped sizes, department preferences, saved searches, saved/dismissed signals, transparent recommendation rules and a small reviewed Discover cohort. The app builds and has browser coverage for the main interactions.

## Current production blockers

- Preferences primarily live in localStorage; the local database copy is an explicit checkpoint, not automatic account sync.
- Listings and observations live in local SQLite and JSON files. The server endpoints are deliberately restricted to loopback and disabled on Vercel. Removing those checks would not supply authentication or durable shared storage.
- Refresh jobs are now queued and run by a worker with a lease and heartbeat (21 Oct 2026); interrupted runs are marked and never retried automatically. Storage is still local SQLite and file locks, so the spending ledger is per-machine, not a shared production quota.
- Most initial listings lack department metadata; size/category inference and translation coverage remain incomplete. Only three pilot brands have verified exact provider brand IDs. Source availability and sold status are not routinely checked.
- Daily digest delivery, live rarity classification and learned style recommendations are incomplete. Collection details and experimental previews have been moved to local Collection tools; those tools still need authenticated owner access before deployment. The application remains concentrated in a large client shell.
- There is no complete staging/release/monitoring/restore workflow or measured recommendation-quality baseline with real usage.

## Milestone 1: a deployed personal beta

Use hosted Postgres and authenticated profiles. Migrate shared listings, observations, per-user brands/styles/sizes/departments/searches, saves/dismissals, jobs and budgets into versioned schemas. Preserve source keys and timestamps; migrate existing backups with a visible preview. Make preference sync automatic, with localStorage as a cache, conflict handling and export remaining available.

Start invite-only, even if the only invited user is Can. Keep paid collection and budget changes restricted to an owner/admin role. Protect every server read/write, rather than relying on a local Host check. Keep provider secrets server-side; rotate the credentials previously shared in chat before a wider release.

Acceptance: preferences and saves survive a browser change and appear on phone and desktop; sign-out removes access; another account cannot read the user's preferences; migrations and a database restore have been exercised. Do not require a live Vinted login or browser-cookie import to complete onboarding.

## Milestone 2: dependable collection and freshness

Run collection in durable background jobs. Use a central transactional reservation ledger, concurrency limits, deduplicated shared queries, per-provider adapters and bounded translation work. Retain checkpoints across deployments and expose clear last-success/staleness information. A lost response to a billable provider call must stay uncertain rather than being retried blindly; a queue alone does not make external billing exactly once.

Improve verified brand/category/size reference coverage. Separate provider labels, search scope, inference and unknown data. Validate how sold/deleted listings can be checked within the budget; absence from one limited search is not proof of sale. Validate provider terms for caching and redisplaying listings and images before wider distribution. Evaluate provider fallback using quality and cost measurements rather than adding services automatically.

Acceptance: closing the browser does not stop a job; restarting a worker does not lose completed checkpoints; repeated clicks cannot duplicate a run; simultaneous jobs cannot oversubscribe the configured budget; stale/unknown availability is represented honestly.

## Milestone 3: finish the customer experience

Local core pass completed on 21 October 2026: simplified navigation, first-visit setup, shared card typography, recoverable loading/error/empty states, compact Home, customer-focused Settings and separate local Collection tools. See [core experience notes](core-experience.md). Production authentication, live style classification and measured recommendation quality remain separate work.

Concentrate navigation on the working Home, Discover, Following, Saved Searches and Saved Items flows, with preference settings. Move demo switches, query coverage and collection diagnostics into an owner/admin area. Hide or defer unfinished rarity/digest features until they have a supported purpose. Review onboarding, typography, spacing, empty/loading/error states, accessibility and mobile behavior as one coherent product.

Make the feed distinction visible: Home is recent personal changes, Following is the user's brands, Discover is relevant brands outside those follows. Implement outbound item links and source attribution consistently. Recommendation explanations should describe the actual rule or model used. Advanced ML, additional marketplaces and billing are later scope unless evidence makes them necessary sooner.

Acceptance: a new invited user can set preferences and reach a relevant feed without instructions, and can understand why a recommendation appears and how to change it.

## Milestone 4: release and measure

Status 21 October 2026: CI, dependency updates, tested backup/restore with a drill, a health endpoint, redacted structured logs, environment and secret checks and a release runbook are in the repository ([release basics](release.md)). Hosted staging, an external monitor, a secrets manager and offsite backups still need accounts.

Add version-controlled releases, automated CI, staging, deployment rollback, error/job monitoring, restore-tested backups and managed secrets. Record only the events needed to assess impressions, saves, dismissals and marketplace opens, with clear privacy/retention choices. Keep preference counts distinct from measured rates. Test the costly failure cases as well as ordinary navigation.

Review relevance, gender/size correctness, stale/sold rate, query yield and credits per useful recommendation before expanding collection or inviting more users. Establish explicit target thresholds after the first measured beta rather than inventing success percentages now.

## Suggested architecture

Keep the existing Next.js application. A reasonable small-team deployment is Vercel for the app, managed Postgres and authentication (Supabase is one option), and a durable job runner (Inngest is one option). This is a proposed selection, not a provisioning action or pricing quote.

Vercel's function filesystem is read-only apart from temporary scratch space, so the current working-directory SQLite/filesystem design cannot be deployed unchanged. Supabase documents cookie-based Next.js sessions. Inngest documents saved step results and also warns that an external call is not automatically exactly once.

Primary references: [Vercel runtime filesystem](https://vercel.com/docs/functions/runtimes#file-system-support), [Supabase Next.js auth](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs), [Inngest durable steps and retry limits](https://www.inngest.com/docs/durable-execution/primitives).

Recommended next implementation milestone: hosted database, sign-in and automatic preference sync, preserving the existing data and JSON exports. Product cleanup can proceed alongside that migration; more prototype tabs are not the immediate priority.
