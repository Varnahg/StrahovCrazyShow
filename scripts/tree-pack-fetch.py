"""Fetch unchanged CC0 photographic material channels from ambientCG's primary API.
These are generic leaf/bark references, never claimed to be Strahov species scans.
"""
import datetime, hashlib, json, urllib.request, zipfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/models/vegetation/realistic'
CACHE = ROOT / '.cache/tree-pack'
OUT.mkdir(parents=True, exist_ok=True)
CACHE.mkdir(parents=True, exist_ok=True)
def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'StrahovCrazyShow-local-tree-pack/1'}), timeout=90) as r:
        return r.read()
result = {'schemaVersion': 1, 'provider': 'ambientCG', 'license': 'CC0-1.0', 'licenseUrl': 'https://docs.ambientcg.com/license/', 'usage': 'Generic photographic leaf/bark material; not a scan or botanical identification of a Strahov tree.', 'assets': []}
for ident, resolution in [('LeafSet001', '2K-PNG'), ('LeafSet019', '2K-PNG'), ('Bark012', '2K-JPG')]:
    meta = CACHE / (ident + '-metadata.json')
    if not meta.exists():
        data = json.loads(fetch('https://ambientcg.com/api/v3/assets?id=' + ident + '&include=downloads,dimensions,title,url,maps'))['assets'][0]
        meta.write_text(json.dumps(data, indent=2), encoding='utf8')
    data = json.loads(meta.read_text(encoding='utf8'))
    download = next(d for d in data['downloads'] if d['attributes'] == resolution and d['extension'] == 'zip')
    archive = CACHE / (ident + '_' + resolution + '.zip')
    if not archive.exists(): archive.write_bytes(fetch(download['url']))
    channels = {}
    with zipfile.ZipFile(archive) as z:
        for name in z.namelist():
            filename = Path(name).name
            channel = next((c for c in ['Color', 'Opacity', 'NormalGL', 'Roughness'] if ('_' + c + '.') in filename), None)
            if not channel: continue
            raw = z.read(name)
            (OUT / filename).write_bytes(raw)
            channels[channel.lower()] = {'url': '/models/vegetation/realistic/' + filename, 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)}
    result['assets'].append({'id': ident, 'source': data['url'], 'sourceArchive': download['url'], 'archiveSha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'metadataSha256': hashlib.sha256(meta.read_bytes()).hexdigest(), 'dimensionsCentimetres': data.get('dimensions'), 'importedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'channels': channels})
    print(ident, list(channels), flush=True)
(OUT / 'texture-manifest.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
