# Private ranking preview

Implemented 24 October 2026 after the owner approved the comparison preview. Open **Collection tools → Ranking preview** on `127.0.0.1`. Normal Home, Following and Discover keep their existing ranker.

## Using it

**Create comparison** freezes the current preferences, local listing snapshot and available feedback. **Current** is selected first; River and Gorse reorder the same eligible pieces. Switching engines reads saved rankings and does not train again. **New comparison** prepares a new snapshot and uses the latest preview choices.

**Blind comparison** assigns the three engines to Edit A/B/C once per snapshot. Engine names, modes and explanations are absent from the blind response. **Reveal engines** shows that fixed assignment without changing the order. Blind mode requires both learned models to be ready; unavailable or cold-start copies of Current are not presented as independent blind results.

Each piece offers **Would save**, **Not for me** and **Skip**. These write only private preview feedback, never account saves, hidden pieces or brand preferences. Skip is neutral. Undo restores the preceding preview choice. Concurrent tabs use revision checks; a conflict stops writes and offers reloading rather than silently replacing another tab's feedback. Existing rankings remain frozen after a vote.

Changing real preferences hides an older comparison until a new one is requested. Pieces already saved, hidden or used as labelled training examples are excluded from the next comparison. Sizes, departments, excluded brands, review exclusions and known unavailable status are checked before the shared pool is formed. The listing details are a dated snapshot, not a live availability claim; use the original marketplace link before buying.

## What the comparison means

Current uses the existing explainable rules with the comparison's temporary feedback. Those signals can differ from the live account because preview opinions stay separate. River and Gorse receive the same frozen binary brand/style/text-trait/price-band features and canonical positive/negative examples. No visual model or FashionCLIP is used.

The preview reranks the pool eligible under Current's discovery rules. It does not test learned retrieval of additional brands or create new inventory. Missing model output is explicitly labelled unavailable, fallback or partial. A partial ranking keeps unranked pieces in Current order and discloses that behavior. No scores are presented as calibrated confidence or proof of improved taste accuracy.

Preview feedback snapshots retain the item content used when it was rated. A later price/observation update does not silently rewrite the training example. Current real saves and hides take precedence over older preview opinions. Retained saved copies supply examples where available. Earlier lab results and their limits remain in [recommendation evaluation](recommendation-evaluation.md); this preview is not a production engine selection.

## Local operations

The API is loopback-only and uses the existing owner authorization when sign-in is enforced. Hosted instances cannot start models or read local preview data. JSON mutations require matching Origin and bounded bodies. Session IDs and candidate keys are validated; model output cannot introduce out-of-pool items.

Private data stays under ignored `.context/ranking-preview/`: immutable session snapshots, model inputs/results and a separate revisioned feedback file. No credentials belong there. A fresh clone works without prior sessions; missing tools are disclosed and Current remains available.

Install the isolated pinned tools with:

```sh
npm run recommendations:setup
```

Generating a comparison runs the actual River/Gorse adapters locally, with a minimal child environment and a bounded subprocess lifetime. Gorse uses fresh private SQLite stores and ephemeral explicit `127.0.0.1` listeners, then stops. No model-provider routing, permanent service, hosted infrastructure, scraper, translator or publisher is involved. A build lock prevents concurrent generation and can recover when its recorded process no longer exists. No generation is automatically retried.

Earlier blind-review judgments can explicitly seed the preview store, while preserving their catalog fingerprints and leaving account data alone:

```sh
node scripts/lab/seed-ranking-preview.mjs \
  --snapshot .context/recommendation-lab/round-2/source-snapshot.json \
  --review .context/recommendation-lab \
  --review .context/recommendation-lab/round-2
```

This import is optional, rejects changed/unknown catalog content, and is idempotent: it does not overwrite newer preview choices. Keep its inputs private. Do not treat import into this preview as permission to import votes into real saves or account preferences.
