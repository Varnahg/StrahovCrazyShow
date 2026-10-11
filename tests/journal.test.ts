import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { JOURNAL_ENTRIES,JOURNAL_SOURCES,JOURNAL_IMAGES,JOURNAL_PROJECT_COVERAGE,PROJECT_PLACES,journalEntry,journalPlace,entryForPlace,searchJournal,parseJournalProgress } from '../shared/journal';

test('journal references all resolve in both directions without a shared/world dependency',()=>{
  const ids=JOURNAL_ENTRIES.map(e=>e.id),placeIds=PROJECT_PLACES.map(p=>p.id),sourceIds=JOURNAL_SOURCES.map(s=>s.id);
  for(const list of [ids,placeIds,sourceIds])assert.equal(new Set(list).size,list.length);
  for(const entry of JOURNAL_ENTRIES){
    assert.ok(entry.paragraphs.length&&entry.sourceIds.length,entry.id);
    for(const id of entry.sourceIds)assert.ok(sourceIds.includes(id),`${entry.id} unknown source ${id}`);
    for(const id of entry.placeIds){assert.ok(journalPlace(id),`${entry.id} missing place ${id}`);assert.ok(journalPlace(id)!.journalEntryIds.includes(entry.id),`${entry.id} unlinked from ${id}`);}
    for(const id of entry.imageIds??[])assert.ok(JOURNAL_IMAGES.find(photo=>photo.id===id));
  }
  for(const place of PROJECT_PLACES){assert.equal(place.worldLabel,false);assert.ok(Number.isFinite(place.x)&&Number.isFinite(place.z));assert.ok(place.accuracyMetres>0);assert.ok(entryForPlace(place.id));for(const id of place.journalEntryIds)assert.ok(journalEntry(id));}
  assert.doesNotMatch(readFileSync('shared/journal.ts','utf8'),/from ['"]\.\/world['"]/);
});

test('all current directory projects are covered; closed projects are not advertised as open',()=>{
  const expected=['printing','avc','foosball','darkroom','gamedev','music','macgyver','table-tennis','sherna','show','dance','bees','gardens'];
  assert.deepEqual([...JOURNAL_PROJECT_COVERAGE.currentProjectIds].sort(),expected.sort());
  assert.deepEqual(JOURNAL_ENTRIES.filter(e=>e.category==='projects').map(e=>e.id).sort(),expected);
  assert.equal(journalEntry('show')?.projectStatus,'seasonal');
  assert.equal(journalEntry('retired-projects')?.projectStatus,'retired');
  assert.match(journalEntry('retired-projects')!.paragraphs.join(' '),/1\. července 2026/);
  assert.match(journalEntry('retired-projects')!.paragraphs.join(' '),/Modelland/);
  assert.equal(journalEntry('table-tennis')!.placeIds.length,0,'No invented room when the directory gives none');
});

test('search handles Czech diacritics, multiple terms, venue labels, and bookmark filtering',()=>{
  assert.ok(searchJournal('pracky').some(e=>e.id==='laundry'));
  assert.ok(searchJournal('kniha zavad').some(e=>e.id==='defects'));
  assert.ok(searchJournal('severni B10').some(e=>e.id==='music'));
  assert.deepEqual(searchJournal('','projects',new Set(['printing','laundry'])).map(e=>e.id),['printing']);
  assert.equal(searchJournal('neexistujicipokojxyz').length,0);
});

test('untrusted or old local progress cannot inject unknown IDs or damage the reader',()=>{
  assert.deepEqual(parseJournalProgress('broken'),parseJournalProgress(null));
  assert.deepEqual(parseJournalProgress('null'),parseJournalProgress(null));
  assert.deepEqual(parseJournalProgress(JSON.stringify({favorites:['laundry','laundry','unknown',3],read:['welcome','x'],lastEntryId:'x'})),{version:1,favorites:['laundry'],read:['welcome'],lastEntryId:'welcome'});
});

test('laundry guidance reflects the 2025 central service rather than obsolete block machines',()=>{
  const laundry=journalEntry('laundry')!,text=[...laundry.paragraphs,...laundry.steps??[]].join(' ');
  assert.ok(laundry.placeIds.includes('journal-b4-laundry'));
  assert.match(text,/1\. května 2025/);assert.match(text,/6:00–22:00/);assert.match(text,/Vyprano/);
  assert.match(text,/není současný ceník/);assert.ok(laundry.sourceIds.includes('laundry-closure'));
  assert.match(journalEntry('defects')!.steps!.join(' '),/Ubytování → Kniha závad/);
});

test('real photos have date, credit, reuse licence and unchanged local bytes',()=>{
  for(const photo of JOURNAL_IMAGES){
    const bytes=readFileSync('public'+photo.src);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),photo.sha256,photo.id);
    assert.equal(bytes.length,photo.bytes);assert.ok(photo.author&&photo.changes);
    assert.match(photo.license,/CC BY-SA/);assert.match(photo.licenseUrl,/^https:\/\/creativecommons\.org\//);
    assert.ok(photo.captureDate===null||/^\d{4}-\d{2}-\d{2}$/.test(photo.captureDate));
  }
});

test('public references never need a game account and budget is explicitly a versioned plan',()=>{
  for(const source of JOURNAL_SOURCES){assert.match(source.url,/^https:\/\//);assert.equal(source.checkedAt,'2026-10-10');}
  for(const entry of JOURNAL_ENTRIES)for(const link of entry.links??[])assert.match(link.url,/^(https:\/\/|mailto:)/);
  assert.match(journalEntry('sh-budget')!.paragraphs.join(' '),/v1\.2/);
  assert.match(journalEntry('sh-budget')!.paragraphs.join(' '),/skutečné čerpání/);
  assert.doesNotMatch(readFileSync('client/journal.tsx','utf8'),/\bfetch\(|new WebSocket|Colyseus|sessionToken|password/i);
});
