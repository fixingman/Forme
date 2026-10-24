"""Small, deterministic River adapter for the offline comparison, never the live app."""
import copy
import time
from river import linear_model, optim

VERSION = "0.26.1"
MIN_EXAMPLES = 8


def train(examples):
    # Rebuild from canonical active feedback: restore/unsave needs replay, not an inverse gradient.
    model = linear_model.LogisticRegression(optimizer=optim.SGD(0.1), l2=0.01)
    active = sorted(examples, key=lambda row: row["key"])
    for _ in range(10):
        for row in active:
            model.learn_one(row["features"], bool(row["label"]), w=row["weight"])
    return model


def evaluate(case):
    started = time.perf_counter()
    if not case["candidateKeys"]:
        return {"ranking": [], "mode": "empty-candidate-pool", "trainMs": 0, "undoMaxScoreDelta": None}
    if len(case["examples"]) < MIN_EXAMPLES or len({row["label"] for row in case["examples"]}) < 2:
        return {"ranking": case["baseline"], "mode": "current-rules-fallback-insufficient-feedback", "trainMs": 0, "undoMaxScoreDelta": None}
    import river
    if river.__version__ != VERSION:
        raise RuntimeError(f"Expected River {VERSION}, found {river.__version__}")
    model = train(case["examples"])
    train_ms = (time.perf_counter() - started) * 1000
    by_key = {row["key"]: row for row in case["items"]}

    def score(engine):
        return sorted([{"key": key, "score": engine.predict_proba_one(by_key[key]["features"]).get(True, 0.5)} for key in case["candidateKeys"]], key=lambda row: (-row["score"], row["key"]))

    began = time.perf_counter()
    ranking = score(model)
    query_ms = (time.perf_counter() - began) * 1000
    # A hypothetical dismiss followed by restore returns to the identical canonical examples.
    probe_key = case["candidateKeys"][0]
    transient = copy.deepcopy(case["examples"]) + [{"key": probe_key, "features": by_key[probe_key]["features"], "label": 0, "weight": 1}]
    changed = score(train(transient))
    restored = score(train(case["examples"]))
    original_scores = {row["key"]: row["score"] for row in ranking}
    delta = max(abs(row["score"] - original_scores[row["key"]]) for row in restored)
    by_score = {row["key"]: row["score"] for row in changed}
    brand_tags = {key for key in by_key[probe_key]["features"] if key.startswith("brand:")}
    peers = [key for key in case["candidateKeys"] if key != probe_key and brand_tags.intersection(by_key[key]["features"])]
    mean_brand_delta = sum(by_score[key] - original_scores[key] for key in peers) / len(peers) if peers else None
    return {"ranking": ranking, "mode": "weighted-online-logistic-replayed-10-passes", "trainMs": train_ms, "queryMs": query_ms, "undoMaxScoreDelta": delta, "sameBrandPeersRemainAfterExactHide": len(peers), "meanSameBrandScoreDelta": mean_brand_delta, "dismissProbeScoreDelta": next(row["score"] for row in changed if row["key"] == probe_key) - original_scores[probe_key]}
