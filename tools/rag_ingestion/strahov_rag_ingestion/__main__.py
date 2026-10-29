"""Bounded process entry point. No document content reaches stdout/stderr."""

import argparse
import json
import multiprocessing
import os
from pathlib import Path

from .contracts import Request, canonical, empty_result
from .io_utils import read_json, write_exclusive
from .process_runtime import child


def execute(request, output):
    work = Path(request.workDir)
    if not work.is_dir() or work.is_symlink() or work.resolve() != work.absolute():
        raise ValueError("invalid-work-directory")
    output = Path(output)
    if not output.is_absolute() or output.parent.resolve() != work.resolve() or output.exists() or output.name in {".worker-result.json", ".worker-claim"}:
        raise ValueError("invalid-output-path")
    if len(canonical(empty_result(request)).encode("utf-8")) > request.limits.maxOutputBytes:
        raise ValueError("output-limit-cannot-hold-envelope")
    intermediate = work / ".worker-result.json"
    if intermediate.exists():
        raise ValueError("work-directory-not-fresh")
    marker = work / ".worker-claim"
    with marker.open("x", encoding="ascii") as claim:
        claim.write(str(os.getpid()))
    process = None
    try:
        context = multiprocessing.get_context("spawn")
        process = context.Process(target=child, args=(request.model_dump(), str(intermediate)))
        process.start()
        process.join(request.limits.timeoutSeconds)
        if process.is_alive():
            process.terminate()
            process.join(5)
            if process.is_alive():
                process.kill()
                process.join(5)
            result = empty_result(request)
            result["errorCode"] = "worker-timeout"
        elif process.exitcode != 0 or not intermediate.is_file():
            result = empty_result(request)
            result["errorCode"] = "worker-failed"
        else:
            try:
                result = read_json(intermediate, request.limits.maxOutputBytes)
            except ValueError:
                result = empty_result(request)
                result["errorCode"] = "invalid-worker-result"
        data = canonical(result).encode("utf-8")
        if len(data) > request.limits.maxOutputBytes:
            result = empty_result(request)
            result["errorCode"] = "output-size-limit"
            data = canonical(result).encode("utf-8")
        write_exclusive(output, data)
        return result
    finally:
        if process is not None:
            if process.is_alive():
                process.kill()
                process.join(5)
            process.close()
        intermediate.unlink(missing_ok=True)
        marker.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    try:
        request = Request.model_validate(read_json(args.request))
        result = execute(request, args.output)
    except Exception:
        print('{"status":"failed","errorCode":"invalid-or-conflicting-job"}')
        return 1
    print(json.dumps({"status": result["status"], **({"errorCode": result["errorCode"]} if "errorCode" in result else {})}))
    return 0 if result["status"] == "ok" else 2


if __name__ == "__main__":
    raise SystemExit(main())
