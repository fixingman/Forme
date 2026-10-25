# FORME

Personalized secondhand discovery for desktop and mobile. Home shows recent finds and observed price changes, Following covers your brands, and Discover explores relevant pieces beyond them.

## Start here

- [Project state](docs/project-state.md): what exists, what was verified and what remains.
- [Agent instructions](AGENTS.md) and [decisions](docs/decisions.md): working rules and settled choices.
- [Core experience](docs/core-experience.md) and [design standard](docs/design-system.md): interface behavior and shared presentation.
- [Accounts setup](docs/accounts-setup.md): invite-only Supabase authentication, profile sync and hosted reads.

Optional machine-specific handoff lives in ignored `.context/private-memory.md`. A fresh clone does not need it.

## Run locally

Use Node.js 24+ (`.nvmrc`):

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:3000`. Collection data, private settings and credentials are not included in Git. Without a local or published snapshot the app shows an explicit empty/error state; Demo is a deliberate choice under Settings → Collection tools.

Supabase configuration enables account sync. Enforced local sign-in uses `FORME_REQUIRE_AUTH=1`; hosted access requires authentication. Provider keys and the Supabase service-role key stay on the owner's computer. See the setup guide before configuring an environment.

## Product behavior

- Global My sizes/departments filters apply throughout the shopping feeds.
- Saves retain listing copies; **Not for me** hides a piece and offers Undo. Brand exclusion is a separate explicit action.
- Feeds reveal more existing pieces as you scroll. Browsing, saving and filtering make no paid collection or translation requests.
- Manual refresh opens a free cost quote before a separate explicit paid-run confirmation. Caps, reservations and checkpoints remain in force, including when the daily limit is explicitly off.
- The [learning loop](docs/learning-loop.md) adds optional feedback reasons, durable history, frozen evaluation and owner-approved River/Gorse version selection. Hosted migration application remains pending.
- The [advisory analyst](docs/learning-analyst.md) prepares private development evidence, imports cited reports and tracks future comparisons. Its provider is unconfigured; preparing evidence makes no LLM call.
- The private local [ranking preview](docs/ranking-preview.md) compares Current, River and Gorse. Preview ratings stay separate from account saves; Current remains the default ranker.

## Code layout

| Location | Responsibility |
|---|---|
| `app/` | Routes, API boundaries and authentication gates |
| `components/forme.tsx` | Persistent preferences, feed selection and action orchestration |
| `components/layout/`, `components/pages/` | Navigation shell and page views |
| `components/listings/`, `components/ui/` | Cards, feed windows, metadata, dialogs and shared states |
| `lib/domain/` | Framework-free data, ranking, spending and display rules |
| `lib/server/`, `lib/supabase/` | Persistence, jobs, authentication and server clients |
| `scripts/data/`, `scripts/ops/`, `scripts/lab/` | Explicit collection, operations and isolated recommendation experiments |
| `tests/`, `supabase/migrations/` | Fixture-based verification and versioned schema/policy |

## Development checks

```sh
npm run typecheck
npm run test:unit
npm run build
npm test
npm run check:secrets
npm run check:format:ui
```

`npm run format:ui` formats the UI and shared presentation rules. Local browser tests use installed Chrome; CI uses bundled Chromium. Checks use fixtures/mocks and must spend no provider credits. The secret checker scans tracked files; scan new files separately as described in AGENTS.md.

## Detailed references

[Collection and feedback](docs/refresh-and-feedback.md) · [Data trust](docs/data-trust.md) · [Data quality](docs/data-quality.md) · [Release operations](docs/release.md) · [Recommendation evaluation](docs/recommendation-evaluation.md)

Historical pilot counts, old controls and completed runs are retained in [pilot notes](docs/history/local-pilot.md) and the [implementation log](docs/history/implementation-log.md). They are dated evidence, not current setup instructions or authorization for more spending. Older roadmap/phase documents are explicitly marked historical.
