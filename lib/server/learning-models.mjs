import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
export async function runLearningModels(root, directory) {
  const python = join(root, ".context/recommendation-lab/.venv/bin/python"),
    gorse = join(root, ".context/recommendation-lab/bin/gorse-in-one");
  if (!existsSync(python)) return {};
  const env = Object.fromEntries(
    ["HOME", "PATH", "TMPDIR", "LANG"]
      .filter((key) => process.env[key])
      .map((key) => [key, process.env[key]]),
  );
  await new Promise((accept, reject) => {
    const child = spawn(
      python,
      [
        join(root, "scripts/lab/learning_rankings.py"),
        "--directory",
        directory,
        "--gorse-bin",
        gorse,
        "--parent-pid",
        String(process.pid),
      ],
      { cwd: root, env, detached: true, stdio: "ignore" },
    );
    const stop = () => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
    };
    const timer = setTimeout(() => {
      stop();
      reject(Error("Local models timed out."));
    }, 120000);
    child.once("error", (error) => {
      clearTimeout(timer);
      stop();
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      code === 0 ? accept() : reject(Error("Local models could not finish."));
    });
  });
  return JSON.parse(readFileSync(join(directory, "models.json"), "utf8"));
}
