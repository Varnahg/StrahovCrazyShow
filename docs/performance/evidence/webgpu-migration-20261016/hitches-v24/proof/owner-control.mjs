import {DefineMemo} from './memo-owner.mjs';
// Explicit test-only binding. Nothing is exported from Babylon's module.
let reference=null,owner=null;
export function installReference(value){if(reference&&reference!==value)throw Error('Unexpected second reference module');reference=value;}
export function beginOwner(){if(owner||!reference)throw Error('Invalid proof owner state');return(owner=new DefineMemo(reference));}
export function endOwner(value){if(owner!==value)throw Error('Lost proof owner');owner=null;value.dispose();}
export function ownerActive(){return owner!==null;}
export function memoResult(raw){if(!reference)throw Error('Missing reference');return owner?owner.convert(raw):reference(raw);}
