"""Print pooled raw statistics from two complete, already-validated gzip bundles.

The main analyzer establishes admissibility first. This small reproduction does
not replace its gates and does not modify any input or previous output.
"""
from pathlib import Path
import gzip
import json
import math
import sys

result = {}
for variant, argument in zip(("A", "B"), sys.argv[1:3]):
    data = json.loads(gzip.decompress(Path(argument).read_bytes()))
    plain, updates, prunes = [], [], []
    for record in data["acceptedRecords"]:
        raw = record["receipt"]["raw"]
        for interval in raw["intervals"]:
            if raw["mode"] == "plain":
                plain.extend(interval["rawFrameMs"])
            else:
                updates.extend(interval["profile"]["updateMs"])
                prunes.extend(interval["profile"]["pruneMs"])
    ordered = sorted(plain)
    quantile = lambda p: ordered[min(len(ordered) - 1, math.floor(len(ordered) * p))]
    result[variant] = {
        "plainFrames": len(plain), "plainDurationMs": sum(plain),
        "plainWeightedFps": 1000 * len(plain) / sum(plain),
        "pooledPlainP95Ms": quantile(.95), "pooledPlainP99Ms": quantile(.99), "plainMaxMs": max(plain),
        "profileUpdates": len(updates), "profileUpdateMeanMs": sum(updates) / len(updates),
        "profilePrunes": len(prunes), "pruneScopeTotalMs": sum(prunes),
        "pruneMsPerUpdate": sum(prunes) / len(updates), "pruneZeroSamples": prunes.count(0),
        "pruneZeroFraction": prunes.count(0) / len(prunes) if prunes else None,
        "minimumPositivePruneMs": min((x for x in prunes if x > 0), default=None)}
print(json.dumps(result))
