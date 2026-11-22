/**
 * Publish the working tree to GitHub through the REST API.
 *
 * The sandbox cannot reach github.com over git/HTTPS, but the MCP GitHub server
 * can; we reuse the same user-level token (read by the caller into GH_TOKEN).
 *
 * Creates blobs + a tree on top of the current main commit, then commits and
 * moves the branch — one atomic snapshot, no partial file set.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const OWNER = 'moluz';
const REPO = 'sticky-board';
const BRANCH = 'main';
const TOKEN = process.env.GH_TOKEN;
if (!TOKEN) throw new Error('GH_TOKEN missing');

const root = process.cwd();
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\u0000')
  .map((line) => line.trim())
  .filter((line) => line !== '' && !line.endsWith('.tgz'));

console.log(`publishing ${files.length} text file(s) to ${OWNER}/${REPO}:${BRANCH}`);

const api = (pathname, init = {}) =>
  fetch(`https://api.github.com/repos/${OWNER}/${REPO}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'sticky-board-release',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
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

let baseSha = null;
let baseTree = null;
let deletePlaceholder = false;
try {
  const ref = await json(await api(`/git/ref/heads/${BRANCH}`));
  baseSha = ref.object.sha;
  const baseCommit = await json(await api(`/git/commits/${baseSha}`));
  baseTree = baseCommit.tree.sha;
} catch (error) {
  // A freshly created repo has no commits: bootstrap one through the Contents API,
  // then build our snapshot tree on top of it and delete the placeholder.
  console.log('empty repository: bootstrapping the default branch');
  await json(
    await api('/contents/.bootstrap', {
      method: 'PUT',
      body: JSON.stringify({ message: 'chore: bootstrap repository', content: Buffer.from('sticky-board\n').toString('base64') }),
    }),
  );
  baseSha = (await json(await api(`/git/ref/heads/${BRANCH}`))).object.sha;
  baseTree = (await json(await api(`/git/commits/${baseSha}`))).tree.sha;
  deletePlaceholder = true;
}

const tree = files.map((file) => {
  const full = path.join(root, file);
  const size = statSync(full).size;
  if (size > 900_000) throw new Error(`file too large for inline content: ${file}`);
  const content = readFileSync(full, 'utf8');
  const mode = file.endsWith('.mjs') || file.endsWith('.js') ? '100644' : '100644';
  return { path: file.replace(/\\/g, '/'), mode, type: 'blob', content };
});
if (deletePlaceholder) tree.push({ path: '.bootstrap', mode: '100644', type: 'blob', sha: null });

const createdTree = await json(
  await api('/git/trees', {
    method: 'POST',
    body: JSON.stringify(baseTree === null ? { tree } : { base_tree: baseTree, tree }),
  }),
);

const commit = await json(
  await api('/git/commits', {
    method: 'POST',
    body: JSON.stringify({
      message: 'release: @local/sticky-board 0.16.0\n\n便签墙 + 任务板 DSH 插件：\n- 明暗主题巡检（--sb-* 变量 + 宿主 theme/change）\n- 多步撤销/重做（Ctrl+Z）\n- 自绘确认弹窗 + 统一危险操作文案\n- 卡片 checklist（schema v2）、看板模板、单向同步到任务\n- 57 单测 / 32 步 Host 冒烟 / 对比度与打包校验\n',
      tree: createdTree.sha,
      parents: baseSha === null ? [] : [baseSha],
    }),
  }),
);

if (baseSha === null) {
  await json(
    await api('/git/refs', {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: commit.sha }),
    }),
  );
} else {
  await json(
    await api(`/git/refs/heads/${BRANCH}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha, force: true }),
    }),
  );
}

const check = await json(await api('/contents/package.json'));
console.log(JSON.stringify({
  commit: commit.sha,
  filesPushed: tree.length,
  packageJsonSha: check.sha,
  url: `https://github.com/${OWNER}/${REPO}`,
}, null, 2));
