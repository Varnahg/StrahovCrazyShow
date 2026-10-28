"""Offline RFC 9309 evaluation; HTTP/cache policy belongs to the caller."""

import argparse
import hashlib
import json
import math
from importlib.metadata import version
from pathlib import Path
from urllib.parse import urlsplit

from .io_utils import read_json, write_exclusive


def evaluate(request):
    from protego import Protego

    if set(request) != {"schemaVersion", "bodyPath", "bodySha256", "userAgent", "urls"} or request["schemaVersion"] != 1:
        raise ValueError("invalid-request")
    body = Path(request["bodyPath"])
    if not body.is_absolute() or body.is_symlink() or not body.is_file() or body.stat().st_size > 512 * 1024:
        raise ValueError("invalid-robots-body")
    content = body.read_bytes()
    if len(content) > 512 * 1024 or hashlib.sha256(content).hexdigest() != request["bodySha256"]:
        raise ValueError("invalid-robots-body")
    agent, urls = request["userAgent"], request["urls"]
    if not isinstance(agent, str) or not 1 <= len(agent) <= 1000 or not isinstance(urls, list) or len(urls) > 1000:
        raise ValueError("invalid-request")
    if any(not isinstance(url, str) or len(url) > 8192 or urlsplit(url).scheme not in {"https", "http"} for url in urls):
        raise ValueError("invalid-url")
    parser = Protego.parse(content.decode("utf-8-sig", errors="strict"))
    delay = parser.crawl_delay(agent)
    if delay is not None and (not math.isfinite(delay) or delay < 0):
        raise ValueError("invalid-crawl-delay")
    return {"schemaVersion": 1, "decisions": [{"url": url, "allowed": parser.can_fetch(url, agent),
            "crawlDelaySeconds": delay} for url in urls],
            "parserProfile": {"id": "protego-rfc9309-v1", "packages": {"protego": version("protego")}}}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    try:
        result = evaluate(read_json(args.request, 10_000_000))
        write_exclusive(args.output, json.dumps(result, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8"))
    except Exception:
        print('{"status":"failed","errorCode":"robots-evaluation-failed"}')
        return 1
    print('{"status":"ok"}')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
