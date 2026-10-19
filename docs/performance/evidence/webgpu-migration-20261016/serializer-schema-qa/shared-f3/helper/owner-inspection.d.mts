export type OwnerSnapshot = {entries:number;units:number;active:boolean;disposed:boolean;engine:boolean;device:boolean;observers:number};
export function inspectOwner(engine:object):OwnerSnapshot|null;
export function holdOwnerForCleanup(engine:object):()=>OwnerSnapshot|null;
