"""Download reviewed CC0 PBR surface families from official ambientCG v3.
Original 1K JPG channels are copied byte-for-byte, without editing source photographs.
Run using Python 3 (the installed Blender Python is also supported).
"""
import json,hashlib,urllib.request,zipfile,re,datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/textures/surfaces';OUT.mkdir(parents=True,exist_ok=True)
CACHE=ROOT/'.cache/surfaces';CACHE.mkdir(parents=True,exist_ok=True)
ASSETS=[('asphalt','Asphalt033',2.5),('concrete','Concrete034',1.1),('plaster','Plaster001',1.0),('grass','Grass001',1.4),('paving','PavingStones112',2.4),('sett','PavingStones036',2.0),('gravel','Gravel012',2.0)]
def get(url):
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'StrahovCrazyShow-local-asset-import/0.1'}),timeout=45) as response:return response.read()
manifest={'provider':'ambientCG','license':'CC0-1.0','licenseUrl':'https://docs.ambientcg.com/license/','usage':'Generic material family, not a photogrammetric scan of Strahov. Geometry and colours follow the campus reference atlas.','assets':[]}
for kind,asset_id,metres in ASSETS:
 metadata_file=CACHE/(asset_id+'-metadata.json')
 metadata=json.loads(metadata_file.read_text(encoding='utf-8-sig')) if metadata_file.exists() else json.loads(get('https://ambientcg.com/api/v3/assets?id='+asset_id+'&include=downloads,dimensions,title,url,maps'))['assets'][0]
 (CACHE/(asset_id+'-metadata.json')).write_text(json.dumps(metadata,indent=2),encoding='utf8')
 item=next(item for item in metadata['downloads'] if item['attributes']=='1K-JPG' and item['extension']=='zip')
 archive=CACHE/(asset_id+'.zip')
 if not archive.exists():archive.write_bytes(get(item['url']))
 channels={}
 with zipfile.ZipFile(archive) as bundle:
  for member in bundle.infolist():
   filename=Path(member.filename).name
   match=re.search(r'_(Color|NormalGL|Roughness)\.(jpg|png)$',filename,re.I)
   if not match:continue
   raw=bundle.read(member);(OUT/filename).write_bytes(raw)
   channels[match[1].lower()]={'url':'/textures/surfaces/'+filename,'byteLength':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
 if not all(key in channels for key in ['color','normalgl','roughness']):raise RuntimeError('Incomplete PBR channels for '+asset_id)
 dimensions=metadata.get('dimensions',{})
 width=dimensions.get('width',0)/100
 height=dimensions.get('height',0)/100
 if width and abs(width-metres)>.001:raise RuntimeError('Expected source width differs for '+asset_id)
 manifest['assets'].append({'kind':kind,'id':asset_id,'source':metadata['url'],'sourceArchive':item['url'],'archiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'metadataSha256':hashlib.sha256(metadata_file.read_bytes()).hexdigest(),'importedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'metresPerRepeat':metres,'metresPerRepeatV':height or metres,'providerDimensionsCentimetres':dimensions,'scaleProvenance':'ambientCG official approximate asset dimensions (API centimetres / 100)' if width and height else 'Artistic approximate repeat scale: provider dimensions are unavailable; not a measured Strahov surface','technique':'Procedural grass material (provider), not a Strahov photograph or scan' if kind=='grass' else 'Generic CC0 material family; not a Strahov scan','channels':channels})
 print(asset_id, sum(channel['byteLength'] for channel in channels.values()),'runtime bytes',flush=True)
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
# Copy bytes once after every reviewed channel and provenance record is complete.
source_manifest=ROOT/'shared/data/assets/surfaces-manifest.json'
source_manifest.parent.mkdir(parents=True,exist_ok=True)
source_manifest.write_bytes((OUT/'manifest.json').read_bytes())
print('Saved',len(ASSETS),'shared surface materials with source hashes.',flush=True)
