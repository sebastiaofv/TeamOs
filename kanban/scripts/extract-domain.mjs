// scripts/extract-domain.mjs
// Usage: node scripts/extract-domain.mjs <module> <fnName> [<fnName>...]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const [moduleName, ...fnNames] = process.argv.slice(2);
if (!moduleName || fnNames.length === 0) {
  console.error('Usage: node scripts/extract-domain.mjs <module> <fnName>...');
  process.exit(1);
}

const MAIN = 'src/legacy/main.js';
const OUT = `src/domain/${moduleName}.js`;
const lines = readFileSync(MAIN, 'utf8').split('\n');

const extracted = [];
const warnings = [];

for (const fn of fnNames) {
  const start = lines.findIndex((l) => l.startsWith(`        function ${fn}(`));
  if (start === -1) { console.error(`NOT FOUND: ${fn}`); process.exit(1); }
  // Top-level functions close with a '}' at exactly 8 spaces of indent.
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i] === '        }') { end = i; break; }
  }
  if (end === -1) { console.error(`NO CLOSE: ${fn}`); process.exit(1); }

  const body = lines.slice(start, end + 1);
  if (body.some((l) => l.includes('`'))) {
    warnings.push(`${fn}: contains a template literal — verify dedent did not change output`);
  }
  // Dedent by exactly 8 spaces; safe because domain functions are pure logic.
  const dedented = body.map((l) => (l.startsWith('        ') ? l.slice(8) : l));
  dedented[0] = dedented[0].replace(/^function /, 'export function ');
  extracted.push(dedented.join('\n'));

  lines.splice(start, end - start + 1);
}

const header = existsSync(OUT) ? readFileSync(OUT, 'utf8').trimEnd() + '\n\n' : '';
writeFileSync(OUT, header + extracted.join('\n\n') + '\n');

// Insert the import after the existing import block at the top of main.js.
let lastImport = 0;
for (let i = 0; i < 40; i++) if (lines[i]?.startsWith('import ')) lastImport = i;
lines.splice(lastImport + 1, 0,
  `import { ${fnNames.join(', ')} } from '../domain/${moduleName}.js';`);
writeFileSync(MAIN, lines.join('\n'));

console.log(`Extracted ${fnNames.length} fn(s) to ${OUT}`);
warnings.forEach((w) => console.warn('WARN ' + w));
