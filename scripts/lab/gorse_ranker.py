"""Pinned Gorse 0.5.11 subprocess adapter. Every run has private SQLite stores and loopback-only listeners."""
import json
import os
import signal
import socket
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

VERSION = "0.5.11"


def free_ports():
    sockets = [socket.socket(), socket.socket()]
    try:
        for sock in sockets:
            sock.bind(("127.0.0.1", 0))
        return [sock.getsockname()[1] for sock in sockets]
    finally:
        for sock in sockets:
            sock.close()


class Gorse:
    def __init__(self, binary, directory):
        self.directory = directory.resolve()
        if not self.directory.is_relative_to(Path(".context").resolve()):
            raise ValueError("Gorse stores must stay in ignored .context/.")
        self.directory.mkdir(parents=True, exist_ok=False)
        (self.directory / "runtime").mkdir();(self.directory / "blob").mkdir()
        grpc, http = free_ports()
        self.base = f"http://127.0.0.1:{http}"
        self.client = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        path = lambda name: json.dumps(str(self.directory / name))
        config = f'''[database]
data_store = "sqlite://{self.directory}/data.db"
cache_store = "sqlite://{self.directory}/cache.db"
[master]
host = "127.0.0.1"
port = {grpc}
http_host = "127.0.0.1"
http_port = {http}
n_jobs = 1
[server]
cache_expire = "1s"
[recommend]
cache_size = 1000
cache_expire = "1s"
context_size = 1000
[recommend.data_source]
positive_feedback_types = ["save"]
negative_feedback_types = ["dismiss"]
read_feedback_types = []
[[recommend.item-to-item]]
name = "content"
type = "tags"
column = "item.Labels.tags"
[recommend.collaborative]
type = "none"
[recommend.ranker]
type = "fm"
recommenders = ["item-to-item/content", "latest"]
fit_period = "1s"
fit_epoch = 50
optimize_period = "0s"
cache_expire = "1s"
[recommend.fallback]
recommenders = ["item-to-item/content", "latest"]
[blob]
uri = {path("blob")}
'''
        config_path = self.directory / "config.toml";config_path.write_text(config);config_path.chmod(0o600)
        self.log = (self.directory / "process.log").open("w")
        environment = {key: os.environ[key] for key in ["HOME", "PATH", "TMPDIR", "LANG"] if key in os.environ}
        self.process = subprocess.Popen([str(binary), "--config", str(config_path), "--cache-path", str(self.directory / "runtime")], stdout=self.log, stderr=subprocess.STDOUT, env=environment)
        try:
            deadline = time.monotonic() + 45
            while time.monotonic() < deadline:
                if self.process.poll() is not None:
                    raise RuntimeError(f"Gorse exited; inspect {self.directory}/process.log")
                try:
                    self.request("GET", "/api/health/live");break
                except (OSError, urllib.error.HTTPError):
                    time.sleep(0.2)
            else:
                raise TimeoutError("Gorse did not become ready in 45 seconds")
        except BaseException:
            self.close();raise

    def request(self, method, path, data=None):
        body = json.dumps(data).encode() if data is not None else None
        request = urllib.request.Request(self.base + path, data=body, method=method, headers={"Content-Type": "application/json", "X-API-Version": "2"})
        with self.client.open(request, timeout=15) as response:
            raw = response.read();return json.loads(raw) if raw else None

    def close(self):
        if self.process.poll() is None:
            self.process.send_signal(signal.SIGINT)
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.kill();self.process.wait()
        self.log.close()

    def ranking(self, size):
        raw = self.request("GET", f"/api/recommend/owner?n={size}")
        return [{"key": row if isinstance(row, str) else row.get("Id", row.get("ItemId", row.get("id"))), "score": 0 if isinstance(row, str) else row.get("Score", row.get("score", 0))} for row in raw]


def evaluate(case, binary, directory, verify_undo=True):
    started = time.perf_counter()
    if not case["candidateKeys"]:
        return {"ranking": [], "mode": "empty-candidate-pool", "nativeTrainingConfirmed": False}
    engine = Gorse(binary, directory)
    try:
        engine.request("POST", "/api/users", [{"UserId": "owner", "Labels": {}}])
        engine.request("POST", "/api/items", [{"ItemId": item["key"], "Labels": {"tags": sorted(item["features"])}, "Timestamp": item["at"], "Categories": ["evaluation"]} for item in case["items"]])
        feedback_at = datetime.fromtimestamp(case.get("now", time.time() * 1000) / 1000, timezone.utc).isoformat()
        feedback = [{"FeedbackType": "save" if row["label"] else "dismiss", "UserId": "owner", "ItemId": row["key"], "Value": row["weight"], "Timestamp": feedback_at} for row in case["examples"]]
        trainable = len(case["examples"]) >= 8 and len({row["label"] for row in case["examples"]}) == 2
        if feedback:
            engine.request("PUT", "/api/feedback", feedback)
        # Waiting for a documented training completion signal is required; filled recommendations alone may be a cold-start fallback.
        deadline = time.monotonic() + 60
        raw = []
        while time.monotonic() < deadline:
            raw = engine.ranking(len(case["items"]))
            log = (directory / "process.log").read_text()
            if ("fit ranking model complete" in log or "fit ranker complete" in log or "fit click model complete" in log) and raw:
                break
            if not trainable and raw:
                break
            time.sleep(1)
        confirmed = "fit click model complete" in log
        if trainable and not confirmed:
            raise RuntimeError("Gorse returned recommendations without confirming a trained ranking model; refusing to score fallback output as learning")
        training_ms = (time.perf_counter() - started) * 1000
        allowed = set(case["candidateKeys"])
        filtered = [row for row in raw if row["key"] in allowed]
        # Application filters stay outside the engine. Cold start uses FORME's existing explicit preferences.
        mode = "tags-and-factorization-machines"
        ranking = filtered
        if not trainable:
            ranking = case["baseline"];mode = "current-rules-fallback-insufficient-feedback"
        started_query = time.perf_counter();engine.ranking(len(case["items"]));query_ms = (time.perf_counter() - started_query) * 1000
        undo = None
        if verify_undo and trainable and filtered:
            probe = filtered[0]["key"]
            engine.request("PUT", "/api/feedback", [{"FeedbackType": "dismiss", "UserId": "owner", "ItemId": probe, "Value": 1, "Timestamp": feedback_at}])
            immediate = engine.ranking(len(case["items"]))
            time.sleep(1.2)
            after = engine.ranking(len(case["items"]))
            encoded = urllib.parse.quote(probe, safe="")
            engine.request("DELETE", f"/api/feedback/owner/{encoded}")
            remaining = engine.request("GET", f"/api/feedback/owner/{encoded}")
            time.sleep(1.2)
            restored = engine.ranking(len(case["items"]))
            before_scores = {row["key"]: row["score"] for row in raw}
            restored_scores = {row["key"]: row["score"] for row in restored}
            feature_map = {item["key"]: json.dumps(item["features"], sort_keys=True) for item in case["items"]}
            undo = {"beforeTop10": raw[:10], "restoredTop10": restored[:10], "top10FeatureMultisetRestored": sorted(feature_map[r["key"]] for r in raw[:10]) == sorted(feature_map[r["key"]] for r in restored[:10]), "maxCommonScoreDelta": max((abs(score - restored_scores[key]) for key, score in before_scores.items() if key in restored_scores), default=0), "nativeDismissImmediate": probe not in {r["key"] for r in immediate}, "nativeDismissAfterCacheExpiry": probe not in {r["key"] for r in after}, "feedbackRemovedOnRestore": not remaining, "nativeItemReturnedAfterRestore": probe in {r["key"] for r in restored}, "top10ExactlyRestored": [r["key"] for r in raw[:10]] == [r["key"] for r in restored[:10]], "sameBrandStillRecommended": any(r["key"] != probe and set(next(i["features"] for i in case["items"] if i["key"] == r["key"])) & {tag for tag in next(i["features"] for i in case["items"] if i["key"] == probe) if tag.startswith("brand:")} for r in after)}
        return {"undo": undo, "ranking": ranking, "mode": mode, "trainAndStartupMs": training_ms, "queryMs": query_ms, "nativeReturned": len(raw), "filteredOut": len(raw) - len(filtered), "nativeRanking": raw, "nativeTrainingConfirmed": confirmed}
    finally:
        engine.close()
