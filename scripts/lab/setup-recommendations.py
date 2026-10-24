"""Install pinned evaluation tools in ignored .context only. Does not load .env or change app dependencies."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import urllib.request
import venv
import zipfile

GORSE_VERSION = "0.5.11"
GORSE_MAC_ARM_SHA256 = "2849ffd1dde10c60ab9a575243d62789e7df784b51ea15b7d4e797ce2ba9ef29"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default=".context/recommendation-lab")
    args = parser.parse_args()
    root = Path(args.output).resolve()
    if not root.is_relative_to(Path(".context").resolve()):
        raise ValueError("Tools must stay in ignored .context/.")
    if sys.version_info < (3, 12):
        raise RuntimeError("Python 3.12+ is required for the pinned NumPy/SciPy stack; use an existing project-independent Python installation.")
    root.mkdir(parents=True, exist_ok=True)
    environment = root / ".venv"
    if not environment.exists():
        venv.EnvBuilder(with_pip=True).create(environment)
    python = environment / "bin" / "python"
    requirements = Path(__file__).with_name("recommendation-requirements.txt")
    subprocess.run([str(python), "-m", "pip", "install", "--only-binary=:all:", "-r", str(requirements)], check=True)
    system = platform.system()
    arch = platform.machine()
    if system == "Darwin" and subprocess.run(["sysctl", "-n", "hw.optional.arm64"], capture_output=True, text=True).stdout.strip() == "1":
        arch = "arm64"
    suffix = {("Darwin", "arm64"): "darwin_arm64.zip", ("Darwin", "x86_64"): "darwin_amd64.zip", ("Linux", "x86_64"): "linux_amd64.tar.gz", ("Linux", "aarch64"): "linux_arm64.tar.gz"}.get((system, arch))
    if suffix is None:
        raise RuntimeError("No bundled Gorse setup for this platform; supply a verified gorse-in-one binary to the comparison command.")
    request = urllib.request.Request(f"https://api.github.com/repos/gorse-io/gorse/releases/tags/v{GORSE_VERSION}", headers={"User-Agent": "FORME-offline-evaluation"})
    with urllib.request.urlopen(request, timeout=30) as response:
        release = json.load(response)
    asset = next(row for row in release["assets"] if row["name"] == "gorse_" + suffix)
    expected = GORSE_MAC_ARM_SHA256 if suffix == "darwin_arm64.zip" else asset.get("digest", "").removeprefix("sha256:")
    if len(expected) != 64:
        raise RuntimeError("Release has no SHA-256 digest; refusing an unverified binary.")
    archive = root / asset["name"]
    def digest(path):
        with path.open("rb") as source:
            return hashlib.file_digest(source, "sha256").hexdigest()
    if not archive.exists() or digest(archive) != expected:
        print(f"Downloading pinned Gorse {GORSE_VERSION} ({asset['size'] // 1048576} MiB)…", flush=True)
        temp = archive.with_suffix(".download")
        with urllib.request.urlopen(asset["browser_download_url"], timeout=30) as source, temp.open("wb") as target:
            while chunk := source.read(1048576):
                target.write(chunk)
        if digest(temp) != expected:
            temp.unlink();raise RuntimeError("Gorse checksum mismatch")
        temp.replace(archive)
    destination = root / "bin" / "gorse-in-one";destination.parent.mkdir(exist_ok=True)
    if suffix.endswith(".zip"):
        with zipfile.ZipFile(archive) as bundle:
            member = next(row for row in bundle.infolist() if Path(row.filename).name == "gorse-in-one")
            destination.write_bytes(bundle.read(member))
    else:
        import tarfile
        with tarfile.open(archive) as bundle:
            member = next(row for row in bundle.getmembers() if Path(row.name).name == "gorse-in-one" and row.isfile())
            destination.write_bytes(bundle.extractfile(member).read())
    destination.chmod(0o700)
    subprocess.run([str(destination), "--version"], check=True)
    (root / "tools.json").write_text(json.dumps({"river": "0.26.1", "gorse": GORSE_VERSION, "gorseArchiveSHA256": expected, "gorseBinarySHA256": digest(destination)}, indent=2))
    print("Isolated tools ready:", root)


if __name__ == "__main__":
    main()
