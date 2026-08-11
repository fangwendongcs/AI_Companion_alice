#!/usr/bin/env python3
"""Download the official VoxCPM2 snapshot into Alice's ignored runtime."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from huggingface_hub import snapshot_download


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-id", default="openbmb/VoxCPM2")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    snapshot_download(repo_id=args.repo_id, local_dir=str(output))

    required = [output / "config.json", output / "model.safetensors"]
    if not (output / "audiovae.safetensors").is_file() and not (output / "audiovae.pth").is_file():
        required.append(output / "audiovae.safetensors")
    missing = [str(path) for path in required if not path.is_file() or path.stat().st_size <= 0]
    if missing:
        raise SystemExit(f"VoxCPM2 snapshot is incomplete: {missing}")

    manifest = {
        "schema": "alice.voxcpm2-runtime.v1",
        "repoId": args.repo_id,
        "files": {
            path.name: path.stat().st_size
            for path in output.iterdir()
            if path.is_file()
        },
    }
    (output / ".alice-runtime.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(manifest, ensure_ascii=False))


if __name__ == "__main__":
    main()
