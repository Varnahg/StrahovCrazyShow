"""Small atomic IO utilities shared by the two offline entry points."""

import json
import os
import tempfile
from pathlib import Path


def read_json(path, max_bytes=1_000_000):
    path = Path(path)
    if not path.is_absolute() or path.is_symlink() or not path.is_file() or path.stat().st_size > max_bytes:
        raise ValueError("invalid-request-file")
    with path.open("rb") as stream:
        data = stream.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise ValueError("invalid-request-file")
    return json.loads(data.decode("utf-8-sig"))


def write_exclusive(path, data):
    """Atomic create, never replace a result from an earlier or parallel job."""
    path = Path(path)
    if not path.is_absolute() or not path.parent.is_dir() or path.parent.is_symlink():
        raise ValueError("invalid-output-path")
    handle, name = tempfile.mkstemp(prefix=".result-", suffix=".tmp", dir=path.parent)
    temp = Path(name)
    try:
        with os.fdopen(handle, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        # Hard-link creates the directory entry atomically with EEXIST semantics.
        os.link(temp, path)
    finally:
        temp.unlink(missing_ok=True)
