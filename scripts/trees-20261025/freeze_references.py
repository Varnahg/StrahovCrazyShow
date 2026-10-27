"""Preserve viewed reference bytes privately; never publish user photographs."""
import hashlib,json,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'.cache/trees-pilot-20261025/inputs/references'
PRIVATE=Path('C:/Users/rezac/.codex/worktrees/cad-building-models/StrahovCrazyShow/.cache/b6-photo-refinement-20261024/references')
SOURCES={
    'b6-front.png':PRIVATE/'b6-front.png',
    'b6-rear.png':PRIVATE/'b6-rear.png',
    'b2-typology.png':PRIVATE/'b2-typology.png',
    'concept-seasonal-v1.png':ROOT/'.cache/trees-20261025/concept-seasonal-v1.png',
    'strahov-ortho-2024.jpg':ROOT/'docs/streets/strahov-ortho-2024.jpg',
    'b6-entry-ortho-2024.jpg':ROOT/'docs/reality-pack/facade-study/b6-entry-ortho-2024.jpg',
}
if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True);rows=[]
    for name,source in SOURCES.items():
        destination=OUT/name;shutil.copyfile(source,destination)
        source_sha=hashlib.sha256(source.read_bytes()).hexdigest()
        assert hashlib.sha256(destination.read_bytes()).hexdigest()==source_sha
        rows.append({'id':name,'source':str(source),'sha256':source_sha,'bytes':destination.stat().st_size,
          'basis':'synthetic concept, not photographic evidence'if name.startswith('concept')else 'viewed primary image; habitus/position reference, not botanical identification'})
    (OUT/'manifest.json').write_text(json.dumps({'schemaVersion':1,'references':rows},indent=2)+'\n')
    print(json.dumps({'frozenReferences':len(rows)}))
