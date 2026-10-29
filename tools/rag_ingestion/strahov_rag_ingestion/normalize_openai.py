"""Bounded, offline process entry point for already acquired PDF candidates."""

import argparse
import json
import multiprocessing
import os
import re
import uuid
from pathlib import Path

from .contracts import canonical
from .io_utils import read_json, write_exclusive


def _failure(document, code):
    from .openai_normalizer import normalization_failure
    return normalization_failure(document, code)


def normalization_child(request_dict, output_path):
    # The target is imported by its canonical module name on Windows spawn.
    # Suppress third-party diagnostics before any document parser is imported.
    with open(os.devnull, "w") as sink:
        os.dup2(sink.fileno(), 1)
        os.dup2(sink.fileno(), 2)
        from .process_runtime import isolate
        isolate(Path(request_dict["document"]["workDir"]))
        from .openai_normalizer import NormalizationRequest, normalize
        request = NormalizationRequest.model_validate(request_dict)
        try:
            result = normalize(request)
        except Exception:
            result = _failure(request.document, "normalizer-child-failed")
        write_exclusive(output_path, canonical(result).encode("utf-8"))


def _child_result_matches(result, document):
    if (type(result) is not dict or type(result.get("schemaVersion")) is not int or result["schemaVersion"] != 1 or
            result.get("sourceId") != document.sourceId or result.get("inputSha256") != document.inputSha256 or
            result.get("status") not in {"ok", "review-required", "unsupported", "failed"} or
            type(result.get("document")) is not dict or result["document"].get("title") != document.title or
            type(result.get("blocks")) is not list or type(result.get("chunks")) is not list or
            type(result.get("quality")) is not dict or type(result["quality"].get("issues")) is not list or
            type(result.get("parserProfile")) is not dict or result["parserProfile"].get("id") != "openai-pdf-normalizer-v1"):
        return False
    if "errorCode" in result and (type(result["errorCode"]) is not str or not re.fullmatch(r"[a-z0-9-]{1,80}", result["errorCode"])):
        return False
    return (result["document"].get("complete") is True and bool(result["chunks"])) if result["status"] == "ok" else result["document"].get("complete") is False


def execute(request, output):
    document = request.document
    work = Path(document.workDir)
    if not work.is_dir() or work.is_symlink() or work.resolve() != work.absolute():
        raise ValueError("invalid-work-directory")
    output = Path(output)
    if (not output.is_absolute() or output.drive.startswith("\\") or output.parent.resolve() != work.resolve() or output.exists() or output.is_symlink() or
            output.name.startswith((".normalizer-", ".worker-"))):
        raise ValueError("invalid-output-path")
    if any((work / name).exists() or (work / name).is_symlink()
           for name in [".worker-claim", ".worker-result.json", ".normalizer-claim"]):
        raise ValueError("work-directory-in-use")
    if len(canonical(_failure(document, "normalizer-output-size-limit")).encode("utf-8")) > document.limits.maxOutputBytes:
        raise ValueError("output-limit-cannot-hold-envelope")
    token = uuid.uuid4().hex
    intermediate = work / (".normalizer-" + token + ".json")
    if intermediate.exists() or intermediate.is_symlink():
        raise ValueError("work-directory-not-fresh")
    marker = work / ".normalizer-claim"
    with marker.open("x", encoding="ascii") as handle:
        handle.write(token)
        handle.flush()
        os.fsync(handle.fileno())
    process = None
    owned_intermediate = None
    try:
        from .normalize_openai import normalization_child as spawn_target
        process = multiprocessing.get_context("spawn").Process(target=spawn_target, args=(request.model_dump(), str(intermediate)))
        process.start()
        process.join(document.limits.timeoutSeconds)
        if process.is_alive():
            process.terminate()
            process.join(5)
            if process.is_alive():
                process.kill()
                process.join(5)
            result = _failure(document, "normalizer-timeout")
        elif process.exitcode != 0 or not intermediate.is_file() or intermediate.is_symlink():
            result = _failure(document, "normalizer-child-failed")
        else:
            owned_intermediate = intermediate.stat()
            try:
                result = read_json(intermediate, document.limits.maxOutputBytes)
                if not _child_result_matches(result, document):
                    result = _failure(document, "invalid-normalizer-result")
            except (ValueError, OSError):
                result = _failure(document, "invalid-normalizer-result")
        data = canonical(result).encode("utf-8")
        if len(data) > document.limits.maxOutputBytes:
            result = _failure(document, "normalizer-output-size-limit")
            data = canonical(result).encode("utf-8")
        write_exclusive(output, data)
        return result
    finally:
        if process is not None:
            if process.is_alive():
                process.kill()
                process.join(5)
            process.close()
        if owned_intermediate is not None and intermediate.is_file() and not intermediate.is_symlink():
            current = intermediate.stat()
            if (current.st_dev, current.st_ino) == (owned_intermediate.st_dev, owned_intermediate.st_ino):
                intermediate.unlink()
        # Do not remove a marker replaced by a different operation.
        if not marker.is_symlink() and marker.read_text(encoding="ascii") == token:
            marker.unlink()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True)
    parser.add_argument("--output", required=True)
    arguments = parser.parse_args()
    try:
        from .openai_normalizer import NormalizationRequest
        request = NormalizationRequest.model_validate(read_json(arguments.request))
        result = execute(request, arguments.output)
    except Exception:
        print('{"status":"failed","errorCode":"invalid-or-conflicting-job"}')
        return 1
    print(json.dumps({"status": result["status"], **({"errorCode": result["errorCode"]} if "errorCode" in result else {})}))
    return 0 if result["status"] == "ok" else 2


if __name__ == "__main__":
    raise SystemExit(main())
