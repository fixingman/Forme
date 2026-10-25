# Recommendation learning and evaluation plan

Original design, 24 October 2026; implementation update, 25 October. The owner approved implementing the full sequence (“cant we implement all 5?”). The local implementation now covers evidence delivery, optional reasons, frozen evaluation, actual reason-aware candidates and owner-controlled promotion/rollback. Read [the implemented contract](learning-loop.md) for exact behavior and deployment boundaries. The detailed proposals below are design context, not a claim that every future extension is shipped. No external LLM evaluator is implemented or authorized.

## Product objective and current boundary

Help the owner find more pieces they would choose to save at the displayed price, within explicit eligibility rules, while preserving useful variety. Taste, affordability and listing-data problems are different observations. More model activity is not itself evidence of improvement.

At the original 24 October planning baseline, the inspected implementation had production rules, canonical save/hide signals, a private Current/River/Gorse preview, actual pinned adapters, frozen comparison snapshots and an offline evaluation harness. Preview votes remain separate from account preferences. Existing learned adapters flatten saves/hides to binary labels with equal weights; they do not yet understand reasons. The private preview stores current choices, not a complete exposure/feedback history. Historical study labels are sparse and imbalanced; no production-quality winner is established. See [evaluation](recommendation-evaluation.md) and [preview](ranking-preview.md).

## What to borrow from evaluator–optimizer

Anthropic's [notebook](https://github.com/anthropics/claude-cookbooks/blob/main/patterns/agents/evaluator_optimizer.ipynb) alternates an LLM-generated answer with LLM feedback, refining until the evaluator accepts it. FORME should adapt the separation of candidate generation, evaluation and controlled refinement. The taste reference must remain the owner's actual judgments. An LLM's opinion of a garment is not a replacement label.

Use two loops:

1. **Learning loop:** eligibility → record frozen rankings/exposure → owner feedback → evaluate predictions made before that feedback → update later model versions.
2. **Improvement loop:** diagnose failures → propose a bounded configuration/feature change → test on development data → validate on untouched later feedback → preview/approve promotion or retain the incumbent.

Do not copy an unbounded “repeat until PASS” loop. Repeatedly tuning against the same benchmark makes it development data. A promising candidate can be rejected or return “insufficient evidence”; promotion is not an inevitable outcome.

## Reason-aware feedback contract

Not for me immediately hides the exact piece. No modal or reason is required before that action completes. The existing Undo notification can offer a quiet **Add reason** action, opening a compact optional sheet. Keep Undo and its four-second lifetime; entering the reason sheet must not lose the piece/event or let a notification timer dismiss the sheet. Reasons remain editable later in Hidden pieces, so a four-second offer is not the only way to supply them. Use 44px targets, keyboard focus return and the existing design patterns.

| Observation | Immediate effect | Proposed learning treatment |
|---|---|---|
| Save / Would save | Preserve the existing real-save versus preview-only distinction | Positive selection evidence at the displayed item/price snapshot; never infer purchase |
| Not my style | Exact piece stays hidden | Explicit taste-negative example; bounded feature influence, never an automatic brand ban |
| Too expensive | Exact piece stays hidden | Affordability evidence tied to displayed price, currency and category; no style-negative label or inferred permanent budget ceiling |
| Incorrect size/category | Exact piece stays hidden | Owner-reported data-quality issue, excluded from taste-negative training; do not change provider facts or personal filters automatically |
| No reason | Exact piece stays hidden | Unknown motive. Preserve generic rejection for an overall-selection diagnostic; do not invent a style/price/data-quality reason |
| Undo / Restore | Reverse the relevant action under existing save/hide rules | Remove its active learning contribution through canonical replay; an opposite training example is not an erasure |
| Unsave | Stop the active positive save signal | Neutral removal, not a new dislike |
| Skip, scrolling, closing or no vote | No taste opinion | Unlabelled, not a negative example |
| Explicit brand exclusion | Existing brand-wide hide/unfollow behavior | Hard user preference outside learned taste inference |

Use separate feature/target projections: taste ranking uses brand/style/text evidence without price; an affordability layer can later learn soft category/price-context preferences from explicit price judgments and positive selections when evidence supports it. Data-quality reports go to review, not either taste label stream. Do not turn one price rejection into a hard price filter. The first delivery may collect affordability evidence before enabling any learned affordability adjustment.

For the first reason-aware taste candidate, train taste negatives only from explicit Not my style judgments. Keep overall-selection and reason-specific evaluations separate. Generic legacy dislikes remain `reason=unknown`; do not silently relabel earlier studies as style negatives or rewrite their published metrics. Freeze/version this new label policy and compare it with the unchanged v1 baseline before changing live behavior.

A price rejection is not necessarily aesthetic dislike: rejecting a leather jacket at a high price must not automatically teach “dislikes leather”. A later price drop does not automatically undo the exact hide. A size/category report may mean a marketplace error or a mismatch with the owner's needs; retain it as a report, with an optional subdetail, until reviewed.

## Durable evidence before more sophisticated models

The bounded `tasteFeedback` profile array is a convenient current-state projection, not an experiment ledger. Add a versioned feedback/event contract with stable event IDs and idempotent ingestion. Proposed minimum records:

- **Exposure/ranking snapshot:** comparison/feed ID, source mode (real shopping/private preview/study), actual visible item IDs and positions, candidate-pool fingerprint, item snapshot/price/observation times, explicit filter snapshot/hash, engine/version/config/feature/label-policy IDs, fallback status and predictions produced before the vote. Record randomized assignment/probability only if an experiment actually used it.
- **Feedback event:** event ID, owner scope, source item key, exposure ID, action, optional reason, event time, displayed item snapshot reference and optional superseded-event ID.
- **Model/evaluation artifact:** training cutoff and event IDs, frozen feature/schema versions, dataset hash, algorithm version/settings, reproducible seed where supported, candidate IDs, labels, rankings, coverage/metrics, integrity checks and candidate decision.

Capture actual visible exposure rather than equating all rendered cards with things the owner saw. Exposure records help diagnose position/selection bias; they are never automatic dislikes. Collect only the context needed for this purpose, with retention/export/deletion rules. No third-party analytics or external image/feedback upload is needed for the first version.

Use a persisted browser outbox for offline delivery. The proposed atomic projection is implemented as idempotent event insertion with active learning state derived by replay; profile preferences continue through the separate existing sync mechanism. Derive active examples from ordered events and supersessions; repeated delivery is not repeated evidence. In account mode use owner-scoped Supabase rows/RLS; a local-only environment needs the same contract backed by local durable storage included in backups. Model artifacts can remain local/private. This is a proposed schema/API migration, not infrastructure to provision during planning.

Preserve existing profile/export compatibility and provide an explicit history export/backup path. A reason edit or Undo revises active evidence and invalidates affected training/evaluation artifacts; it does not silently mutate historical reports. Old reports remain reproducible with their original cutoff/policy and show when feedback was later corrected. Respect deletion requirements across future models and retained artifacts.

**Dependency, now fixed in the working tree:** the in-flight profile-save race documented in [project state](project-state.md). Do not build a new feedback flow on a mechanism that can claim pending edits are saved. Test delayed saves, rapid successive edits, offline/reconnect, concurrent tabs and revisions alongside event ingestion.

## River and Gorse roles

Keep Current as the incumbent. River is a useful first reason-aware candidate because the existing adapter's explicit feature model and canonical replay are straightforward to inspect. Gorse remains a separate candidate, not an additional vote for the same conclusion. At this single-owner stage, collaborative filtering has no cross-user evidence; keep the currently disabled collaborative path disabled.

Translate the shared semantic contract into each adapter. Do not assume identical numeric weights or feedback names have identical effects. Test that a price/data-quality reason cannot accidentally enter Gorse's generic negative-feedback channel or River's taste-negative labels. Gorse's [data-source documentation](https://gorse.io/docs/concepts/data-source) describes deriving negatives from read-without-positive behavior; FORME must retain its deliberate `read_feedback_types=[]` policy. Current pinned adapters and contract tests are authoritative for the installed versions; current online docs do not authorize upgrading them.

Initially replay canonical active feedback into versioned snapshots for both models. Even though River supports incremental learning, rebuilding a small personal history makes corrections/Undo reproducible. Incremental caching can follow after replay parity is proved. Learning must not block a card action or reshuffle a comparison already being rated. Existing rankings stay frozen; subsequent snapshots use eligible new evidence.

Feature changes should be bounded and reviewable: provenance-aware title/category traits, brand/style references and observed price context. Missing features remain missing. FashionCLIP, LLM rankers, provider changes and hosted model services remain deferred proposals, not prerequisites.

## Evaluation before learning and before promotion

For each new judged example, retain predictions from a model whose training cutoff precedes that feedback. Score those predictions first; only then can the judgment enter a later training version. If a model has no pre-vote prediction, mark that case unevaluated for that model; never reconstruct an apparently historical prediction after learning the answer. This follows River's [progressive validation](https://riverml.xyz/latest/api/evaluate/progressive-val-score/) principle. Gorse snapshots should follow the same cutoff discipline, even if trained in batches.

Add temporal forward evaluation to the existing ID-based diagnostic folds. Remove all feedback for held-out source identities, including earlier price variants and near-duplicate versions that would leak the same judgment. Feature fitting and any price calibration use training data only. Keep permanent/frozen release-test labels outside the optimizer; use separate development data for choosing weights/configuration. If a benchmark is retired into training, replace it before claiming new validation results.

Two complementary comparisons are needed:

1. **Common-pool reranking:** all engines rank the same eligible items. This isolates order quality and extends the current preview.
2. **Candidate discovery:** later, independently compare which eligible brands/items a model retrieves beyond Current's pool. A shared pool cannot establish retrieval superiority or create inventory that was never collected. Followed-brand labels may train taste context but cannot be counted as Discover candidates under the current product rule.

A small optional blind review should include independently sampled eligible pieces and disjoint training/evaluation batches. Record the sampling policy. Normal feed votes are valuable but biased toward what the incumbent selected; logging exposure alone does not make an offline comparison unbiased. This feedback-loop risk is documented in [Chaney et al.](https://arxiv.org/abs/1710.11214). Wider exploration in the normal feed would need its own explicit product choice and must obey every hard filter. Never assume skipped or unrated catalog items are disliked, including when computing metrics.

Report:

- Rated-item and class counts, time/session coverage, source mode, reason completion and eligibility/label coverage.
- Ranking quality such as NDCG@5/10 on fully judged comparable pools; fixed, disclosed denominators for precision. Sparse partial labels produce coverage-qualified diagnostics, not a full-feed precision claim.
- Explicit save/Would-save outcomes separately from style dislikes, price rejections and data-quality reports. Do not pool actual saves, hypothetical preview votes and study judgments without a declared/versioned policy and the applicable owner approval. Existing preview/study channels remain separate; a ledger is not permission to import study votes into production training.
- Brand/category diversity within the allowed pool, repetition, cold-start/fallback frequency, startup/query cost and failure behavior.
- Paired candidate-versus-incumbent differences and uncertainty across review sessions where data support it. Repeated judgments on one listing are not independent people or sessions. Prefer “insufficient evidence” to an attractive accuracy percentage from a tiny imbalanced pool.

Gorse's [built-in evaluation](https://gorse.io/docs/concepts/evaluation) can provide engine diagnostics. Its aggregate metrics are not a substitute for FORME's same-pool, owner-feedback, hard-filter and reason-aware evaluation.

## Bounded optimizer and release control

The first optimizer is deterministic experiment code, not an agent that rewrites the app. It may test a small allow-listed set of feature/regularization/ranking configurations under fixed attempt/time budgets. Record every configuration tried and separate all tuning from final validation. It cannot change user filters, labels, truth/provenance, collection caps, credentials, providers or machine routing.

Promotion requires zero policy leaks, working corrections/replay/fallback, a useful improvement on untouched later judgments, acceptable diversity/reliability, and enough per-class/session evidence to assess uncertainty. Before running a promotion experiment, write its primary outcome, data requirements, stopping rule and practical improvement threshold. Choose these after initial logging establishes the available sample/variance; do not invent a universal “N votes guarantees a winner” rule. When the sample is inadequate, continue collecting honest feedback and keep Current.

First releases keep learned candidates in shadow/private preview. The owner reviews the evidence and explicitly approves any live ranker switch. Store the selected version and the prior one for rollback; model failure falls back to Current and is disclosed. Automatic promotion could be considered later under an explicitly approved policy, not inferred from permission to train.

An LLM may later summarize anonymized failure groups or suggest a feature hypothesis for review. It must never invent owner votes, act as final taste judge, see held-out labels while optimizing, or make unbounded calls. External model/privacy/cost decisions need their own scope. The first complete loop needs no LLM, collection or translation requests.

## Implementation sequence and acceptance

| Stage | Deliverable | Exit condition |
|---|---|---|
| 0. Evidence integrity | Fix pending-save race; specify event schema, idempotency, outbox, RLS/local storage and retention | Slow/offline/concurrent edits cannot disappear or falsely report saved; fixtures cover retries and corrections |
| 1. Optional reasons | Immediate hide + optional sheet + later edit; backward-compatible snapshots/events | No added mandatory action; Undo/reason changes replay correctly; price/data reasons never become taste dislikes |
| 2. Evaluation ledger | Frozen exposures, pre-vote predictions, feature/model/label-policy versions and report UI | A vote is traceable to what was shown; repeated delivery cannot double-count; sparse evidence is explicit |
| 3. Reason-aware candidates | Actual River and Gorse adapters behind the existing private comparison | Both obey the same contract and filters, with genuine learned/fallback status and reproducible correction tests |
| 4. Controlled improvement | Development tuning, untouched forward evaluation and optional independent blind review | Reproducible same-pool reports, bias/coverage/uncertainty disclosed; keep incumbent if evidence is insufficient |
| 5. Deliberate release | Owner-approved candidate/blend, version pin, health/fallback and rollback | Real session/phone validation and explicit engine-switch approval; no paid collection side effect |

25 October delivery implements the bounded first version of the full sequence: durable delivery/replay, optional reasons, frozen predictions and day-clustered paired reports, three fixed native candidates, explicit consent/version selection and rollback. The initial gate and retention behavior are documented in [the implementation guide](learning-loop.md). Learned affordability, independent randomized exploration, full-pool precision/NDCG studies, automated configuration search, an LLM evaluator and automatic promotion remain deferred. Hosted migration application and real phone/account validation remain unverified.
