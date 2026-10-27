"""Copy only identified immutable pilot inputs, with byte-level provenance."""
import json,hashlib,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'.cache/trees-pilot-20261025/inputs'
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def freeze():
    OUT.mkdir(parents=True,exist_ok=True)
    paths=['shared/data/tree-reconstruction.json','shared/data/cad-buildings/b06-tree-placement.json',
      'shared/data/assets/tree-materials-manifest.json','shared/data/tree-leaf-components.json',
      'public/models/vegetation/realistic/texture-manifest.json']
    manifest=json.loads((ROOT/paths[2]).read_text());components=json.loads((ROOT/paths[3]).read_text())
    assert digest(ROOT/paths[2])=='3bd65af8559f874ca41ecb62b6bf8556417922dcdac5abfb0f83884c9fbdca60'
    assert digest(ROOT/paths[3])=='022533e3a97b5fda8d025914e9137dd8b897dc6199a032b7df60737cf13a50a3'
    for asset in manifest['assets']:
        for channel in asset['maps'].values():
            assert digest(ROOT/channel['runtimePath'])==channel['sha256'];paths.append(channel['runtimePath'])
    old=json.loads((ROOT/paths[4]).read_text())
    for a in old['assets']:
        if a['id']=='Bark012':
            for c in a['channels'].values():paths.append('public'+c['url'])
    rows=[]
    for name in paths:
        src=ROOT/name;dst=OUT/name;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dst)
        assert digest(src)==digest(dst);rows.append({'source':name,'copy':str(dst.relative_to(ROOT)).replace('\\','/'),'sha256':digest(dst),'bytes':dst.stat().st_size})
    (OUT/'manifest.json').write_text(json.dumps({'schemaVersion':1,'inputs':rows},indent=2)+'\n')
    return rows
if __name__=='__main__':print(json.dumps(freeze(),indent=2))
