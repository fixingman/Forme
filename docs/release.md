# Release basics

Reviewed 24 October 2026. These are operational procedures, not evidence that a service is healthy or deployed today. Supabase has dated live verification; hosted web deployment, monitoring and offsite recovery remain pending. See [current state](project-state.md).

## Environments

| Environment | What it is today | Data |
|---|---|---|
| Local | `npm run dev`, with `.env.local`, `.forme-data/` and `public/data/vinted.json` | Real, collected with your own provider key |
| CI | GitHub Actions on every pull request and push to `main` | Fixtures only; no provider key, no network collection |
| Staging / production | No verified web deployment | Supabase reads/auth exist; deployment and phone validation remain |

A configured hosted build can use Supabase authentication, profiles and published listings. Collection APIs remain unavailable there: hosted browsing is not a staging collector.

## Continuous integration

`.github/workflows/ci.yml` runs: secret scan, UI format check, typecheck, unit tests, production build, Playwright (bundled Chromium). Rehearsed locally on 21 Oct 2026 for everything except the Playwright step, which needs a Chromium download matching Playwright 1.64 that was not installed on that machine. Dependabot proposes npm updates weekly and Actions updates monthly.

Local equivalents: `npm run check:secrets`, `npm run check:format:ui`, `npm run typecheck`, `npm run test:unit`, `npm run build`, `npm test`.

## Backups and restore

```sh
npm run backup               # snapshot + verify into .forme-backups/<timestamp>/
npm run backup -- --keep 14  # also prune to the newest 14 (pre-restore copies are never pruned)
npm run backup:drill         # backup, restore into a scratch directory, compare; leaves real data untouched
npm run restore -- .forme-backups/<timestamp> --yes
```

A backup holds consistent copies of every SQLite database (`VACUUM INTO`, safe while the app runs), the JSON state in `.forme-data/`, and the listing snapshot, with a SHA-256 manifest and per-table row counts. It never includes `.env*`. Restore verifies checksums and `PRAGMA integrity_check` first, refuses while a collection is locked or a refresh is queued/running, and copies the current state to `.forme-backups/pre-restore-<timestamp>/` before replacing anything.

Drill result on the real local data (21 Oct 2026): 12 files restored, all checksums and row counts matched. Repeat the drill before any migration, and monthly once real users exist. Backups live on the same disk, so copy `.forme-backups/` somewhere else (another disk or encrypted cloud storage) to survive a lost machine.

## Background collection

Starting a refresh now reserves its budget and returns immediately; a worker runs it. The API starts one in-process, and `npm run worker` runs a standalone one that survives page and server restarts. A run whose worker stops heartbeating for five minutes is marked `interrupted`: its reservation stays counted, some searches may have been charged, and nothing is retried automatically. Preview a new plan to continue. Only one worker holds the collection lock at a time.

## Monitoring

- `GET /api/health` returns `ok`, `degraded` or `down` (HTTP 503 only for `down`) with database, queue, collection freshness, backup age and provider presence. It contains no paths, keys or listing content. It is readable from this computer, or from a monitor sending `Authorization: Bearer $HEALTH_TOKEN`.
- Degraded means: a worker stalled, a refresh failed or was interrupted in the last 24 hours, the collection is older than 48 hours, or there is no backup newer than 7 days.
- Logs are one JSON object per line with sensitive fields redacted (`lib/server/log.mjs`).
- Point an uptime monitor at `/api/health` and alert on non-200 and on `degraded` for more than an hour.

## Secrets

- Provider keys are read only on the server from environment variables. Locally they live in `.env.local` (git-ignored). `npm run env:check` reports which are set, never their values, and fails on unsafe setups (for example a secret with a `NEXT_PUBLIC_` prefix, which would ship it to every browser).
- `npm run check:secrets` (also in CI) scans tracked files for provider keys and private keys and prints file and line only.
- In any hosted environment set secrets in the host's encrypted environment settings, never in the repository, and use separate keys per environment.
- Hosted environments must not hold owner-only keys: `npm run env:check` errors if `SUPABASE_SERVICE_ROLE_KEY` or a provider key is set where `VERCEL`/`NETLIFY`/`FORME_REQUIRE_AUTH` is present. See [accounts setup](accounts-setup.md).
- **Rotate the Bright Data and ScrapeBadger keys that were pasted into the original Codex chat.** They remain exposed in that transcript regardless of this repository being clean. The repository and its git history contain neither.

Rotation steps: create the new key at the provider, update `.env.local` (or the host's secret), run `npm run env:check`, run a free account call or a 1-search preview to confirm, then revoke the old key.

## Release checklist

1. `main` is green in CI.
2. `npm run backup:drill` passes and `npm run backup` has run within the last day.
3. `npm run env:check` passes in the target environment.
4. Deploy; open `/api/health`; confirm `ok` or an explained `degraded`.
5. Roll back by redeploying the previous build (or `git revert` and redeploy). If data changed, restore the pre-release backup with `npm run restore`.

## Still needs accounts or a decision

- **Hosted web deployment and real-device checks** of the implemented Supabase auth/profile/listing paths. The collection budget remains local and per-machine; it is not a shared account balance.
- **A durable job runner** for hosted collection (the queue/lease/recovery logic here is storage-agnostic in design but implemented on SQLite).
- **A secrets manager and an external monitor/error tracker** wired to `/api/health` and the JSON logs.
- **Offsite backup storage.**
- **Provider terms** for caching and redisplaying marketplace listings and photos before a wider release.
