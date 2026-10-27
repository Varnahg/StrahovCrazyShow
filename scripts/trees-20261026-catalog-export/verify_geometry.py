"""Small portable CPU geometry fixtures; does not import or launch Blender."""
import json,math
import numpy as np
from native_geometry import sample,tube_geometry,photographic_part,foliage_geometry,fir_quad_from_source

def verify():
    axes=[{'id':0,'parent':None,'attachmentT':0,'depth':0,'points':[[0,0,0],[.1,0,2],[0,0,4]],'radii':[.3,.2,.01]}]
    p,_,_=sample(axes[0],.4);axes.append({'id':1,'parent':0,'attachmentT':.4,'depth':1,'points':[p.tolist(),[1,0,2]],'radii':[.002,.001]})
    near=tube_geometry(axes,0,{1});mid=tube_geometry(axes,1,{1})
    for result in [near,mid]:
        assert set(result['ranges'])=={0,1}
        assert len(result['loopUvs'])==sum(len(f)for f in result['faces'])
        assert all(0<=i<len(result['positions'])for f in result['faces']for i in f)
        child=next(b for b in result['branches']if b['id']==1);parent=next(b for b in result['branches']if b['id']==0)
        assert any(np.linalg.norm(np.asarray(x)-child['points'][0])<1e-10 for x in parent['points'])
        a,b=result['ranges'][0]['vertices'];assert abs(np.linalg.norm(np.asarray(result['positions'][a])-axes[0]['points'][0])-.3)<1e-10
    atlas={'id':'LeafSet024','parts':[{'id':'leaf','componentId':0,'attachmentUvBlender':[.5,0],'axisTipUvBlender':[.5,1]}],'components':[{'id':0,'cutoutHullUvBlender':[[.4,0],[.6,0],[.6,1],[.4,1]]}]}
    part={'partId':'leaf','anchor':[1,2,3],'tangent':[1,.3,.1],'orientationSeed':123456,'componentOrdinal':2,'angularJitter':.3,'independentRoll':.8,'branchId':1,'branchT':.8,'sourcePartIndex':0,'supportRadius':.002}
    n=photographic_part(part,atlas,0);m=photographic_part(part,atlas,1)
    assert n['lengthMetres']==m['lengthMetres']==.4
    assert np.array_equal(np.asarray(n['positions'])[[0,1,5,4]],np.asarray(m['positions']))
    moved=photographic_part({**part,'anchor':[-3,7,2],'tangent':[.1,.2,1]},atlas,0)
    for i in range(6):
        for j in range(6):assert abs(np.linalg.norm(np.asarray(n['positions'][i])-n['positions'][j])-np.linalg.norm(np.asarray(moved['positions'][i])-moved['positions'][j]))<1e-12
    group=[{'rank':123,'parts':[part]}];g=foliage_geometry(group,atlas,0);assert set(g['ranks'])=={123};assert len(g['components'])==1
    assert len(g['faces'])==4 and len(foliage_geometry(group,atlas,1)['faces'])==2
    fir_part={'attachmentUvBlender':[.5,.1],'axisTipUvBlender':[.5,.9]};fir_uv=np.array([[.05,.2],[.2,.05],[.8,.05],[.95,.2],[.95,.8],[.8,.95],[.2,.95],[.05,.8]])
    coefficients=np.array([[.2,0,0],[0,.3125,0],[-.1,-.03125,2],[0,0,.00375]])
    phase=np.clip((fir_uv[:,1]-.1)/.8,0,1);fir_positions=(np.column_stack([fir_uv,np.ones(8),np.sin(math.pi*phase)])@coefficients).astype(np.float32);copy=fir_positions.copy()
    quad=fir_quad_from_source(fir_positions,fir_uv,fir_part,{'cutoutHullUvBlender':fir_uv.tolist()},[0,0,2])
    assert len(quad['positions'])==4 and len(quad['faces'])==2 and abs(quad['physicalLengthMetres']-.25)<1e-6
    assert quad['sourceFitErrorMetres']<1e-6 and quad['anchorErrorMetres']<1e-6 and np.array_equal(copy,fir_positions)
    return {'supportPreservedNearMid':True,'junctionKnotsPreserved':True,'rootRadiusExact':True,'uvLoopCount':True,'physicalLeafScaleInvariant':True,'sameNearMidComponents':True,'northFirSourceMapping':True,'blenderUsed':False}

if __name__=='__main__':print(json.dumps(verify()))
