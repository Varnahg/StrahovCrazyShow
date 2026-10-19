// Test-only observation. Keep weak references even in this observer, and never
// patch toString or the memo lookup on the measured path. No GC/heap claim.
const OriginalWeakRef=globalThis.WeakRef,refs=[];
globalThis.WeakRef=class extends OriginalWeakRef {
 constructor(value){super(value);if(value?.entries instanceof Map&&Array.isArray(value.observers)&&'epoch'in value)refs.push({ref:this,engine:new OriginalWeakRef(value.engine)});}
};
const find=engine=>refs.find(row=>row.engine.deref()===engine)?.ref.deref();
const snapshot=owner=>owner?{entries:owner.entries.size,units:owner.units,active:owner.active,disposed:owner.disposed,engine:!!owner.engine,device:!!owner.device,observers:owner.observers.length}:null;
export function inspectOwner(engine){return snapshot(find(engine));}
// Explicit temporary TEST reference for deterministic logical-clear assertions
// after disposal; released with the fixture, never a garbage-collection proof.
export function holdOwnerForCleanup(engine){const owner=find(engine);return()=>snapshot(owner);}
process.on('exit',()=>{globalThis.WeakRef=OriginalWeakRef;});
