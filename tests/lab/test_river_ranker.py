import sys
from pathlib import Path
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/lab"))
from river_ranker import train, evaluate
from compare_recommendations import metrics


class RiverAdapterTests(unittest.TestCase):
    def examples(self):
        return [{"key": f"piece:{i}", "label": i < 4, "weight": 1, "features": {"material:linen" if i < 4 else "material:leather": 1}} for i in range(8)]

    def test_replay_is_deterministic_after_restoration(self):
        original = self.examples()
        first = train(original)
        transient = train(original + [{"key": "piece:9", "label": False, "weight": 1, "features": {"material:linen": 1}}])
        restored = train(list(reversed(original)))
        self.assertEqual(first.weights, restored.weights)
        self.assertLess(transient.predict_proba_one({"material:linen": 1})[True], first.predict_proba_one({"material:linen": 1})[True])

    def test_feedback_weight_changes_learning_direction(self):
        common = {"brand:fixture": 1}
        positive = [{"key": "a", "features": common, "label": True, "weight": 3}, {"key": "b", "features": common, "label": False, "weight": 1}]
        negative = [{**row, "weight": 1 if row["label"] else 3} for row in positive]
        self.assertGreater(train(positive).predict_proba_one(common)[True], 0.5)
        self.assertLess(train(negative).predict_proba_one(common)[True], 0.5)

    def test_cold_start_and_empty_catalog_are_explicit(self):
        fallback = [{"key": "one", "score": 10}]
        result = evaluate({"examples": [], "candidateKeys": ["one"], "baseline": fallback})
        self.assertEqual(result["ranking"], fallback)
        self.assertIn("insufficient-feedback", result["mode"])
        self.assertEqual(evaluate({"candidateKeys": []})["ranking"], [])

    def test_metrics_do_not_claim_owner_accuracy_without_labels(self):
        self.assertIsNone(metrics([{"key": "x"}], {})["precisionAt10"])
        labels = {str(i): int(i < 10) for i in range(20)}
        self.assertEqual(metrics([{"key": "0"}], labels)["precisionAt10"], 0.1)


if __name__ == "__main__":
    unittest.main()
