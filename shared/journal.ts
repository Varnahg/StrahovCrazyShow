import raw from './data/journal.json';
import type { Place } from './types';

export type JournalCategory = 'campus' | 'community' | 'services' | 'projects' | 'places' | 'archive';
export type JournalSource = {id:string;label:string;url:string;checkedAt:string;note:string};
export type JournalImage = {id:string;src:string;caption:string;author:string;source:string;captureDate:string|null;license:string;licenseUrl:string;changes:string;sha256:string;bytes:number};
export type JournalEntry = {
  id:string;category:JournalCategory;title:string;summary:string;paragraphs:string[];
  sourceIds:string[];tags:string[];placeIds:string[];steps?:string[];imageIds?:string[];
  facts?:{label:string;value:string}[];links?:{label:string;url:string}[];
  projectStatus?:'listed-open'|'seasonal'|'retired';
};
export type JournalPlace = Place & {
  worldLabel:false;
  venueLabel:string;journalEntryIds:string[];positionConfidence:'building-reference'|'approximate-area'|'published-coordinate';
  accuracyMetres:number;provenance:{checkedAt:string;placement:string;buildingOsmId?:string|null;lat?:number;lon?:number};
};
export const JOURNAL_CHECKED_AT = raw.checkedAt;
export const JOURNAL_ENTRIES = raw.entries as JournalEntry[];
export const JOURNAL_SOURCES = raw.sources as JournalSource[];
export const JOURNAL_IMAGES = raw.images as JournalImage[];
export const JOURNAL_PROJECT_COVERAGE = raw.projectCoverage;
// Pure data only: world imports this module. Never import world back here.
export const PROJECT_PLACES:JournalPlace[] = raw.places.map(p=>({...p,worldLabel:false})) as JournalPlace[];
export const JOURNAL_CATEGORIES:{id:JournalCategory;label:string;icon:string}[] = [
  {id:'campus',label:'Strahov',icon:'⌂'}, {id:'community',label:'Komunita',icon:'◈'},
  {id:'services',label:'Kolejní život',icon:'⚒'}, {id:'projects',label:'Projekty',icon:'✦'},
  {id:'places',label:'Místa',icon:'⌖'}, {id:'archive',label:'Archiv',icon:'◷'},
];
export const journalEntry = (id:string) => JOURNAL_ENTRIES.find(entry=>entry.id===id);
export const journalPlace = (id:string) => PROJECT_PLACES.find(place=>place.id===id);
/** Returns the primary article; all associated articles remain in journalEntryIds. */
export const entryForPlace = (id:string) => journalEntry(journalPlace(id)?.journalEntryIds[0]??'');
const normalize=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('cs');
const SEARCH_INDEX = new Map(JOURNAL_ENTRIES.map(entry=>[entry.id,normalize([
  entry.title,entry.summary,...entry.paragraphs,...entry.tags,...entry.steps??[],
  ...entry.placeIds.map(id=>journalPlace(id)?.venueLabel??''),
].join(' '))]));
export function searchJournal(query:string,category:JournalCategory|'all'='all',favoriteIds?:ReadonlySet<string>) {
  const terms=normalize(query).trim().split(/\s+/).filter(Boolean);
  return JOURNAL_ENTRIES.filter(entry=>(category==='all'||entry.category===category)
    &&(!favoriteIds||favoriteIds.has(entry.id))
    &&terms.every(term=>SEARCH_INDEX.get(entry.id)!.includes(term)));
}
export type JournalProgress={version:1;favorites:string[];read:string[];lastEntryId:string};
const knownIds=new Set(JOURNAL_ENTRIES.map(entry=>entry.id));
/** Storage is untrusted and may come from an older dataset. Keep only known IDs. */
export function parseJournalProgress(value:string|null):JournalProgress {
  const fallback:JournalProgress={version:1,favorites:[],read:[],lastEntryId:'welcome'};
  if(!value)return fallback;
  try{
    const candidate=JSON.parse(value);
    const ids=(list:unknown)=>Array.isArray(list)?[...new Set(list.filter((id):id is string=>typeof id==='string'&&knownIds.has(id)))]:[];
    if(!candidate||typeof candidate!=='object')return fallback;
    return {version:1,favorites:ids(candidate.favorites),read:ids(candidate.read),lastEntryId:knownIds.has(candidate.lastEntryId)?candidate.lastEntryId:'welcome'};
  }catch{return fallback;}
}
