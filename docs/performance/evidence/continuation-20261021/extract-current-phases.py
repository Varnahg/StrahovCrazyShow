"""Exploratory full-campaign phase inventory after the primary recomputation.

Existing Game exports phase means over the benchmark, but frameWork/draw/triangle
fields are endpoint readings. Preserve that distinction. No additional gameplay
measurement or source-data modification occurs here.
"""
from pathlib import Path
import hashlib
import json
import sys

owned = Path(__file__).resolve().parent
output = Path(sys.argv[3]).resolve()
if not output.is_relative_to(owned) or output.exists():
    raise ValueError("Use a new output inside the reserved evidence directory")
inputs, rows = [], []
for variant, argument in zip(("A", "B"), sys.argv[1:3]):
    path = Path(argument).resolve()
    raw = path.read_bytes()
    inputs.append({"variant": variant, "path": str(path), "sha256": hashlib.sha256(raw).hexdigest()})
    bundle = json.loads(raw)
    for record in bundle["acceptedRecords"]:
        data = record["receipt"]["raw"]
        if data["mode"] != "plain":
            continue
        for index, interval in enumerate(data["intervals"], 1):
            benchmark = interval["benchmark"]
            rows.append({"variant": variant, "slot": record["begin"]["slot"], "repetition": index,
                         "frames": benchmark["frames"], "phaseMeanMs": benchmark["frameBreakdownMs"],
                         "nestedEngineMeanMs": benchmark["engineCpuBreakdownMs"],
                         "engineScope": benchmark["engineCpuBreakdownScope"],
                         "endpointFrameWork": benchmark["frameWork"],
                         "endpointDrawCalls": benchmark["drawCalls"], "endpointTriangles": benchmark["triangles"],
                         "triangleCountScope": benchmark["triangleCountScope"],
                         "compilationBackend": benchmark["compilation"]["start"]["backend"]})


def summarize(group, field):
    keys = set.intersection(*(set(row[field]) for row in group))
    frames = sum(row["frames"] for row in group)
    return {key: {"frameWeightedMeanMs": sum(row[field][key] * row["frames"] for row in group) / frames,
                  "intervalMeanRangeMs": [min(row[field][key] for row in group), max(row[field][key] for row in group)]}
            for key in sorted(keys)}


summary = {}
for variant in ("A", "B"):
    group = [row for row in rows if row["variant"] == variant]
    if len(group) != 9:
        raise ValueError("Expected every one of the nine plain intervals per variant")
    gpu = [row["endpointFrameWork"]["gpuMs"] for row in group if row["endpointFrameWork"]["gpuMs"] is not None]
    summary[variant] = {"intervals": len(group), "frames": sum(row["frames"] for row in group),
                        "phaseMeans": summarize(group, "phaseMeanMs"),
                        "nestedEngineMeans": summarize(group, "nestedEngineMeanMs"),
                        "endpointGpuSamples": {"available": len(gpu), "rangeMs": [min(gpu), max(gpu)] if gpu else None},
                        "endpointDrawCallRange": [min(row["endpointDrawCalls"] for row in group), max(row["endpointDrawCalls"] for row in group)],
                        "endpointTriangleRange": [min(row["endpointTriangles"] for row in group), max(row["endpointTriangles"] for row in group)]}
result = {"analyzerSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), "inputs": inputs,
          "classification": "exploratory descriptive inventory, not a second confirmatory significance test",
          "rows": rows, "summary": summary,
          "scopeEvidence": {"sourceFile": "client/game.ts", "phaseMeans": "benchmark.work or engineWork divided by benchmark.frames",
                            "frameWork": "last CPU frame and last available GPU counter sample; GPU value expires after500ms at frame start",
                            "drawsAndTriangles": "current endpoint counters, not interval averages",
                            "compilation": "backend other means WebGPU hooks do not measure WebGL shader compilation"},
          "limits": ["CPU wall time is not thread utilization", "Engine scopes are nested and may overlap; do not add them",
                     "CPU and GPU overlap; do not sum them into frame duration", "Endpoint GPU range is not mean or p95 GPU timing",
                     "No per-pass GPU attribution or CPU sampled stack added by this analysis"]}
output.write_bytes((json.dumps(result, indent=2) + "\n").encode())
print(json.dumps(summary))
