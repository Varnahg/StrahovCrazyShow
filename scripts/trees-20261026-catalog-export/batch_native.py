"""One Blender process per explicit batch, one source tree in memory at a time."""
import os,sys,subprocess,time
from pathlib import Path
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parent))
import bpy
from native_io import ROOT,arguments,read,write_json
from materials import ensure_material_library
from build_native import build_one
from finalize_native import finalize_one
from north_conifer import build_north
from b5_package import package_b5

def node(script,args):
    result=subprocess.run(['node',str(ROOT/'scripts/trees-20261026-catalog-export'/script),*args],cwd=str(ROOT),check=False,
      creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt'else 0)
    if result.returncode:raise RuntimeError(script+' failed')

if __name__=='__main__':
    run,args=arguments();ids=[p['sourceTreeId']for p in run['catalog']['placements']]if args['id']=='all'else args['id'].split(',');known={p['sourceTreeId']for p in run['catalog']['placements']}
    if len(set(ids))!=len(ids)or any(i not in known for i in ids):raise ValueError('Unknown/duplicate source selection')
    library=None
    for ident in ids:
        if (ROOT/run['cache']/'pause.request').exists():
            write_json(ROOT/run['cache']/('paused-before-'+ident+'.json'),{'runId':run['id'],'nextSourceTreeId':ident,'safeSourceBoundary':True})
            print('CATALOG_PAUSED_AT_BOUNDARY',ident,flush=True);break
        if (ROOT/run['cache']/ident/'complete.json').exists():finalize_one(run,ident,False);print('CATALOG_RESUMED_COMPLETE',ident,flush=True);continue
        start=time.perf_counter();phase=start;timings={}
        node('prepare.mjs',['--prepare','--run='+args['run'],'--id='+ident]);prepared=read(run['cache']+'/'+ident+'/prepared.json');timings['sourcePreparationSeconds']=time.perf_counter()-phase
        phase=time.perf_counter()
        if not prepared['reuseAcceptedPilot']:
            if prepared.get('packageAcceptedB5'):package_b5(run,prepared)
            elif prepared.get('deriveNorthConiferFar'):build_north(run,prepared,args.get('preview')=='yes')
            else:
                if library is None:bpy.ops.wm.read_factory_settings(use_empty=True);library=ensure_material_library(run)
                build_one(run,ident,library)
                node('fit_far.mjs',['--fit','--run='+args['run'],'--id='+ident])
                finalize_one(run,ident,args.get('preview')=='yes')
            if args.get('compact')=='yes'and not prepared.get('packageAcceptedB5')and not prepared.get('deriveNorthConiferFar')and not (ROOT/run['cache']/'pause.request').exists():node('cleanup.mjs',['--compact','--run='+args['run'],'--id='+ident])
        timings['nativeAndExportSeconds']=time.perf_counter()-phase;timings['totalSourceSeconds']=time.perf_counter()-start
        write_json(ROOT/run['cache']/ident/'timing.json',{'runId':run['id'],'sourceTreeId':ident,'seconds':timings,'method':'perf_counter around the planned production stages; not a separate benchmark'})
        node('progress.mjs',['--record','--run='+args['run'],'--source='+ident])
        print('CATALOG_BATCH_SOURCE_COMPLETE',ident,flush=True)
        if args.get('pause-after')==ident:node('control.mjs',['--pause','--run='+args['run']])
