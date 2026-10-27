"""Isolated MIT MTree 5.6.0 core comparator; no addon registration/install."""
import os, sys
from pathlib import Path
import numpy as np
os.environ.setdefault('OMP_NUM_THREADS','2')

def build(kind,dependency_root,trunk_radius=None):
    sys.path.insert(0,str(Path(dependency_root).resolve()))
    from m_tree import m_tree as m
    def constant(value):
        p=m.ConstantProperty();p.value=value;w=m.PropertyWrapper();w.set_constant_property(p);return w
    trunk=m.TrunkFunction();trunk.seed=62025
    trunk.length=7. if kind=='broadleaf' else 12.
    trunk.start_radius=trunk_radius if trunk_radius is not None else (.38 if kind=='broadleaf' else .24);trunk.end_radius=.035
    trunk.shape=.8;trunk.resolution=3;trunk.randomness=.25;trunk.up_attraction=.8
    parent=trunk
    configs=([(.35,.95,5.5,1.5,45,.36,.2),(.2,.95,2.0,3.8,55,.42,.15),(.2,.95,.65,5.0,50,.42,.1),(.25,.95,.25,7.0,45,.5,.1)]
      if kind=='broadleaf' else[(.14,.95,3.4,8.0,85,.36,.0),(.15,.95,.9,7.0,55,.45,-.1),(.2,.95,.25,6.0,50,.45,-.15)])
    for i,(start,end,length,density,angle,radius,up)in enumerate(configs):
        b=m.BranchFunction();b.seed=62026+i
        b.distribution.start=start;b.distribution.end=end;b.distribution.density=density
        b.length=constant(length);b.start_radius=constant(radius);b.randomness=constant(.2);b.start_angle=constant(angle)
        b.gravity.up_attraction=up;b.gravity.strength=2 if kind=='broadleaf' else 4;b.gravity.stiffness=.5
        b.split.probability=.12 if kind=='broadleaf' else 0;b.break_chance=0;b.resolution=3
        if i==0:b.crown.shape=m.CrownShape.Spherical if kind=='broadleaf' else m.CrownShape.Conical
        parent.add_child(b);parent=b
    tree=m.Tree();tree.set_trunk_function(trunk);tree.execute_functions()
    mesher=m.ManifoldMesher();mesher.radial_n_points=8;mesher.smooth_iterations=1
    mesh=mesher.mesh_tree(tree)
    attrs={}
    for name in ['radius','stem_id','hierarchy_depth','branch_extent','vein_distance']:
        if mesh.has_float_attribute(name):attrs[name]=np.array(mesh.get_float_attribute(name),copy=True)
    for name in ['direction','pivot_position']:
        if mesh.has_vector3_attribute(name):attrs[name]=np.array(mesh.get_vector3_attribute(name),copy=True).reshape(-1,3)
    return {'positions':np.array(mesh.get_vertices(),copy=True).reshape(-1,3),'faces':np.array(mesh.get_polygons(),copy=True).reshape(-1,4)[:,::-1],
      'uv':np.array(mesh.get_uvs(),copy=True).reshape(-1,2),'uvLoops':np.array(mesh.get_uv_loops(),copy=True).reshape(-1,4)[:,::-1],'attributes':attrs}

if __name__=='__main__':
    import json
    root=Path(__file__).resolve().parents[2]
    for kind in ['broadleaf','conifer']:
        result=build(kind,root/'.cache/trees-pilot-20261025/deps/mtree-core')
        out=root/f'.cache/trees-pilot-20261025/mtree-{kind}.npz'
        np.savez(out,**{k:v for k,v in result.items()if k!='attributes'},**result['attributes'])
        print(kind,len(result['positions']),len(result['faces']),{k:(v.shape,float(v.min()),float(v.max()))for k,v in result['attributes'].items()},flush=True)
