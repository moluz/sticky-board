/**
 * Publish a GitHub Release for the current version and upload the local
 * release artifacts (tarball + checksums + notes) as release assets.
 *
 *   GH_TOKEN=... node scripts/create-release.mjs
 *
 * The sandbox cannot reach github.com with git, so this uses the REST API the
 * same way scripts/publish-github.mjs does.
 */
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const OWNER = 'moluz';
const REPO = 'sticky-board';
const VERSION = '0.16.0';
const TAG = `v${VERSION}`;
const TOKEN = process.env.GH_TOKEN;
if (!TOKEN) throw new Error('GH_TOKEN missing');

const root = process.cwd();
const artifacts = [
  `releases/local-sticky-board-${VERSION}.tgz`,
  'releases/SHA256SUMS',
  'releases/RELEASE-NOTES.md',
];
const notes = readFileSync(path.join(root, 'releases/RELEASE-NOTES.md'), 'utf8');

const apiHeaders = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'sticky-board-release',
  'Content-Type': 'application/json',
};

const api = (pathname, init = {}) =>
  fetch(`https://api.github.com/repos/${OWNER}/${REPO}${pathname}`, {
    ...init,
    headers: { ...apiHeaders, ...(init.headers ?? {}) },
  });

async function json(response) {
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!response.ok) throw new Error(`${response.status} ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  return body;
}

// Topics (idempotent: replaces the list).
const topics = await json(
  await api('/topics', {
    method: 'PUT',
    body: JSON.stringify({
      names: ['deepseek-harness', 'dsh-plugin', 'cordis', 'kanban', 'sticky-notes', 'task-board', 'plugin'],
    }),
  }),
);
console.log('topics:', topics.names.join(', '));

// Create (or reuse) the release.
let release;
try {
  release = await json(await api(`/releases/tags/${TAG}`));
  console.log('release exists:', release.html_url);
} catch {
  release = await json(
    await api('/releases', {
      method: 'POST',
      body: JSON.stringify({
        tag_name: TAG,
        name: `${TAG} — 便签墙 + 任务板`,
        body: notes,
        draft: false,
        prerelease: false,
      }),
    }),
  );
  console.log('release created:', release.html_url);
}

// Upload the artifacts (skip ones already present, matched by name).
const existing = await json(await api(`/releases/${release.id}/assets`));
const uploaded = [];
for (const relative of artifacts) {
  const name = path.basename(relative);
  if (existing.some((asset) => asset.name === name)) {
    uploaded.push({ name, skipped: true });
    continue;
  }
  const file = readFileSync(path.join(root, relative));
  const response = await fetch(
    `https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/octet-stream',
        'User-Agent': 'sticky-board-release',
      },
      body: file,
    },
  );
  const asset = await json(response);
  uploaded.push({ name, size: asset.size, url: asset.browser_download_url });
  console.log(`uploaded ${name} (${asset.size} bytes)`);
}

console.log(JSON.stringify({
  release: release.html_url,
  tag: release.tag_name,
  assets: uploaded,
}, null, 2));
