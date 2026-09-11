// scripts/extract-domain.mjs
// Usage: node scripts/extract-domain.mjs <module> <fnName> [<fnName>...] [--force]
//   --force: proceed even if an extracted function contains a template literal
//            that spans multiple lines. Without --force, the script exits
//            non-zero and writes nothing if any named function has a line with
//            an odd number of backticks — that means a template literal opens
//            on that line and does not close on it, i.e. it spans lines, and
//            dedenting by 8 spaces would silently change its content (leading
//            whitespace inside a template literal is string content). A line
//            with an even number of backticks only contains template literals
//            that open and close on that same line, which dedenting cannot
//            corrupt, so such lines are safe and do not trigger the guard.
//   Known limitations:
//   1. A ${...} substitution breaks the simple parity model: a line like
//      `` `a ${`b `` has two backticks (even) yet ends inside a template
//      literal that continues on the next line. A nested literal that opens
//      and closes within the same ${...} on one line is fine — parity holds
//      and dedenting it is safe; it's a substitution left open across lines
//      that fools the count. No function in this file does that today.
//   2. An escaped backtick (\`) is not a delimiter, so the backtick count is
//      taken on each line with backslash-escape pairs stripped first — see
//      countBackticks() below. Without that, an escaped backtick would be
//      counted as real, which can flip an odd (unsafe) count to an even
//      (apparently safe) one and let a multi-line literal through undetected.
//   In either case, if a function is ever miscounted, --force remains
//   available after manual verification.
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

// Counts only backticks that are real template-literal delimiters. Strips
// backslash-escape pairs first (not just \`) because a literal \\ immediately
// before a backtick would otherwise mislead a narrower \`-only strip.
function countBackticks(line) {
  return (line.replace(/\\./g, '').match(/`/g) || []).length;
}

const extracted = [];
const warnings = [];
let hasMultilineTemplateLiteral = false;

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
  // A line with an odd number of (real, non-escaped) backticks opens a
  // template literal that does not close on the same line, i.e. it spans
  // multiple lines — exactly the case where dedenting by 8 spaces would
  // corrupt string content.
  if (body.some((l) => countBackticks(l) % 2 !== 0)) {
    hasMultilineTemplateLiteral = true;
    warnings.push(`${fn}: a line has an odd number of backticks — a template literal spans multiple lines; verify dedent did not change output`);
  }
  // Dedent by exactly 8 spaces; safe because domain functions are pure logic.
  const dedented = body.map((l) => (l.startsWith('        ') ? l.slice(8) : l));
  dedented[0] = dedented[0].replace(/^(async )?function /, 'export $1function ');
  extracted.push(dedented.join('\n'));

  lines.splice(start, end - start + 1);
}

if (hasMultilineTemplateLiteral && !force) {
  console.error('ABORT: one or more extracted functions contain a template literal that spans multiple lines.');
  console.error('A line with an odd number of backticks opens a template literal without closing it on');
  console.error('the same line, so dedenting by 8 spaces changes its content (leading whitespace inside a');
  console.error('template literal is string content). Re-run with --force to proceed anyway (the warning');
  console.error('below will still print, and you must verify the output).');
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
