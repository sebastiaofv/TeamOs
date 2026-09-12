// scripts/extract-domain.mjs
// Usage: node scripts/extract-domain.mjs <module> <fnName> [<fnName>...] [--force] [--allow-unresolved]
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
//
//   --allow-unresolved: proceed even if an extracted function calls an
//            identifier (a plain function call, or a bare function reference
//            passed to .map/.filter/etc.) that does not resolve to: a
//            function already in the output module (this run's functions or
//            ones from earlier runs), a name the output module imports, or a
//            known JS/browser builtin (see GLOBAL_ALLOWLIST below). This is
//            OFF BY DEFAULT: an unresolved identifier means the extracted
//            code has a free variable that will throw
//            "ReferenceError: <name> is not defined" at runtime — Vite's
//            build does NOT catch this (it only bundles what each module
//            statically imports; it has no idea main.js used to provide
//            <name> as an ambient top-level function). Without this check a
//            broken extraction can pass `npm run build` and reach a commit
//            silently, surfacing only when a test happens to exercise that
//            code path — which is exactly what happened extracting
//            isTaskOverdue (called normalizeDueDate, left behind in main.js).
//            Use --allow-unresolved only when you are deliberately extracting
//            a function ahead of a dependency you will import by hand right
//            afterward; the script prints exactly which names it is letting
//            through so that promise is easy to keep honest.
//
//   On any abort (multiline-template guard or unresolved-identifier guard),
//   nothing is written: main.js keeps the function, the output module does
//   not gain a broken one. The two checks run in memory against the
//   candidate output before either file touches disk.
//
//   Circular imports between domain modules (serialize<->attachments,
//   board<->timeline, calendar<->roadmap, etc.) are expected and valid: ES
//   modules resolve cycles correctly for hoisted function declarations called
//   at runtime. This script does not detect or warn about cycles — an
//   import naming an unresolved-here identifier is trusted at face value,
//   regardless of whether the module it comes from imports back.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, relative } from 'node:path';

// ---------------------------------------------------------------------------
// Unresolved-callee detection
//
// Pragmatic, regex-based — not a real JS parser. It looks for identifiers
// used in "call position" (`name(`) or passed bare to a handful of common
// higher-order array methods (`.map(name)`), then subtracts everything that
// is locally declared inside the function, everything already resolvable in
// the destination module (sibling functions/consts, existing imports), and a
// curated allowlist of JS/browser builtins. Whatever remains is a free
// identifier that will throw a ReferenceError at runtime once the code that
// used to provide it (still in main.js, or not yet imported) is gone from
// scope. False alarms are preferred over silent misses, but keep the locals
// extraction reasonably thorough so real, well-formed code stays quiet.
// ---------------------------------------------------------------------------

// JS/browser builtins actually used across this codebase's extracted (or
// extractable) top-level functions. Extend this list by inspection as new
// extractions surface new globals — do not silently widen it to "anything
// capitalized", that defeats the point of the check.
export const GLOBAL_ALLOWLIST = new Set([
  // Constructors / namespace objects usable standalone (i.e. not only via
  // member access, though member-accessed usages like `Math.max(` never hit
  // this allowlist anyway since `.max` is filtered as a property access).
  'Number', 'String', 'Array', 'Object', 'JSON', 'Math', 'Date', 'Boolean',
  'Set', 'Map', 'WeakMap', 'WeakSet', 'RegExp', 'Error', 'TypeError',
  'RangeError', 'SyntaxError', 'Promise', 'Symbol', 'Proxy', 'Reflect',
  // Global functions.
  'isNaN', 'isFinite', 'parseInt', 'parseFloat',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
  'structuredClone', 'fetch', 'alert', 'confirm', 'prompt',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask',
  // Browser/runtime globals used standalone or as constructors.
  'crypto', 'console', 'document', 'window', 'localStorage', 'sessionStorage',
  'navigator', 'FileReader', 'Blob', 'File', 'URL', 'URLSearchParams',
  'TextEncoder', 'TextDecoder', 'CustomEvent', 'Event', 'AbortController',
  'Image', 'Audio'
]);

// Reserved words / control-flow keywords that can be immediately followed by
// `(` without being a function call (`if (`, `function (`, `catch (`, ...),
// plus a few that show up as bare "identifiers" in expressions (`this`,
// `undefined`, ...) which must never be treated as unresolved callees.
const RESERVED_WORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'with', 'function', 'return',
  'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'yield',
  'await', 'do', 'else', 'try', 'finally', 'throw', 'case', 'default',
  'class', 'extends', 'super', 'this', 'null', 'true', 'false', 'undefined',
  'break', 'continue', 'import', 'export', 'const', 'let', 'var', 'static',
  'get', 'set', 'async', 'debugger', 'arguments'
]);

// Strips comments and literal text so it can't be mistaken for code, while
// preserving everything that is actually an expression: single/double-
// quoted string *contents* are removed (the quotes stay, empty), and so is
// the plain-text portion of template literals — but a template literal's
// `${...}` substitutions are left intact, since they can contain genuine
// calls (e.g. `` `${formatThing(x)}` ``). This matters because CSS-ish
// template literals are common in this codebase (colour builders returning
// `` `hsl(${hue} 62% 95%)` ``) and `hsl(`/`calc(`/`rgb(` etc. are plain text,
// not calls — treating them as calls was a false positive that blocked a
// real extraction (createPortfolioProjectColor).
//
// This is a single left-to-right scan with a stack, rather than the
// sequential regex passes this function used to run, for two reasons: (1) a
// regex pass for comments run before the string-handling pass would
// wrongly treat `//` or `/* */` appearing inside a string as a real
// comment; scanning contextually avoids that. (2) template literals need
// state (are we in literal text, or inside a `${...}`?) that a stack
// tracks naturally, including a `${...}` that itself contains a *nested*
// template literal (`` `${`inner ${x}`}` ``) — entering the inner backtick
// pushes a new frame, popped when its own closing backtick is hit, which
// correctly resumes the outer `${...}` afterward.
//
// Deliberately NOT handled: regex literals (e.g. /hsl\(/). Telling a regex
// literal apart from the division operator requires knowing whether the
// previous token was an operand or an operator, which this lexical scanner
// does not track — doing it properly needs something close to a real
// parser. No extracted function in this codebase currently contains a
// regex literal; if one ever does and its pattern contains call-shaped
// text, this guard will (safely) over-report it as unresolved, same as any
// other false positive — annotate that call site or extract by hand.
function stripStringsAndComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  // Stack of open template literals. Top-of-stack `mode` is 'text' while
  // scanning the literal's plain text, or 'code' while inside its current
  // `${...}` substitution (in which case `depth` counts nested `{`/`}` so
  // the substitution's own closing `}` isn't mistaken for a nested one's).
  const templates = [];

  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    const top = templates[templates.length - 1];

    if (top && top.mode === 'text') {
      if (c === '\\') { i += 2; continue; } // escaped char: strip, never re-interpret
      if (c === '`') { templates.pop(); out += '`'; i++; continue; }
      if (c === '$' && c2 === '{') { top.mode = 'code'; top.depth = 0; out += '${'; i += 2; continue; }
      i++; continue; // literal text: stripped
    }

    // Here we're either at top level, or inside a template's `${...}` (code
    // mode) — both cases scan for comments/strings/nested-templates the
    // same way; the only extra work in code mode is brace-depth tracking so
    // the substitution's closing `}` is recognized instead of consumed as
    // ordinary code.
    if (top && top.mode === 'code') {
      if (c === '{') { top.depth++; }
      else if (c === '}') {
        if (top.depth === 0) { top.mode = 'text'; out += '}'; i++; continue; }
        top.depth--;
      }
    }

    if (c === '/' && c2 === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (c === '/' && c2 === '/') {
      const end = src.indexOf('\n', i + 2);
      i = end === -1 ? n : end;
      continue;
    }
    if (c === "'" || c === '"') {
      const quote = c;
      i++;
      while (i < n && src[i] !== quote) { i += src[i] === '\\' ? 2 : 1; }
      i++; // skip closing quote (or run off the end on unterminated input)
      out += quote + quote;
      continue;
    }
    if (c === '`') {
      templates.push({ mode: 'text' });
      out += '`';
      i++;
      continue;
    }

    out += c;
    i++;
  }
  return out;
}

function addIdentifiersFrom(set, chunk) {
  const matches = chunk.replace(/=(?!=|>)[^,]*/g, '').match(/[A-Za-z_$][\w$]*/g) || [];
  matches.forEach((name) => { if (!RESERVED_WORDS.has(name)) set.add(name); });
}

// Collects every name that is a local binding somewhere inside `code`:
// function params (including nested/inner function declarations and their
// own params), arrow function params, const/let/var declarations (including
// destructuring — handled by grabbing every identifier-shaped token on the
// LHS, which over-includes destructuring property keys but never
// under-includes a real binding), for-of/for-in/classic-for bindings, catch
// bindings, and class names. Over-inclusion here just means a rare false
// negative (a real dependency happens to share a name with a destructuring
// key elsewhere); under-inclusion would mean flagging code that's actually
// fine, which is the failure mode this function exists to avoid.
function extractLocalNames(code) {
  const locals = new Set();

  for (const m of code.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g)) {
    locals.add(m[1]);
    addIdentifiersFrom(locals, m[2]);
  }

  for (const m of code.matchAll(/\(([^()]*)\)\s*=>/g)) {
    addIdentifiersFrom(locals, m[1]);
  }
  for (const m of code.matchAll(/(?<![\w$)\].])([A-Za-z_$][\w$]*)\s*=>/g)) {
    if (!RESERVED_WORDS.has(m[1])) locals.add(m[1]);
  }

  for (const m of code.matchAll(/\bfor\s*\(\s*(?:const|let|var)\s+([^)]+?)\s+(?:of|in)\s+/g)) {
    addIdentifiersFrom(locals, m[1]);
  }
  for (const m of code.matchAll(/\bfor\s*\(\s*(?:const|let|var)\s+([^;]+);/g)) {
    addIdentifiersFrom(locals, m[1]);
  }

  for (const m of code.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g)) {
    locals.add(m[1]);
  }

  for (const m of code.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)) {
    locals.add(m[1]);
  }

  for (const m of code.matchAll(/\b(?:const|let|var)\s+([^=;\n]+?)\s*(?:=(?!=|>)|;|\n|$)/g)) {
    addIdentifiersFrom(locals, m[1]);
  }

  return locals;
}

// Identifiers used in literal call position: `name(...)`, excluding property
// accesses (`.name(`) and the name in a function declaration (`function
// name(`), which is a binding, not a call.
function extractCalledIdentifiers(code) {
  const called = new Set();
  const re = /([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(code))) {
    const name = m[1];
    if (RESERVED_WORDS.has(name)) continue;
    let idx = m.index - 1;
    while (idx >= 0 && /\s/.test(code[idx])) idx--;
    if (idx >= 0 && code[idx] === '.') continue;
    const before = code.slice(0, m.index);
    const prevWord = before.match(/([A-Za-z_$][\w$]*)\s*$/);
    if (prevWord && prevWord[1] === 'function') continue;
    called.add(name);
  }
  return called;
}

// Identifiers used as the base of a member expression: `Name.method(...)` or
// `Name.prop`. These are not in call position, so extractCalledIdentifiers
// misses them -- which is exactly how an extraction of savePortfolioBoardRecord
// shipped a module referencing an unimported `BoardRepository` and failed 32
// Playwright tests at runtime. Referencing an undefined identifier throws a
// ReferenceError whether you then call it or read a property off it.
//
// Restricted to PascalCase bases. Lowercase bases are overwhelmingly locals,
// parameters and builtins (`str.trim()`, `el.dataset`), and flagging those
// produces noise that trains people to ignore the guard.
function extractMemberBaseIdentifiers(code) {
  const names = new Set();
  const re = /([A-Z][A-Za-z0-9_$]*)\s*\./g;
  let m;
  while ((m = re.exec(code))) {
    const name = m[1];
    if (RESERVED_WORDS.has(name)) continue;
    let idx = m.index - 1;
    while (idx >= 0 && /\s/.test(code[idx])) idx--;
    // skip `foo.Bar.baz` -- Bar is a property, not a free identifier
    if (idx >= 0 && code[idx] === '.') continue;
    // skip `new Foo.Bar()` style and declarations
    const before = code.slice(0, m.index);
    const prevWord = before.match(/([A-Za-z_$][\w$]*)\s*$/);
    if (prevWord && (prevWord[1] === 'function' || prevWord[1] === 'class')) continue;
    names.add(name);
  }
  return names;
}

// Bare function references handed to common higher-order array methods, e.g.
// `list.map(normalizeAttachmentRecord)`. These never appear in `name(` call
// position themselves, but referencing an undefined identifier at all throws
// a ReferenceError — same failure mode as an unresolved call — so they need
// to be caught too, not just literal calls.
function extractHofCallbackIdentifiers(code) {
  const names = new Set();
  const re = /\.(?:map|filter|forEach|find|findIndex|some|every|reduce|reduceRight|flatMap|sort)\(\s*([A-Za-z_$][\w$]*)\s*[,)]/g;
  let m;
  while ((m = re.exec(code))) {
    if (!RESERVED_WORDS.has(m[1])) names.add(m[1]);
  }
  return names;
}

// Top-level names a module source already provides: function/const/let/var/
// class declarations, exported or not.
export function parseModuleDeclaredNames(source) {
  const names = new Set();
  for (const m of source.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of source.matchAll(/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of source.matchAll(/^(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  return names;
}

// Local names a module source's own `import` statements bring into scope
// (named, default, namespace, and `as`-aliased named imports).
export function parseModuleImportedNames(source) {
  const names = new Set();
  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (!/^import\s/.test(line)) continue;
    const named = line.match(/\{([^}]*)\}/);
    if (named) {
      named[1].split(',').forEach((part) => {
        const piece = part.trim();
        if (!piece) return;
        const asMatch = piece.match(/\bas\s+([A-Za-z_$][\w$]*)/);
        const localName = asMatch ? asMatch[1] : piece.split(/\s+/)[0];
        if (localName) names.add(localName);
      });
    }
    const def = line.match(/^import\s+([A-Za-z_$][\w$]*)\s*(?:,|from)/);
    if (def) names.add(def[1]);
    const ns = line.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
    if (ns) names.add(ns[1]);
  }
  return names;
}

// Given the full source of one extracted function (already dedented, with
// `export` applied) and the set of names already resolvable in the
// destination module (sibling declarations + its imports + the other
// functions extracted alongside this one in the same run), returns the list
// of called identifiers that resolve to none of: a local binding inside the
// function, a resolvable module name, or a builtin.
export function findUnresolvedCallees(fnSource, resolvedNames) {
  const stripped = stripStringsAndComments(fnSource);
  const locals = extractLocalNames(stripped);
  const called = new Set([
    ...extractCalledIdentifiers(stripped),
    ...extractHofCallbackIdentifiers(stripped),
    ...extractMemberBaseIdentifiers(stripped)
  ]);
  const unresolved = [];
  for (const name of called) {
    if (locals.has(name)) continue;
    if (resolvedNames.has(name)) continue;
    if (GLOBAL_ALLOWLIST.has(name)) continue;
    unresolved.push(name);
  }
  return unresolved.sort();
}

// ---------------------------------------------------------------------------
// CLI
//
// Guarded so this file can also be `import`ed (e.g. by a verification
// harness that wants to reuse findUnresolvedCallees/parseModule*Names
// against arbitrary source) without triggering an extraction run.
// ---------------------------------------------------------------------------

import { fileURLToPath } from 'node:url';

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  runCli();
}

function runCli() {

const rawArgs = process.argv.slice(2);
const force = rawArgs.includes('--force');
const allowUnresolved = rawArgs.includes('--allow-unresolved');
const [moduleName, ...fnNames] = rawArgs.filter((a) => a !== '--force' && a !== '--allow-unresolved');
if (!moduleName || fnNames.length === 0) {
  console.error('Usage: node scripts/extract-domain.mjs <module> <fnName>... [--force] [--allow-unresolved]');
  process.exit(1);
}

const MAIN = 'src/legacy/main.js';
// A module name may carry a directory, e.g. "persistence/projectFiles", to
// target a layer other than src/domain (the default for a bare name).
const OUT = moduleName.includes('/')
  ? `src/${moduleName}.js`
  : `src/domain/${moduleName}.js`;
const lines = readFileSync(MAIN, 'utf8').split('\n');
const existingOutSource = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';

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

// Unresolved-callee check: run against the candidate output before anything
// is written. `resolvedNames` is everything the destination module will be
// able to see once this run's functions land in it: names it already
// declares, names it already imports, and the sibling functions extracted
// together in this same invocation.
const resolvedNames = new Set([
  ...parseModuleDeclaredNames(existingOutSource),
  ...parseModuleImportedNames(existingOutSource),
  ...fnNames
]);

const unresolvedByFn = fnNames.map((fn, i) => ({
  fn,
  names: findUnresolvedCallees(extracted[i], resolvedNames)
})).filter((entry) => entry.names.length > 0);

if (unresolvedByFn.length > 0) {
  if (!allowUnresolved) {
    console.error('ABORT: extracted code calls identifiers that are not defined in the output module,');
    console.error(`imported by it, or a known builtin — they are almost certainly still in ${MAIN}.`);
    console.error('Vite will NOT catch this (the build only checks static imports it can see); it would');
    console.error('surface as a runtime "ReferenceError: <name> is not defined", and only if a test');
    console.error('happens to exercise that code path. Nothing has been written.');
    unresolvedByFn.forEach(({ fn, names }) => {
      names.forEach((name) => console.error(`  UNRESOLVED: ${name} (called in ${fn})`));
    });
    console.error('Move the missing function(s) first, import them manually and re-run with');
    console.error('--allow-unresolved, or extract this function together with its dependency.');
    process.exit(1);
  }
  console.warn('--allow-unresolved: proceeding despite unresolved identifiers. Permitting:');
  unresolvedByFn.forEach(({ fn, names }) => {
    names.forEach((name) => console.warn(`  ALLOWED UNRESOLVED: ${name} (called in ${fn})`));
  });
}

mkdirSync(dirname(OUT), { recursive: true });
const header = existingOutSource ? existingOutSource.trimEnd() + '\n\n' : '';
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

}
