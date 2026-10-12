"""Read-only source-channel audit; no image resampling or rewritten pixel files."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
import numpy as np
from PIL import Image

manifest = json.loads((ROOT / 'shared/data/assets/surfaces-manifest.json').read_text())
strengths = {'asphalt': .26, 'concrete': .27, 'plaster': .18, 'grass': .28,
             'paving': .35, 'sett': .4, 'gravel': .29}
rows = []
for asset in manifest['assets']:
    row = {'kind': asset['kind'], 'id': asset['id'], 'source': asset['source'], 'channels': {}}
    for channel, source in asset['channels'].items():
        path = ROOT / 'public' / source['url'].lstrip('/')
        raw = path.read_bytes()
        sha = hashlib.sha256(raw).hexdigest()
        assert sha == source['sha256'], str(path)
        with Image.open(path) as image:
            pixels = np.asarray(image.convert('RGB'), dtype=np.float64)[4::8, 4::8] / 255
            stats = {'sha256': sha, 'width': image.width, 'height': image.height,
                     'samples': pixels.shape[0] * pixels.shape[1]}
        if channel == 'normalgl':
            normal = pixels * 2 - 1
            slope = np.linalg.norm(normal[:, :, :2], axis=2) / np.maximum(normal[:, :, 2], 1e-6)
            stats['slopeDegreesSourceP50P90P99'] = np.percentile(np.degrees(np.arctan(slope)), [50,90,99]).tolist()
            stats['u1Strength'] = strengths[asset['kind']]
            stats['slopeDegreesU1P50P90P99'] = np.percentile(np.degrees(np.arctan(slope * stats['u1Strength'])), [50,90,99]).tolist()
            stats['candidateStrength'] = .32 if asset['kind'] == 'plaster' else stats['u1Strength']
            stats['slopeDegreesCandidateP50P90P99'] = np.percentile(np.degrees(np.arctan(slope * stats['candidateStrength'])), [50,90,99]).tolist()
        elif channel == 'roughness':
            stats['greenMeanP10P50P90'] = [float(pixels[:,:,1].mean()), *np.percentile(pixels[:,:,1], [10,50,90]).tolist()]
        else:
            linear = pixels ** 2.2  # Babylon default gamma conversion, not calibrated reflectance.
            stats['linearMeanRGB'] = linear.mean(axis=(0,1)).tolist()
            luma = linear @ np.array([.2126, .7152, .0722])
            stats['linearLumaMeanStdP10P50P90'] = [float(luma.mean()), float(luma.std()), *np.percentile(luma, [10,50,90]).tolist()]
        row['channels'][channel] = stats
    rows.append(row)
report = {'capturedAt': '2026-10-12', 'readOnly': True,
          'sampling': 'Every eighth source pixel from x=y=4; normal slope atan(length(XY)/Z) before and after U1 Babylon XY level. No render, filtering, lighting or mip contribution measured.',
          'originalFilesUnmodified': True, 'rows': rows}
output = Path(__file__).with_name('channel-audit.json')
output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
print(json.dumps([{'kind': r['kind'], 'normal': r['channels']['normalgl'], 'roughness': r['channels']['roughness']} for r in rows], indent=2))
