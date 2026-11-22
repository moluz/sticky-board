/**
 * Heuristic static check for the browser half.
 *
 * The panel once blanked because a `useEffect` deps array referenced a `const`
 * declared later in the same function: deps arrays are evaluated during render,
 * so it threw a TDZ ReferenceError and the host cleared the slot. `node --check`
 * cannot see that, and neither can a plain grep. This script walks every
 * `}, [deps])` pair and reports deps whose declaration line comes AFTER the
 * hook, which is exactly the shape of that bug.
 *
 *   node scripts/lint-client.mjs [file]
 *
 * Exported as `lintSource` so `node --test` can pin the detection itself.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const HOOK_CALL = /\b(useEffect|useCallback|useMemo|useLayoutEffect)\s*\(/g;
const DEPS_TAIL = /\},\s*\[([^\[\]]*)\]\s*\)/g;
const DECLARATION = /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/;
const ARRAY_DECLARATION = /^\s*(?:const|let|var)\s+\[([^\]]+)\]\s*=/;
const FUNCTION_DECLARATION = /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/;

/** Build a map of identifier → first declaration line (1-based). */
function collectDeclarations(lines) {
  const declarations = new Map();
  const remember = (name, line) => {
    const clean = name.trim();
    if (!IDENTIFIER.test(clean)) return;
    const seen = declarations.get(clean);
    if (seen === undefined || line < seen) declarations.set(clean, line);
  };
  lines.forEach((text, index) => {
    const line = index + 1;
    const single = DECLARATION.exec(text);
    if (single !== null) remember(single[1], line);
    const array = ARRAY_DECLARATION.exec(text);
    if (array !== null) {
      for (const part of array[1].split(',')) remember(part, line);
    }
    const fn = FUNCTION_DECLARATION.exec(text);
    if (fn !== null) remember(fn[1], line);
  });
  return declarations;
}

/** Line number (1-based) of a character offset. */
function lineOf(source, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

/**
 * Report deps arrays that reference a later declaration.
 * @param source - whole file text.
 * @param fileName - label used in messages.
 * @returns array of `{ line, hook, dep, declaredAt }` problems.
 */
export function lintSource(source, fileName = 'client.js') {
  const lines = source.split(/\r?\n/);
  const declarations = collectDeclarations(lines);
  const problems = [];

  // Every hook call start, so the deps tail can be attributed to a hook.
  const hooks = [];
  HOOK_CALL.lastIndex = 0;
  let hookMatch;
  while ((hookMatch = HOOK_CALL.exec(source)) !== null) {
    hooks.push({ name: hookMatch[1], line: lineOf(source, hookMatch.index) });
  }

  DEPS_TAIL.lastIndex = 0;
  let depsMatch;
  while ((depsMatch = DEPS_TAIL.exec(source)) !== null) {
    const depsLine = lineOf(source, depsMatch.index);
    // The enclosing hook is the closest hook call at or before this deps tail.
    let hook = null;
    for (const candidate of hooks) {
      if (candidate.line <= depsLine) hook = candidate;
      else break;
    }
    if (hook === null) continue;
    const deps = depsMatch[1]
      .split(',')
      .map((dep) => dep.trim())
      .filter((dep) => IDENTIFIER.test(dep));
    for (const dep of deps) {
      const declaredAt = declarations.get(dep);
      if (declaredAt !== undefined && declaredAt > hook.line) {
        problems.push({ file: fileName, line: hook.line, hook: hook.name, dep, declaredAt });
      }
    }
  }
  return problems;
}

/** Run over one file and print a readable report; exit non-zero on problems. */
async function main() {
  const target = process.argv[2] ?? 'client.js';
  const filePath = path.resolve(target);
  const source = await readFile(filePath, 'utf8');
  const problems = lintSource(source, path.basename(filePath));
  if (problems.length === 0) {
    console.log(`lint-client: ${path.basename(filePath)} ok (no hook-deps/declaration order issues)`);
    return;
  }
  for (const problem of problems) {
    console.error(
      `lint-client: ${problem.file}:${problem.line} ${problem.hook} deps reference "${problem.dep}" declared later at line ${problem.declaredAt}`,
    );
  }
  process.exitCode = 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
