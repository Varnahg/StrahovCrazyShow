/** Collect the two native stages into one inspectable comparison manifest. */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const file = 'shared/data/assets/tree-r5-materials-manifest.json';
const report = JSON.parse(fs.readFileSync('.cache/trees-r5-bake-20261025/bake-report.json', 'utf8'));
const wood = JSON.parse(fs.readFileSync('.cache/trees-r5-bake-20261025/wood-report.json', 'utf8'));
for (const stage of [report, wood]) {
  for (const entry of [stage.generator, stage.nativeMaster]) {
    const bytes = fs.readFileSync(entry.path);
    if (bytes.length !== entry.bytes || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw Error(`Changed native stage ${entry.path}`);
  }
}
report.woodComparison = wood;
report.limitations = [
  'Single leafy projection visibly loses 3D depth at 60 degrees; not accepted as universal near/mid replacement.',
  'Plain Fir bbox quad visibly includes foreign atlas fragments; explicitly rejected.',
  'Fir polygon and wood candidates have CPU studio evidence, no new full-game GPU result.',
  'No runtime v2 material-key substitution or whole-tree runtime export.',
];
fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
console.log(`Finalized ${file}`);
