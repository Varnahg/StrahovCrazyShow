import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
const root = resolve(import.meta.dirname, '../../..');
const frozen = resolve(root, '.cache/performance-snapshot/atmosphere-20261012-a');
const manifest = JSON.parse(await readFile(join(frozen, 'source-manifest.json'), 'utf8'));
async function sha(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
const entries = Object.entries(manifest.files), mismatches = [];
let cursor = 0;
await Promise.all(Array.from({length:4}, async () => {
  while(cursor < entries.length) {
    const [file, expected] = entries[cursor++];
    for (const [label, base] of [['live', root], ['frozen', frozen]]) {
      try { const actual = await sha(join(base,file)); if(actual !== expected) mismatches.push({label,file,expected,actual}); }
      catch(error) { mismatches.push({label,file,error:String(error)}); }
    }
  }
}));
const result = {checkedAt:new Date().toISOString(),sourceSnapshotId:manifest.snapshotId,
  liveFiles:entries.length,frozenFiles:entries.length,mismatches,
  method:'Stream SHA-256 of every manifest input, including tests; documentation outside the runtime manifest is separate.'};
await writeFile(join(import.meta.dirname,'source-check.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
if(mismatches.length)process.exitCode=1;
