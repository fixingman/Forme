# Working on FORME

## Start here

1. Read [project state](docs/project-state.md) for current architecture, unfinished work and verification boundaries.
2. Read [decisions](docs/decisions.md) before changing product behavior, data policy or architecture.
3. If present, read `.context/private-memory.md` for this machine's private handoff. It is optional, ignored by Git, and unavailable in fresh clones. Never require it to understand shared project rules.
4. Check the current branch, working tree and relevant code. Memory and older feature docs are context, not proof that a service is deployed or a test passes today.

## Working rules

- Work in the current checkout. Do not edit or mirror historical copies of the app. Do not rename the branch unless asked; use `origin/main` as the comparison/PR base.
- Preserve existing preferences, saved listing copies, settings exports, source identities and observation history. Keep migrations and imports compatible or explicitly plan their transition.
- Keep provider credentials and the Supabase service-role key server-side and on the owner's computer. Never copy credentials, cookies, tokens or private settings into docs, fixtures, logs or commits. Supabase's public URL/publishable key are a separate category; see [accounts setup](docs/accounts-setup.md).
- Browsing, saving and changing filters must not trigger paid collection or translation. Preview cost before an authorized paid run. Do not increase caps, erase reservations or retry uncertain billable requests without authorization covering that action. A completed historical allowance is not permission for another run.
- Preserve the data-trust rules in [decisions](docs/decisions.md#data-trust). Do not fill missing fields with unsupported claims.
- Reuse the [design standard](docs/design-system.md), shared listing metadata/formatters and UI primitives. Run `npm run check:format:ui` for UI work; `npm run format:ui` applies the pinned formatter. Keep preference ownership in the persistent shell and paid-work guards on the server.
- Use explicit `127.0.0.1` for local URLs and commands, including Codex routing; do not substitute `localhost`.
- For Supabase work, discover and prefer the Supabase MCP tools when available. Codex reads `.codex/config.toml`; Claude Code reads `.mcp.json`. Follow [MCP setup](docs/accounts-setup.md#agent-mcp-connection) for OAuth and session refresh. A config entry alone is not proof of an authenticated connection or a successful tool call; report the actual boundary if tools are unavailable.

## Machine routing safety

Before changing any model provider, base URL, Headroom proxy/wrapper, port, mode, runtime override or Headroom version on this machine, read `~/.headroom/ROUTING-GUARD.md` (the current user's home directory). These settings previously caused malformed HTTP 200 model responses. Do not change them without Can's explicit approval for the exact action. If the guard is unavailable, stop that routing change and ask; unrelated project work can continue.

## Verification

Use Node.js 24+ (`.nvmrc`) and the commands in `package.json`. For application changes, run the relevant checks: `npm run typecheck`, `npm run test:unit`, `npm run build`, and `npm test` for affected browser flows. Local Playwright uses installed Chrome; CI uses bundled Chromium. Tests must use fixtures/mocks and spend no provider credits.

For documentation-only changes, check links, facts, whitespace and secrets; no application build is required. `npm run check:secrets` scans only Git-tracked files, so separately scan new/untracked docs with `scanText` from `lib/server/secret-scan.mjs`. Do not stage files merely to scan them.

## Maintain memory

Update memory after meaningful user decisions, completed milestones, discoveries and before handoff:

- Put durable choices and their rationale in `docs/decisions.md`; date them, name their source and distinguish user approval, implementation policy and proposals. Mark superseded choices explicitly.
- Put changing implementation status, remaining work and verification evidence in `docs/project-state.md`. Distinguish code inspected, tests run, historical reports and real-service verification.
- Keep personal preferences, machine paths, live account state and private session references in `.context/private-memory.md`. Date operational observations; never store secret values there.
- Keep shared memory concise and link the detailed feature docs. Do not append chat transcripts or duplicate the roadmap. New user instructions control intent; inspected code establishes what exists. Record conflicts rather than silently treating a proposal or old report as current truth.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
