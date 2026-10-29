"""Explicit one-time download of the checksum-verified cl100k_base dictionary."""

import argparse
import os
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache-directory", required=True)
    args = parser.parse_args()
    path = Path(args.cache_directory)
    if not path.is_absolute():
        parser.error("cache directory must be absolute")
    path.mkdir(parents=True, exist_ok=True)
    os.environ["TIKTOKEN_CACHE_DIR"] = str(path)
    import tiktoken
    encoder = tiktoken.get_encoding("cl100k_base")
    assert encoder.name == "cl100k_base"
    print('{"status":"ok","tokenizer":"cl100k_base"}')


if __name__ == "__main__":
    main()
