"""Importable spawn target and offline execution boundary."""

import os
import sys
from pathlib import Path

from .contracts import Request, canonical, empty_result
from .io_utils import write_exclusive


def isolate(work_dir):
    for key in list(os.environ):
        if any(part in key.upper() for part in ("API_KEY", "TOKEN", "SECRET", "PASSWORD", "DATABASE_URL")) and key != "TIKTOKEN_CACHE_DIR":
            del os.environ[key]
    for key, suffix in {"HF_HOME": "hf", "HF_HUB_CACHE": "hf/hub", "HUGGINGFACE_HUB_CACHE": "hf/hub",
                        "TORCH_HOME": "torch", "EASYOCR_MODULE_PATH": "easyocr", "XDG_CACHE_HOME": "cache",
                        "TMP": "tmp", "TEMP": "tmp"}.items():
        path = work_dir / suffix
        path.mkdir(parents=True, exist_ok=True)
        os.environ[key] = str(path)
    os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", CUDA_VISIBLE_DEVICES="",
                      OMP_NUM_THREADS="1", MKL_NUM_THREADS="1", OPENBLAS_NUM_THREADS="1",
                      PYTHONDONTWRITEBYTECODE="1")
    def audit(event, args):
        if event in {"socket.connect", "socket.getaddrinfo", "subprocess.Popen", "os.system", "os.posix_spawn"}:
            raise PermissionError("external-io-disabled")
    sys.addaudithook(audit)


def child(request_dict, output_path):
    # Third-party logs can include source text/paths. Suppress at OS fd level.
    with open(os.devnull, "w") as sink:
        os.dup2(sink.fileno(), 1)
        os.dup2(sink.fileno(), 2)
        request = Request.model_validate(request_dict)
        stage = "isolation"
        try:
            isolate(Path(request.workDir))
            stage = "import"
            from .worker import run
            stage = "extraction"
            result = run(request)
        except Exception:
            result = empty_result(request)
            result["errorCode"] = "worker-" + stage + "-failed"
        write_exclusive(output_path, canonical(result).encode("utf-8"))
