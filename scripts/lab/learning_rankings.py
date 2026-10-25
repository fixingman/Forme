"""One frozen private preview; actual local models, no account/provider connections."""
import argparse
import json
import os
import signal
import threading
import time
import re
import subprocess
from pathlib import Path
from river_ranker import evaluate as river_evaluate
from gorse_ranker import evaluate as gorse_evaluate

parser = argparse.ArgumentParser()
parser.add_argument("--directory", required=True)
parser.add_argument("--gorse-bin", required=True)
parser.add_argument("--parent-pid", type=int)
args = parser.parse_args()
if args.parent_pid:
    def watch_parent():
        while True:
            try:
                os.kill(args.parent_pid, 0)
            except ProcessLookupError:
                if os.getpgrp() == os.getpid():
                    os.killpg(os.getpgrp(), signal.SIGTERM)
                os._exit(1)
            time.sleep(1)
    threading.Thread(target=watch_parent, daemon=True).start()
directory = Path(args.directory).resolve()
if not directory.is_relative_to(Path(".context/recommendation-learning").resolve()):
    raise ValueError("Preview output must stay in its private directory")
case = json.loads((directory / "input.json").read_text())["case"]
results = {}
def run_gorse():
    build = subprocess.run([str(Path(args.gorse_bin).resolve()), "--version"], capture_output=True, text=True, check=True, timeout=20).stdout
    if not re.search(r"Version:\s+v0\.5\.11(?:\s|$)", build):
        raise RuntimeError("Expected pinned Gorse version")
    return gorse_evaluate(case, Path(args.gorse_bin).resolve(), directory / "gorse", verify_undo=False)
for name, run in [
    ("river", lambda: river_evaluate(case)),
    ("river-regularized", lambda: river_evaluate({**case, "configuration": "regularized"})),
    ("gorse", run_gorse),
]:
    try:
        result = run()
        if name == "gorse" and result["mode"] == "tags-and-factorization-machines" and not result["nativeTrainingConfirmed"]:
            raise RuntimeError("Training not confirmed")
        results[name] = {"ranking": result["ranking"], "mode": result["mode"]}
    except Exception:
        # Local process logs remain private; never return stack traces, filesystem paths or raw payloads to the UI.
        results[name] = {"error": "Model could not prepare this comparison"}
(directory / "models.json").write_text(json.dumps(results))
(directory / "models.json").chmod(0o600)
