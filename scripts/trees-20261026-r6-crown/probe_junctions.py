"""Read-only search for conservative existing-LOD support at authored anchors."""
import sys,json,math
from pathlib import Path
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).parent))
from build import ROOT,CACHE,source_parameters,sample,wood_lod,np
plan=json.loads((CACHE/'plan.json').read_text())
axes=json.loads((ROOT/plan['inputPins']['axes']['path']).read_text())['axes'];original={b['id']:b for b in axes}
out=[]
for lod in (1,2):
    branches=wood_lod(axes,lod)[0];by_id={b['id']:b for b in branches}
    for edit in plan['transforms']:
        if edit['id']not in by_id:continue
        parent=by_id[edit['parentId']];ts=source_parameters(parent,original[parent['id']],branches)
        def ratio(t):
            k=min(int(np.searchsorted(ts,t,side='right'))-1,len(ts)-2);f=(t-ts[k])/(ts[k+1]-ts[k]);centre=np.asarray(parent['points'][k])*(1-f)+np.asarray(parent['points'][k+1])*f
            radius=parent['radii'][k]*(1-f)+parent['radii'][k+1]*f
            return float(np.linalg.norm(sample(original[parent['id']]['points'],t)-centre)/(radius*math.cos(math.pi/parent['sides'])))
        r=ratio(edit['t'])
        if r>=1:out.append({'lod':lod,'id':edit['id'],'t':edit['t'],'ratio':r,'nearby':[[round(float(t),4),ratio(float(t))]for t in np.arange(max(.01,edit['t']-.06),min(.99,edit['t']+.061),.01)]})
print(json.dumps(out,indent=2))
