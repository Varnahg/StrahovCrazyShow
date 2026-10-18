import {beforeEach,afterEach,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {beginOwner as __beginOwner,endOwner as __endOwner,ownerActive as __ownerActive} from './owner-control.mjs';
let owner=null,current='unowned';const results=[],entries=new Map(),sequence=[];let codeUnits=0,omitted=0;
if(process.env.MEMO_MODE==='capture')globalThis.__memoRawCapture=raw=>{
  if(sequence.length>=12000){omitted++;return;}
  let record=entries.get(raw);if(!record){if(entries.size>=256||codeUnits+raw.length>512*1024){omitted++;return;}record={id:entries.size,text:raw,sha:createHash('sha256').update(raw).digest('hex')};entries.set(raw,record);codeUnits+=raw.length;}
  sequence.push({id:record.id,test:current});
};
beforeEach(context=>{assert.equal(__ownerActive(),false);current=context.name;owner=__beginOwner();});
afterEach(context=>{const before=owner.snapshot();__endOwner(owner);const after=owner.snapshot();assert.equal(after.retainedEntries,0);assert.equal(after.retainedCodeUnits,0);assert.equal(after.disposed,true);assert.equal(__ownerActive(),false);results.push({test:context.name,before,after});owner=null;current='unowned';});
after(()=>{assert.equal(__ownerActive(),false);delete globalThis.__memoRawCapture;const result={mode:process.env.MEMO_MODE,results,capture:process.env.MEMO_MODE==='capture'?{scope:'Untimed actual helper-entry access order after the original loop; controlled warm fixture, not production trace',sequence,entries:[...entries.values()],retainedCodeUnits:codeUnits,omitted}:null};if(process.env.MEMO_OWNER_REPORT)fs.writeFileSync(process.env.MEMO_OWNER_REPORT,JSON.stringify(result,null,2)+'\n',{flag:'wx'});entries.clear();sequence.length=0;});
