// scripts/extract-domain.mjs
// Usage: node scripts/extract-domain.mjs <module> <fnName> [<fnName>...] [--force]
//   --force: proceed even if an extracted function contains a template literal
//            (backtick). Without --force, the script exits non-zero and writes
//            nothing if any named function contains a backtick, because
//            dedenting by 8 spaces silently changes the content of a template
//            literal that spans multiple lines.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, relative } from 'node:path';

const rawArgs = process.argv.slice(2);
const force = rawArgs.includes('--force');
const [moduleName, ...fnNames] = rawArgs.filter((a) => a !== '--force');
if (!moduleName || fnNames.length === 0) {
  console.error('Usage: node scripts/extract-domain.mjs <module> <fnName>... [--force]');
  process.exit(1);
}

const MAIN = 'src/legacy/main.js';
const OUT = `src/domain/${moduleName}.js`;
const lines = readFileSync(MAIN, 'utf8').split('\n');

const extracted = [];
const warnings = [];
let hasTemplateLiteral = false;

for (const fn of fnNames) {
  const start = lines.findIndex((l) => new RegExp(`^        (async )?function ${fn}\\(`).test(l));
  if (start === -1) { console.error(`NOT FOUND: ${fn}`); process.exit(1); }
  // Top-level functions close with a '}' at exactly 8 spaces of indent.
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i] === '        }') { end = i; break; }
  }
  if (end === -1) { console.error(`NO CLOSE: ${fn}`); process.exit(1); }

  const body = lines.slice(start, end + 1);
  if (body.some((l) => l.includes('`'))) {
    hasTemplateLiteral = true;
    warnings.push(`${fn}: contains a template literal — verify dedent did not change output`);
  }
  // Dedent by exactly 8 spaces; safe because domain functions are pure logic.
  const dedented = body.map((l) => (l.startsWith('        ') ? l.slice(8) : l));
  dedented[0] = dedented[0].replace(/^(async )?function /, 'export $1function ');
  extracted.push(dedented.join('\n'));

  lines.splice(start, end - start + 1);
}

if (hasTemplateLiteral && !force) {
  console.error('ABORT: one or more extracted functions contain a template literal.');
  console.error('Dedenting by 8 spaces changes template-literal content (leading whitespace');
  console.error('inside a template literal is string content). Re-run with --force to proceed');
  console.error('anyway (the warning below will still print, and you must verify the output).');
  warnings.forEach((w) => console.warn('WARN ' + w));
  process.exit(1);
}

mkdirSync(dirname(OUT), { recursive: true });
const header = existsSync(OUT) ? readFileSync(OUT, 'utf8').trimEnd() + '\n\n' : '';
writeFileSync(OUT, header + extracted.join('\n\n') + '\n');

// Insert the import after the existing import block at the top of main.js,
// merging into an existing import from the same module path if present.
const relImportPath = relative(dirname(MAIN), OUT).split(/[\\/]/).join('/');
const importPath = relImportPath.startsWith('.') ? relImportPath : './' + relImportPath;
const existingImportRe = new RegExp(
  `^import \\{ ([^}]*) \\} from '${importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}';$`
);
let merged = false;
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(existingImportRe);
  if (m) {
    const existingNames = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    const allNames = [...new Set([...existingNames, ...fnNames])];
    lines[i] = `import { ${allNames.join(', ')} } from '${importPath}';`;
    merged = true;
    break;
  }
}
if (!merged) {
  let lastImport = 0;
  for (let i = 0; i < 40; i++) if (lines[i]?.startsWith('import ')) lastImport = i;
  lines.splice(lastImport + 1, 0,
    `import { ${fnNames.join(', ')} } from '${importPath}';`);
}
writeFileSync(MAIN, lines.join('\n'));

console.log(`Extracted ${fnNames.length} fn(s) to ${OUT}`);
warnings.forEach((w) => console.warn('WARN ' + w));
