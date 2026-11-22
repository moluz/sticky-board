/**
 * Validate what `npm pack` would ship, without invoking npm.
 *
 * `files` in package.json is only advisory: a linked checkout ignores it, so
 * the first packed release is where a wrong entry (e.g. a glob that does not
 * expand) shows up. This checks every `files` entry resolves to at least one
 * real file and prints the expected set.
 *
 *   node scripts/pack-check.mjs
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const entries = Array.isArray(manifest.files) ? manifest.files : [];

const problems = [];
const picked = [];

/** True when the path is a directory. */
async function isDirectory(target) {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

for (const entry of entries) {
  const target = path.join(root, entry);
  if (await isDirectory(target)) {
    const children = await readdir(target, { withFileTypes: true });
    const files = children.filter((child) => child.isFile()).map((child) => `${entry}/${child.name}`);
    if (files.length === 0) problems.push(`files entry "${entry}" is an empty directory`);
    picked.push(...files);
    continue;
  }
  try {
    await stat(target);
    picked.push(entry);
  } catch {
    problems.push(`files entry "${entry}" does not exist`);
  }
}

// Entries npm always adds for a packed tarball.
const always = ['package.json'];
for (const name of ['README.md', 'LICENSE']) {
  try {
    await stat(path.join(root, name));
    always.push(name);
  } catch {
    // optional
  }
}
picked.push(...always);

// Runtime files the plugin cannot work without.
const required = ['index.js', 'client.js', 'cordis.patch.yml', 'icon.svg', 'lib/route.js', 'lib/repository.js'];
for (const name of required) {
  if (!picked.includes(name)) problems.push(`runtime file "${name}" is not covered by files`);
}

const unique = [...new Set(picked)].sort();
console.log(`pack-check: ${unique.length} file(s) would ship:`);
for (const name of unique) console.log(`  ${name}`);

if (problems.length > 0) {
  for (const problem of problems) console.error(`pack-check: ${problem}`);
  process.exitCode = 1;
}
