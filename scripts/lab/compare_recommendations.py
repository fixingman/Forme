"""Run actual engines on a prepared private dataset; reports never imply synthetic labels are owner taste."""
import argparse
import json
import math
import uuid
import platform
import subprocess
import re
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from river_ranker import evaluate as river_evaluate, VERSION as RIVER_VERSION


def metrics(ranking, labels, k=10):
    top = ranking[:k]
    positives = sum(value == 1 for value in labels.values())
    if not labels:
        return {"returned": len(ranking), "precisionAt10": None, "recallAt10": None, "ndcgAt10": None}
    hits = sum(labels.get(row["key"]) == 1 for row in top)
    dcg = sum(1 / math.log2(i + 2) for i, row in enumerate(top) if labels.get(row["key"]) == 1)
    ideal = sum(1 / math.log2(i + 2) for i in range(min(positives, k)))
    return {"returned": len(ranking), "precisionAt10": hits / min(k, len(labels)), "recallAt10": hits / positives if positives else None, "ndcgAt10": dcg / ideal if ideal else None}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", default=".context/recommendation-lab/dataset.json")
    parser.add_argument("--output", default=".context/recommendation-lab/results.json")
    parser.add_argument("--gorse-bin")
    args = parser.parse_args()
    output = Path(args.output).resolve()
    if not output.is_relative_to(Path(".context").resolve()):
        raise ValueError("Private results must stay in ignored .context/.")
    dataset = json.loads(Path(args.dataset).read_text())
    report = {"evaluatedAt": datetime.now(timezone.utc).isoformat(), "datasetSHA256": hashlib.sha256(Path(args.dataset).read_bytes()).hexdigest(), "versions": {"river": RIVER_VERSION, "python": platform.python_version(), "pythonArchitecture": platform.machine()}, "weightPolicy": "equal-positive-negative", "timingCaveat": "Local diagnostic timings only; Python may run under translation while Gorse is native. No speed winner inferred.", "ownerAccuracyMeasured": False, "cases": [], "catalogAudit": (dataset.get("review") or {}).get("audit")}
    if args.gorse_bin:
        from gorse_ranker import evaluate as gorse_evaluate
        build = subprocess.run([str(Path(args.gorse_bin).resolve()), "--version"], capture_output=True, text=True, check=True, timeout=20).stdout
        if not re.search(r"Version:\s+v0\.5\.11(?:\s|$)", build):
            raise RuntimeError("Expected the pinned Gorse v0.5.11 binary")
        report["versions"]["gorse"] = "0.5.11"
        report["versions"]["gorseBuild"] = build.strip()
    run_id = uuid.uuid4().hex[:12]
    for case_index, case in enumerate(dataset["cases"]):
        result = {"name": case["name"], "kind": case["kind"], "training": len(case["examples"]), "candidates": len(case["candidateKeys"]), "engines": {}}
        engines = {"current": {"ranking": case["baseline"], "mode": "current-production-rules"}, "river": river_evaluate(case)}
        if args.gorse_bin:
            engines["gorse"] = gorse_evaluate(case, Path(args.gorse_bin).resolve(), output.parent / "gorse-runs" / run_id / f"case-{case_index:03d}")
        for name, engine in engines.items():
            allowed = set(case["candidateKeys"])
            assert len({row["key"] for row in engine["ranking"]}) == len(engine["ranking"]), "Duplicate ranked IDs"
            assert all(row["key"] in allowed for row in engine["ranking"]), "Hard filter leak"
            result["engines"][name] = {**engine, "metrics": metrics(engine["ranking"], case["labels"])}
        report["cases"].append(result)
        print(json.dumps({"case": case["name"], "kind": case["kind"], "metrics": {name: engine["metrics"] for name, engine in result["engines"].items()}}), flush=True)
    owner_cases = [row for row in dataset["cases"] if row["kind"] == "owner-labelled-held-out"]
    report["ownerAccuracyMeasured"] = bool(owner_cases) and all(len(row["labels"]) >= 4 and len(set(row["labels"].values())) == 2 and len(row["examples"]) >= 8 and len({e["label"] for e in row["examples"]}) == 2 for row in owner_cases)
    output.write_text(json.dumps(report, indent=2));output.chmod(0o600)
    print("Private report:", output)


if __name__ == "__main__":
    main()
