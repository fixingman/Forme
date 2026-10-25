# Recommendation evaluation

24 October 2026. The owner approved comparing Gorse and River against the existing rules. This is an isolated evaluation, not an engine selection or a change to the shopping feed. FashionCLIP is deferred.

## What runs

- Current FORME rules from `lib/domain/recommendations.mjs`.
- River **0.26.1**, using logistic regression on binary brand/style/text-trait/price-band features. The model replays canonical active examples in stable ID order for ten passes, with SGD 0.1 and L2 0.01. This fixed configuration is a first baseline, not a tuned winner.
- Gorse **0.5.11**, running the actual all-in-one release with private SQLite data/cache stores, tag-based item similarity and a factorization-machine ranker. Collaborative filtering, external recommenders, LLM rankers and passive read feedback are disabled. The harness verifies that a trained click model completed before scoring a learned case; filled latest-item recommendations alone do not count as successful training.

Both learned adapters receive the same binary features and unit-weight positive/negative examples. No visual embeddings are used. Gorse's numeric feedback value is not assumed equivalent to River's training weight. Feature quality, model settings, and limited data can all constrain results.

Tools live in ignored `.context/recommendation-lab/`. The setup pins the release and verifies its archive SHA-256; macOS arm64 is additionally pinned to `2849ffd1dde10c60ab9a575243d62789e7df784b51ea15b7d4e797ce2ba9ef29`. App dependencies and model-provider routing are unchanged. Python 3.12+ and Node 24+ are needed; the setup installs binary Python wheels in a private virtual environment rather than installing globally.

Primary references: [Gorse release](https://github.com/gorse-io/gorse/releases/tag/v0.5.11), [Gorse feedback semantics](https://gorse.io/docs/concepts/data-source), [Gorse pipeline](https://gorse.io/docs/concepts/pipeline), [River learning API](https://riverml.xyz/latest/api/linear-model/LogisticRegression/).

## Evaluation boundaries

All three rankers use the same eligible held-out IDs. Department, size, exclusion, review and availability constraints remain FORME's application-side gate. Raw Gorse results are inspected separately, and filtered-out counts are retained; an engine is not trusted to enforce the application's policy by itself.

Save and dismissal are distinct from restoring/unsaving. Dismissal takes precedence while an item is hidden, including a saved-and-hidden item. Repeated copies of one event do not become multiple training examples. River Undo is implemented by rebuilding from active canonical feedback, not by pretending an opposite gradient erases an update. Gorse Undo is exercised through its real feedback deletion API and subsequent recommendation reads. No browsing/skip event is treated as a dislike.

The synthetic suite contains three deliberately simple pattern fixtures: 24 training items, 72 held-out items and four deliberately ineligible probes per fixture. These fabricated patterns check plumbing and behavior. Repeated feature templates make the task easy; success does not demonstrate generalization to a real person's taste. Report metrics are precision@10, recall@10 and NDCG@10. Short result sets cannot inflate precision by shrinking its denominator. An unlabeled owner catalog receives **null accuracy metrics**, not invented relevance labels.

Owner judgments are split into three deterministic folds by listing ID. Feedback for each held-out item is removed from that fold's training events. Item content remains available to the content-based models; held-out feedback does not. Small folds and selection bias still limit conclusions. The report marks personal accuracy sufficiently populated only if every fold has at least eight training examples, four held-out labels, and both positive and negative classes in training and testing. This is a minimum screening rule, not statistical proof of superiority.

## First observed results

The actual engines ran successfully on 24 October:

| Check | Current rules | River | Gorse |
|---|---|---|---|
| Simple synthetic precision@10 / NDCG@10 | 1.0 / 1.0 in all three fixtures | 1.0 / 1.0 in all three fixtures | 1.0 / 1.0 in all three fixtures |
| Exact dismissal | Application gate | Application gate | Native API hid the probe immediately and after cache expiry |
| Restore | Removing the active dismissal restores its rule contribution | Replayed scores matched exactly in all fixtures | Deleted feedback restored the probe in all fixtures; exact top-ten restoration varied on repeat runs |
| Brand-wide exclusion from one dismissal | No | No exclusion; score effects are measured separately | Same-brand items remained recommended in all fixtures |
| No-feedback behavior | Existing explicit preferences | Explicit fallback to existing rules | Explicit fallback to existing rules, with native cold-start output also recorded |

These results produce **no demonstrated quality winner**. Gorse restored the probe in every observed case. Its first full run restored the exact top ten in all three fixtures; a repeated full run restored the exact order in two of three. An additional run of the affected fixture restored identical scores and order, so the inconsistency is intermittent and its cause remains unresolved. Exact ranking restoration needs further verification before integration; successful item restoration alone is not sufficient. Python ran under x86_64 translation on this Mac while Gorse was native arm64, so measured startup/query times are local diagnostics and are not a fair speed comparison.

A read-only audit found no saved/dismissed owner feedback in the synced profile or local feedback store at the time of preparation. The current preferences left only 18 Discover candidates across three brands in the existing catalog. An engine cannot create inventory outside the collected catalog. The blind review uses those existing candidates to obtain independent labels; recommendations shown in it are not ranked by an engine, and no engine identities, predictions or explanations are shown to influence the answers.

The first owner review was completed and the held-out comparison ran. Its labels were too sparse and imbalanced to satisfy the training/evaluation gate: both learned adapters used the existing-rule fallback in every owner fold. Equal outputs therefore do not establish a trained-model tie. Personal labels and detailed results remain in ignored local artifacts. Small test pools below ten also make precision@10 unsuitable for choosing an engine. The next useful step is broader genuine feedback, including more positive examples, before another quality comparison.

The subsequent broader owner review supplied enough training examples for both learned adapters to train in the combined run; Gorse training completion was confirmed and River used its learned path. A separate cross-batch diagnostic trained on followed-brand context and withheld all first-round Discover ratings. Neither learned engine improved the liked-piece position over the current rules in that small diagnostic. The original folds still fail the personal-quality screening gate because their held-out labels remain sparse and imbalanced. Filters and restoration checks passed in this run, without resolving the earlier intermittent Gorse order-restoration observation. The live ranker remains unchanged. Detailed personal ratings, ranks and metrics remain private.

## Reproduce without touching the live app

```sh
npm run recommendations:setup
npm run recommendations:prepare
npm run recommendations:compare
npm run test:recommendations
```

The default preparation is synthetic only. Setup downloads public open-source tools; the comparison uses local features and loopback listeners. It does not load `.env`, scrape, translate, publish, provision services, or start an automatic collection job. Gorse processes use fresh per-run databases and are stopped in `finally` blocks. Explicit `127.0.0.1` listeners and a minimal child environment prevent accidental use of project provider credentials. Gorse's CLI may create its default empty user cache directory during initialization; actual evaluation databases, blobs and runtime caches use the explicit private lab directory.

For a private catalog review, provide explicit local inputs:

```sh
npm run recommendations:prepare -- \
  --snapshot public/data/vinted.json \
  --preferences .context/recommendation-lab/preferences.json
npm run recommendations:review:build
npm run recommendations:review
```

The preferences input may be a validated backup or the selected preference fields. It stays ignored and must never be committed. Obtain it from an authorized existing source; the preparer does not fetch accounts or credentials. Review output includes private catalog data and remains ignored too.

Open `http://127.0.0.1:3210`. Mark **Would save**, **Not for me**, or **Skip**. This changes only the evaluation judgments, never account preferences or saved listings. **Undo last choice** restores the prior draft. The page saves locally to `.context/recommendation-lab/judgments.json`, and offers a download as a fallback. The API validates same-origin JSON, exact catalog fingerprint, known item IDs, bounded input and optimistic revisions; stale tabs cannot overwrite newer judgments. It serves only the review page and judgments, not other files in the lab directory.

Then prepare the held-out comparison:

```sh
npm run recommendations:prepare -- \
  --snapshot public/data/vinted.json \
  --preferences .context/recommendation-lab/preferences.json \
  --judgments .context/recommendation-lab/judgments.json
npm run recommendations:compare
```

Judgments are bound to item content and source observation timestamps, not just IDs. If the underlying catalog changes, keep the old dataset and judgments together or create a new private lab directory. Do not silently apply labels to changed prices or observations.

`results.json` records engine modes, versions, dataset hash, actual model-training confirmation, raw Gorse results, application-filtered rankings, restoration checks and metrics. Process logs and per-run databases remain private. Keep personal results out of public documentation and commits. Study labels are evaluation-only unless the owner separately asks to import them into FORME.

A follow-up review may include eligible pieces from followed brands to broaden taste-training context. Keep each batch and its judgments separately fingerprinted, preserve earlier labels, and state this broader scope to the reviewer. Followed-brand items are excluded from Discover by policy, so they must not be counted as Discover held-out test candidates. They may supply training context for the original non-followed held-out items, with test feedback still removed. More training context alone does not enlarge the held-out catalog or establish a quality winner.

To combine disjoint primary and followed-brand context reviews against their frozen source snapshot:

```sh
node scripts/lab/combine-recommendation-reviews.mjs \
  --primary .context/recommendation-lab \
  --context .context/recommendation-lab/round-2 \
  --snapshot .context/recommendation-lab/round-2/source-snapshot.json \
  --preferences .context/recommendation-lab/round-2/preferences.json \
  --output .context/recommendation-lab/combined-round-2
npm run recommendations:compare -- \
  --dataset .context/recommendation-lab/combined-round-2/dataset.json \
  --output .context/recommendation-lab/combined-round-2/results.json
```

The combiner rejects unknown/overlapping IDs, changed content/observation fingerprints, foreign votes and ineligible context. It adds a cross-batch diagnostic using only context labels for training and explicitly rated primary items for testing. It also retains the original three Discover folds with context labels as training-only examples. Do not treat neutral skips as negative labels, combine model scores from different folds into one ranking, or interpret identical precision@10 on a small pool as evidence of equal quality.

## Selection gate

Keep the current app ranker until owner judgments show a useful improvement and restoration/filter guarantees pass. Compare the same catalog and feedback, inspect errors rather than relying on one aggregate metric, and preserve the existing ranking as a fallback. No integration, model-hosting arrangement or deployment has been approved by the benchmark alone.

The subsequently approved [private ranking preview](ranking-preview.md) exposes these actual local models inside Collection tools. Preview feedback remains separate from account preferences; it does not change the evaluation’s lack of a production-quality winner.

The proposed next step is the [reason-aware learning/evaluation plan](recommendation-learning-plan.md), which adds distinct reason semantics, durable evidence and forward validation. This plan is not yet implemented and does not replace the results or selection boundary above.
