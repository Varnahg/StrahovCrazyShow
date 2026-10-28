"""Explicit download of exactly the pinned CPU profile, never run by extraction."""

import argparse
import json
import os
from pathlib import Path

from .model_profile import MANIFEST_PATH, validate_models


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-directory", required=True)
    parser.add_argument("--cache-directory", required=True)
    args = parser.parse_args()
    models, cache = Path(args.model_directory), Path(args.cache_directory)
    if not models.is_absolute() or not cache.is_absolute() or models.is_symlink() or cache.is_symlink():
        parser.error("owned absolute directories required")
    for key, suffix in {"HF_HOME": "hf", "HF_HUB_CACHE": "hf/hub", "HUGGINGFACE_HUB_CACHE": "hf/hub",
                        "TORCH_HOME": "torch", "EASYOCR_MODULE_PATH": "easyocr", "XDG_CACHE_HOME": "xdg",
                        "TMP": "tmp", "TEMP": "tmp"}.items():
        path = cache / suffix
        path.mkdir(parents=True, exist_ok=True)
        os.environ[key] = str(path)
    os.environ.update(CUDA_VISIBLE_DEVICES="", OMP_NUM_THREADS="1", MKL_NUM_THREADS="1", OPENBLAS_NUM_THREADS="1", HF_HUB_DISABLE_TELEMETRY="1")
    os.environ.pop("HF_HUB_OFFLINE", None)
    from huggingface_hub import snapshot_download
    from docling.models.stages.ocr.easyocr_model import EasyOcrModel
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    models.mkdir(parents=True, exist_ok=True)
    for item in manifest["provenance"]:
        if "repo" in item:
            snapshot_download(repo_id=item["repo"], revision=item["revision"],
                local_dir=models / item["repo"].replace("/", "--"), allow_patterns=item["patterns"], max_workers=2)
    EasyOcrModel.download_models(local_dir=models / "EasyOcr", detection_models=["craft"],
                                recognition_models=["latin_g2"], progress=False)
    print(json.dumps({"status": "ok", "modelManifestHash": validate_models(str(models))}))


if __name__ == "__main__":
    main()
