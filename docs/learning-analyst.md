# Advisory learning analyst

Implemented locally, 25 October 2026. Open **Collection tools → Learning and evaluation → Recommendation analysis**. The owner chose to **leave the provider unconfigured**. Preparing evidence, exporting it, importing a report and tracking a comparison work without an API key. No live provider request was used to verify this feature.

## Purpose and loop

The analyst explains development failures and proposes bounded investigations. The owner's votes remain the taste reference. An LLM cannot create votes, choose a winner, edit code, change model settings, collect listings or activate an engine. Its confidence is an author's opinion, not a statistical measure.

Activation is a return to the [learning loop](learning-loop.md#the-loop-continues-after-review): the selected version supplies future rankings, those rankings receive new feedback, and later candidates are evaluated again. Keeping Current also returns to that loop. An analyst report is one input to review, never the final evaluator.

## Without a provider

1. Sync pending feedback and train the next local candidates through the existing learning controls.
2. Choose Shopping or Private preview, then **Prepare evidence**. This freezes a development packet and makes no external request.
3. Review or download the packet. It includes instructions, the response schema and a JSON template. Using it with an external assistant is a separate, deliberate data transfer; FORME does not upload the download automatically.
4. Paste the returned JSON into **Import analyst report**. Imports are labelled as having unverified model origin. They must match the packet hash, schema and existing evidence IDs; this validates structure and references, not the truth of the explanation.
5. Review the cited facts. An existing River/Gorse comparison can be tracked explicitly. Feature or data changes remain drafts requiring reviewed implementation. Tracking neither trains nor activates an engine.

An empty development packet can be inspected/exported, but the optional API path requires at least two current judgments from a trained snapshot. Sparse evidence should lead to more judgments rather than a claim of improvement.

## Evidence boundary

The packet uses current canonical judgments already represented in the latest reason-aware trained snapshot for that channel. Corrected or withdrawn training labels are excluded. Later validation answers are excluded. Development reason counts provide context without treating price, data, material, colour or unknown motives as broad taste negatives.

The external projection contains aggregate counts, coverage modes, up to 24 balanced examples, anonymous pool aliases, available pre-vote ranks and up to ten inferred text-trait groups. It omits owner/account IDs, source/listing IDs, brands, raw titles, links, images and observation timestamps. Traits are inference, not verified garment facts. Local private history retains the mapping needed for audit; the downloadable analyst packet does not contain that mapping.

After feedback, candidate training or model selection changes, old reports are labelled historical and cannot start a new tracked comparison. Tracking records both the current event ordinal and prediction ordinal. Its metrics count only predictions created after that boundary and judgments delivered later, using the existing evidence gate. An old benchmark cannot become fresh validation merely by asking an LLM to explain it. Sampling, exposure and position bias still limit conclusions.

## Optional API configuration

There is no default provider, model, price or budget. Future configuration requires an explicit owner choice and server-side values from `.env.example`:

```dotenv
FORME_ANALYSIS_PROVIDER=
FORME_ANALYSIS_MODEL=
FORME_ANALYSIS_API_KEY=
FORME_ANALYSIS_INPUT_USD_PER_MILLION=
FORME_ANALYSIS_OUTPUT_USD_PER_MILLION=
FORME_ANALYSIS_MAX_RUN_USD=
FORME_ANALYSIS_DAILY_USD_LIMIT=
```

Only `openai` and `anthropic` adapters exist, using their fixed official endpoints and JSON-schema outputs. The chosen model must support the corresponding structured-output interface. No credentials belong in chat, exports, client bundles or Git. These dedicated app variables do not inherit Codex/Claude credentials, global base URLs or machine-routing overrides. Configuring an app provider does not authorize changing machine routing; the [routing guard](../AGENTS.md#machine-routing-safety) still applies.

With a configured provider, preparation quotes a conservative input-token bound from request bytes plus overhead, a maximum of 1,800 output tokens and the manually configured USD rates. This is not a provider balance check or a guarantee against incorrect rates, taxes or changed billing. Before each request, the owner reviews the exact packet, provider/model and cost estimate, then explicitly consents to data transfer and spend. Configuration or evidence changes invalidate that preview.

The server reserves the full estimate before sending, enforces per-run and UTC-day owner-local limits, and permits one attempt per packet. It uses a single request with a 30-second timeout, no redirects, no tools and no retry. Failure, refusal, incomplete output or an uncertain response retains the reservation. Successful calls also retain their conservative reservation. Reopening the page does not send again; a new deliberate run requires a new packet and available budget. This ledger is local, not a provider-wide spending limit.

## Storage and removal

The owner-only, local-computer API is `/api/learning-analysis`; mutations require same-origin JSON. Packets, reports and comparisons live in `.forme-data/learning-analysis.sqlite` (or the isolated `FORME_DATA_DIR`). Hosted training/analysis is unavailable; signed-in journal access still depends on the unapplied hosted learning migration.

**Download private learning history** includes analyst artifacts. Existing backup tooling includes this SQLite file. **Delete learning history** removes this owner's analyst packets, reports and comparisons together with the learning journal; it is blocked while a provider request is running. Minimal billing reservations remain, so privacy deletion cannot reset a spending limit. Previously downloaded files and independent backups remain separate copies.

## Verification and API references

Unit tests cover evidence projection, corrections, schema/citation rejection, stale reports, future-only comparison metrics, exact consent, owner isolation, concurrent reservations and uncertain billing. Provider tests use mocked HTTP responses. Browser tests cover export/import, history, tracked proposals, explicit request approval and API access boundaries. No real model's analysis quality or live API compatibility is established by those checks.

The adapters follow the official [OpenAI structured-output guide](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses) and [Anthropic structured-output guide](https://platform.claude.com/docs/en/build-with-claude/structured-outputs). Provider/model choice and a live, explicitly approved smoke test remain future work.
