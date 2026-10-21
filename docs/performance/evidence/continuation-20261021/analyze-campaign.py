"""Independently recompute a complete delivered campaign; never mutate inputs.

Usage: uv run python analyze-campaign.py BASELINE_JSON CANDIDATE_JSON COMPARISON_JSON OUTPUT_STEM
OUTPUT_STEM must be inside this reserved evidence directory. Existing outputs are
preserved. Only validated, complete records enter the calculations; failed record
counts and every input hash remain in the result. No performance benefit verdict
is manufactured by this program.
"""
from pathlib import Path
import csv
import hashlib
import io
import json
import math
import sys

owned = Path(__file__).resolve().parent
stem = Path(sys.argv[4]).resolve()
if not stem.is_relative_to(owned):
    raise ValueError("Output must stay inside the reserved evidence directory")
json_output, csv_output = Path(str(stem) + ".json"), Path(str(stem) + ".csv")
if json_output.exists() or csv_output.exists():
    raise FileExistsError("Preserve previous analysis; choose a new output stem")
inputs = []


def read_json(argument):
    path = Path(argument).resolve()
    data = path.read_bytes()
    inputs.append({"path": str(path), "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)})
    return json.loads(data)


def stats(values, positive=False):
    if any(not isinstance(x, (int, float)) or not math.isfinite(x) or x < 0 or
           (positive and x == 0) for x in values):
        raise ValueError("Invalid raw duration")
    if not values:
        return {"count": 0, "sum": 0, "mean": None, "median": None, "p95": None,
                "p99": None, "max": None, "zeros": 0, "minPositive": None}
    ordered = sorted(values)
    quantile = lambda p: ordered[min(len(ordered) - 1, math.floor(len(ordered) * p))]
    return {"count": len(values), "sum": sum(values), "mean": sum(values) / len(values),
            "median": quantile(.5), "p95": quantile(.95), "p99": quantile(.99),
            "max": ordered[-1], "zeros": values.count(0),
            "minPositive": next((x for x in ordered if x > 0), None)}


baseline, candidate, comparison = [read_json(arg) for arg in sys.argv[1:4]]
required = {"sourceParity", "sameHarness", "completeCampaignInventory", "exactPerModeInterleaving",
            "identicalRecordedConditions", "identicalTransitSemantics", "comparableCameraAndPopulation", "allHealth"}
if not required.issubset(comparison["checks"]) or not all(comparison["checks"][key] is True for key in required):
    raise ValueError("Campaign is not admissible; preserve failed comparison and investigate")
campaign_ids = {bundle["campaignId"] for bundle in (baseline, candidate)}
if len(campaign_ids) != 1:
    raise ValueError("Mixed campaigns")
source_maps = []
records = []
for variant, bundle in (("A", baseline), ("B", candidate)):
    if bundle["variant"] != variant or len(bundle["acceptedRecords"]) != 6:
        raise ValueError("Expected six accepted groups per variant")
    sources = {build["source"]["value"]["snapshotId"]: build["source"]["value"]["files"]
               for build in bundle["builds"]}
    if set(sources) != {bundle["sourceSnapshotId"]}:
        raise ValueError("Mixed source snapshots")
    source_maps.append(sources[bundle["sourceSnapshotId"]])
    for record in bundle["acceptedRecords"]:
        if record["accepted"] is not True:
            raise ValueError("Failed record entered the accepted collection")
        raw = record["receipt"]["raw"]
        if record["begin"]["variant"] != variant or not record["begin"]["slot"].startswith(variant):
            raise ValueError("Record variant and slot disagree")
        if raw["sourceSnapshotId"] != bundle["sourceSnapshotId"] or len(raw["intervals"]) != 3:
            raise ValueError("Unexpected source or repetition count")
        records.append((variant, record))
source_differences = sorted(key for key in source_maps[0].keys() | source_maps[1].keys()
                            if source_maps[0].get(key) != source_maps[1].get(key))
if source_differences != ["client/transit-renderer.ts", "tests/transit-pool-pruning.test.ts"]:
    raise ValueError("Unexpected source changes")
records.sort(key=lambda item: item[1]["begin"]["begunAt"])
expected_slots = ["A1", "B1", "A2", "B2", "A3", "B3"]
for mode in ("profile", "plain"):
    if [r["begin"]["slot"] for _, r in records if r["receipt"]["raw"]["mode"] == mode] != expected_slots:
        raise ValueError("Incomplete or reordered per-mode interleaving")
for slot in expected_slots:
    if len({r["begin"]["startId"] for _, r in records if r["begin"]["slot"] == slot}) != 1:
        raise ValueError("Modes do not share one real start")
if len({record["begin"]["startId"] for _, record in records}) != 6:
    raise ValueError("Expected six distinct real starts")
harnesses, semantics, physical = set(), set(), set()
intervals, raw_by_start = [], {}
for variant, record in records:
    raw, begin = record["receipt"]["raw"], record["begin"]
    mode, slot = raw["mode"], begin["slot"]
    harnesses.add(raw["harnessSha256"])
    raw_by_start[(slot, mode)] = []
    for index, interval in enumerate(raw["intervals"], 1):
        for state in (interval["before"], interval["after"]):
            if state["health"]["valid"] is not True or len(state["passengers"]) != 12:
                raise ValueError("Invalid health or NPC cohort")
            if state["gpu"] is None or state["viewport"] is None or state["backbuffer"] is None:
                raise ValueError("Missing actual GPU or resolution context")
            physical.add(json.dumps({key: state[key] for key in
                                    ("scenario", "viewport", "backbuffer", "gpu", "quality")}, sort_keys=True))
        benchmark = interval["benchmark"]
        if benchmark["renderHealth"]["valid"] is not True or benchmark["renderErrorCount"] != 0 or benchmark["assetLoadErrorCount"] != 0 or benchmark["avatars"] < 3:
            raise ValueError("Invalid full-scene benchmark")
        frame = stats(interval["rawFrameMs"], positive=True)
        if frame["count"] != benchmark["frames"] or not frame["count"]:
            raise ValueError("Raw frame count does not match benchmark")
        row = {"variant": variant, "slot": slot, "mode": mode, "repetition": index,
               "attemptId": begin["attemptId"], "startId": begin["startId"],
               "frames": frame, "fps": 1000 / frame["mean"],
               "intervalsGe50ms": sum(x >= 50 for x in interval["rawFrameMs"]),
               "intervalsGe100ms": sum(x >= 100 for x in interval["rawFrameMs"])}
        if mode == "profile":
            profile = interval["profile"]
            update, prune = stats(profile["updateMs"]), stats(profile["pruneMs"])
            if update["count"] != profile["updates"] or prune["count"] != profile["prunes"] or not profile["updates"]:
                raise ValueError("CPU arrays do not match call counts")
            row["profile"] = {"update": update, "prune": prune,
                              "pruneMsPerUpdate": prune["sum"] / profile["updates"], "scope": profile["scope"]}
        semantics.add(interval["semanticHash"])
        intervals.append(row)
        raw_by_start[(slot, mode)].append(interval)
if len(harnesses) != 1 or len(semantics) != 1 or len(physical) != 1:
    raise ValueError("Mixed harness, semantics or recorded basic physical conditions")
if len(intervals) != 36:
    raise ValueError("Expected all thirty-six accepted intervals")
starts = []
for (slot, mode), raw_intervals in raw_by_start.items():
    frames = stats([x for interval in raw_intervals for x in interval["rawFrameMs"]], positive=True)
    item = {"slot": slot, "mode": mode, "frames": frames, "fps": 1000 / frames["mean"]}
    if mode == "profile":
        item["update"] = stats([x for interval in raw_intervals for x in interval["profile"]["updateMs"]])
        item["prune"] = stats([x for interval in raw_intervals for x in interval["profile"]["pruneMs"]])
        item["pruneMsPerUpdate"] = item["prune"]["sum"] / item["update"]["count"]
    starts.append(item)
pairs = []
for number in (1, 2, 3):
    for mode in ("profile", "plain"):
        a = next(x for x in starts if x["slot"] == "A" + str(number) and x["mode"] == mode)
        b = next(x for x in starts if x["slot"] == "B" + str(number) and x["mode"] == mode)
        item = {"pair": number, "mode": mode, "fpsDeltaBminusA": b["fps"] - a["fps"],
                "p95DeltaMsBminusA": b["frames"]["p95"] - a["frames"]["p95"],
                "p99DeltaMsBminusA": b["frames"]["p99"] - a["frames"]["p99"]}
        if mode == "profile":
            item["updateMeanDeltaMsBminusA"] = b["update"]["mean"] - a["update"]["mean"]
            item["prunePerUpdateDeltaMsBminusA"] = b["pruneMsPerUpdate"] - a["pruneMsPerUpdate"]
        pairs.append(item)
result = {"schemaVersion": 1, "analyzerSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
          "inputs": inputs, "campaignId": next(iter(campaign_ids)), "sourceDifferences": source_differences,
          "sourceSnapshotIds": {"A": baseline["sourceSnapshotId"], "B": candidate["sourceSnapshotId"]},
          "harnessSha256": next(iter(harnesses)), "recordedPhysicalCondition": json.loads(next(iter(physical))),
          "producerChecks": comparison["checks"], "intervals": intervals, "startModeSummaries": starts, "pairs": pairs,
          "actualStartCount": 6,
          "failedRecordsRetained": {"A": len(baseline["failedRecords"]), "B": len(candidate["failedRecords"])},
          "limits": ["CPU/profile and plain FPS remain separate", "Three pairs are not a robust significance test",
                     "Prune is nested in update; no addition of inclusive scopes", "No gain verdict inferred from call counts",
                     "Camera/population tolerance gates are preserved from inspected producer validation"]}
rows = [{"variant": x["variant"], "slot": x["slot"], "mode": x["mode"], "repetition": x["repetition"],
         "frames": x["frames"]["count"], "fps": x["fps"], "p95Ms": x["frames"]["p95"],
         "p99Ms": x["frames"]["p99"], "maxMs": x["frames"]["max"],
         "ge50ms": x["intervalsGe50ms"], "ge100ms": x["intervalsGe100ms"],
         "updateMeanMs": x.get("profile", {}).get("update", {}).get("mean"),
         "pruneMsPerUpdate": x.get("profile", {}).get("pruneMsPerUpdate")} for x in intervals]
csv_text = io.StringIO(newline="")
writer = csv.DictWriter(csv_text, fieldnames=list(rows[0]), lineterminator="\n")
writer.writeheader()
writer.writerows(rows)
json_output.write_bytes((json.dumps(result, indent=2) + "\n").encode())
csv_output.write_bytes(csv_text.getvalue().encode())
print(json.dumps({"json": str(json_output), "csv": str(csv_output), "intervals": len(intervals),
                  "actualStarts": 6, "startModeGroups": len(starts)}))
