"""Read-only verification AND full pixel decoding of every original IPR JPEG.
Uses at most four CPU workers; never edits, resizes, or redownloads source data.
Run with Blender's embedded Python (Pillow is in .cache/street-python).
"""
from __future__ import annotations
import collections
import concurrent.futures
import datetime
import hashlib
import io
import json
from pathlib import Path
import struct
import sys
import time
import warnings

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".cache/street-python"))
from PIL import Image, ImageFile, __version__ as PILLOW_VERSION

ImageFile.LOAD_TRUNCATED_IMAGES = False
MANIFEST = ROOT / "shared/data/photogrammetry.json"
OUT = ROOT / "docs/photogrammetry"
SOF_MARKERS = set(range(0xC0, 0xD0)) - {0xC4, 0xC8, 0xCC}


def jpeg_header(data: bytes) -> dict:
    """Independently read the SOF dimensions to compare with decoded pixels."""
    if data[:2] != b"\xff\xd8":
        raise ValueError("JPEG SOI missing")
    pos = 2
    while pos < len(data):
        if data[pos] != 0xFF:
            raise ValueError(f"unexpected marker byte at {pos}")
        while pos < len(data) and data[pos] == 0xFF:
            pos += 1
        if pos >= len(data):
            break
        marker = data[pos]
        pos += 1
        if marker in {0xD8, 0xD9, 0x01} or 0xD0 <= marker <= 0xD7:
            continue
        if pos + 2 > len(data):
            raise ValueError("truncated marker length")
        size = struct.unpack_from(">H", data, pos)[0]
        if size < 2 or pos + size > len(data):
            raise ValueError("invalid marker segment length")
        if marker in SOF_MARKERS:
            precision, height, width, components = struct.unpack_from(">BHHB", data, pos + 2)
            return {"marker": f"0x{marker:02x}", "width": width,
                    "height": height, "precisionBits": precision,
                    "components": components}
        if marker == 0xDA:
            break
        pos += size
    raise ValueError("JPEG SOF missing before scan")


def audit_one(node: dict) -> dict:
    row = {"id": node["id"], "level": node["level"], "texture": node["texture"],
           "verifyPass": False, "loadPass": False, "sha256Matches": False,
           "dimensionsMatchHeader": False, "pass": False}
    try:
        relative = node["texture"].lstrip("/")
        path = (ROOT / "public" / relative).resolve()
        path.relative_to((ROOT / "public/models/photogrammetry/ipr2023").resolve())
        data = path.read_bytes()
        row["bytes"] = len(data)
        row["bytesMatchManifest"] = len(data) == node["textureBytes"]
        row["sha256"] = hashlib.sha256(data).hexdigest()
        row["sha256Matches"] = row["sha256"] == node["textureSha256"]
        row["header"] = jpeg_header(data)
        with warnings.catch_warnings(record=True) as found:
            warnings.simplefilter("always")
            with Image.open(io.BytesIO(data)) as verifying:
                verifying.verify()
            row["verifyPass"] = True
            with Image.open(io.BytesIO(data)) as image:
                row["sourceMode"] = image.mode
                row["format"] = image.format
                row["bands"] = list(image.getbands())
                row["width"], row["height"] = image.size
                row["infoKeys"] = sorted(image.info)
                row["progressive"] = bool(image.info.get("progressive") or image.info.get("progression"))
                icc = image.info.get("icc_profile")
                row["iccProfileBytes"] = len(icc) if icc else 0
                row["iccProfileSha256"] = hashlib.sha256(icc).hexdigest() if icc else None
                image.load()  # Mandatory full entropy decoding, not header-only.
                row["loadPass"] = True
                row["dimensionsMatchHeader"] = image.size == (row["header"]["width"], row["header"]["height"])
                with image.convert("RGB") as rgb:
                    rgb.load()
                    row["decodedRGBExtrema"] = [list(pair) for pair in rgb.getextrema()]
                    row["decodedRGBPixelCount"] = rgb.width * rgb.height
            row["warnings"] = [str(w.message) for w in found]
        row["pass"] = all(row[k] for k in ["verifyPass", "loadPass", "sha256Matches", "dimensionsMatchHeader", "bytesMatchManifest"]) and row["format"] == "JPEG"
    except Exception as error:
        row["error"] = f"{type(error).__name__}: {error}"
    return row


def main() -> int:
    started = time.perf_counter()
    raw = MANIFEST.read_bytes()
    manifest = json.loads(raw)
    nodes = manifest["nodes"]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as workers:
        records = list(workers.map(audit_one, nodes))
    failures = [r for r in records if not r["pass"]]
    expected = {n["texture"].split("/")[-1] for n in nodes}
    actual = {p.name for p in (ROOT / "public/models/photogrammetry/ipr2023").glob("*.jpg")}
    summary = {
        "manifestNodes": len(nodes), "uniqueTexturePaths": len(expected),
        "filesFound": len(actual), "decodedPass": len(records) - len(failures),
        "failures": len(failures), "missingFiles": sorted(expected - actual),
        "extraFiles": sorted(actual - expected),
        "verifyPass": sum(r["verifyPass"] for r in records),
        "loadPass": sum(r["loadPass"] for r in records),
        "sha256Matches": sum(r["sha256Matches"] for r in records),
        "dimensionsMatchHeader": sum(r["dimensionsMatchHeader"] for r in records),
        "totalDecodedRGBPixels": sum(r.get("decodedRGBPixelCount", 0) for r in records),
        "sourceModes": dict(collections.Counter(r.get("sourceMode", "ERROR") for r in records)),
        "dimensions": dict(collections.Counter(f'{r.get("width")}×{r.get("height")}' for r in records)),
        "withICCProfiles": sum(r.get("iccProfileBytes", 0) > 0 for r in records),
        "progressiveJPEGs": sum(r.get("progressive", False) for r in records),
        "warningFiles": sum(bool(r.get("warnings")) for r in records),
    }
    manifest_unchanged = hashlib.sha256(raw).digest() == hashlib.sha256(MANIFEST.read_bytes()).digest()
    passed = not failures and not summary["missingFiles"] and len(expected) == len(nodes) and manifest_unchanged
    report = {
        "checkedAtUTC": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "scope": "Every original manifest JPEG, Image.verify then independent Image.open + Image.load + full RGB extrema scan; no resize, edit, save, or redownload of source pixels",
        "source": manifest["source"], "capture": manifest["capture"],
        "manifestSha256": hashlib.sha256(raw).hexdigest(), "manifestUnchangedDuringAudit": manifest_unchanged,
        "decoder": {"python": sys.version, "pillow": PILLOW_VERSION, "workers": 4, "allowTruncatedImages": ImageFile.LOAD_TRUNCATED_IMAGES},
        "pass": passed, "durationSeconds": round(time.perf_counter() - started, 3),
        "summary": summary, "records": records,
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "jpeg-decode-audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    dimensions = ", ".join(f"{key}: {value}" for key, value in summary["dimensions"].items())
    markdown = f'''# Úplné dekódování původních JPEG atlasů IPR

Stav: **{"PASS" if passed else "FAIL"}**, kontrola {report["checkedAtUTC"]}.

Všech **{len(nodes)}** původních JPEG atlasů prošlo samostatným čtením hlavičky SOF, `Pillow.Image.verify()` a následným novým otevřením s `Image.load()`. Nad všemi dekódovanými RGB pixely se skutečně spočítala minima a maxima kanálů. Nejde pouze o kontrolu JPEG hlavičky nebo přípony.

- Plné dekódování: **{summary["loadPass"]}/{len(nodes)}**.
- Shodný SHA-256 s původním manifestem: **{summary["sha256Matches"]}/{len(nodes)}**.
- Shoda rozměrů dekódovaného obrazu s nezávisle čteným SOF: **{summary["dimensionsMatchHeader"]}/{len(nodes)}**.
- Selhání: **{len(failures)}**, soubory s varováním dekodéru: **{summary["warningFiles"]}**.
- Zdrojové barevné režimy: `{summary["sourceModes"]}`; ICC profil má {summary["withICCProfiles"]} atlasů.
- Rozměry: {dimensions}.
- Celkem plně dekódováno **{summary["totalDecodedRGBPixels"]:,} RGB pixelů**.
- Pillow {PILLOW_VERSION}, nejvýše **4 pracovní vlákna**, striktní `LOAD_TRUNCATED_IMAGES=False`.
- Doba: {report["durationSeconds"]} s. Manifest se během kontroly nezměnil: **{manifest_unchanged}**.

Manifest SHA-256: `{report["manifestSha256"]}`.

[Úplný strojový výsledek](jpeg-decode-audit.json) obsahuje pro každý source ID SHA-256, velikost souboru, zdrojový barevný režim, SOF, rozměry, ICC metadata, dekódované RGB rozsahy a výsledek obou kontrol. Zdrojové soubory se pouze četly; nedošlo k úpravě, zmenšení, přepisu ani opětovnému stažení. Audit ověřuje integritu JPEG pixelů, nikoli úplnost fotogrammetrické rekonstrukce, geometrii nebo kvalitu fasád z pohledu chodce. GPU ani FPS se při tomto auditu neměřily.
'''
    (OUT / "jpeg-decode-audit.md").write_text(markdown, encoding="utf-8")
    print(json.dumps({"pass": passed, "durationSeconds": report["durationSeconds"], "summary": summary}, ensure_ascii=True))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
