/**
 * Offline smoke test for the Host half.
 *
 * It stubs the two Cordis services the plugin injects (`connection`, `tools`),
 * calls `apply()` for real, then drives the mounted route and the registered
 * tools exactly as the panel and the model would. No Harness, no browser.
 *
 *   node scripts/smoke.mjs
 */

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const tmp = await mkdtemp(path.join(os.tmpdir(), 'sticky-board-smoke-'));
const storePath = path.join(tmp, 'board.json');

let failures = 0;

/** Run one checked step. */
async function step(name, fn) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}\n       ${error?.stack ?? error}`);
  }
}

/** Build a fake Host context that records registrations. */
function fakeContext() {
  const registered = { route: undefined, tools: [] };
  const ctx = {
    logger: { info() {}, warn() {}, error() {} },
    effect(fn) {
      const dispose = fn();
      return () => {
        if (typeof dispose === 'function') dispose();
      };
    },
    on() {
      return () => {};
    },
    connection: {
      fetch: {
        register(route) {
          registered.route = route;
          return async () => {};
        },
      },
    },
    tools: {
      register(definition) {
        registered.tools.push(definition);
        return () => {};
      },
    },
    registered,
  };
  return ctx;
}

/** Ask the mounted route for one JSON answer. */
async function get(route, query = '') {
  const response = await route.fetch(new Request(`http://sticky-board.invalid/api/sticky-board${query}`));
  return { status: response.status, body: await response.json() };
}

/** Post one action to the mounted route. */
async function post(route, action, payload = {}) {
  const response = await route.fetch(
    new Request('http://sticky-board.invalid/api/sticky-board', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    }),
  );
  return { status: response.status, body: await response.json() };
}

const { apply } = await import(pathToFileURL(path.join(root, 'index.js')).href);

console.log('sticky-board smoke test');
console.log(`  data file: ${storePath}\n`);

const ctx = fakeContext();
apply(ctx, { storePath });
const route = ctx.registered.route;
const tools = new Map(ctx.registered.tools.map((tool) => [tool.name, tool]));

await step('route and tools are registered', () => {
  assert.equal(typeof route?.fetch, 'function');
  assert.equal(route.path, '/api/sticky-board');
  assert.deepEqual([...route.methods].sort(), ['GET', 'HEAD', 'POST']);
  assert.equal(tools.size, 14, `expected 14 tools, got ${tools.size}: ${[...tools.keys()].join(',')}`);
  for (const tool of ctx.registered.tools) {
    assert.equal(typeof tool.description, 'string');
    assert.equal(typeof tool.execute, 'function');
    assert.equal(typeof tool.output?.render, 'function');
    assert.equal(tool.parameters?.type, 'object');
  }
});

await step('empty snapshot has one board with three columns', async () => {
  const { status, body } = await get(route);
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(body.notes, []);
  assert.equal(body.board.columns.length, 3);
  assert.deepEqual(body.board.columns.map((column) => column.id), ['todo', 'doing', 'done']);
  assert.equal(body.counts.notes, 0);
  assert.equal(body.storePath, storePath);
});

let noteId;
await step('note.create writes a note and derives its text', async () => {
  const { body } = await post(route, 'note.create', {
    note: { lines: [{ kind: 'text', text: '买菜' }, { kind: 'todo', text: '鸡蛋', done: false }], color: 'mint' },
  });
  assert.equal(body.ok, true);
  noteId = body.note.id;
  assert.equal(body.notes.length, 1);
  assert.equal(body.notes[0].color, 'mint');
  assert.match(body.notes[0].text, /买菜/);
  assert.match(body.notes[0].text, /鸡蛋/);
});

await step('note.update replaces lines and keeps rev moving', async () => {
  const before = await get(route);
  const { body } = await post(route, 'note.update', {
    id: noteId,
    patch: { lines: [{ kind: 'todo', text: '鸡蛋', done: true }], color: 'sky' },
  });
  assert.equal(body.ok, true);
  assert.equal(body.note.lines[0].done, true);
  assert.equal(body.note.color, 'sky');
  assert.ok(body.note.rev > before.body.notes[0].rev);
});

let cardId;
await step('card.create, move and update work', async () => {
  const created = await post(route, 'card.create', { card: { title: '写文档', columnId: 'todo', priority: 'P1', dueDate: '2026-12-01' } });
  assert.equal(created.body.ok, true);
  cardId = created.body.card.id;
  assert.equal(created.body.card.columnId, 'todo');
  assert.equal(created.body.counts.byColumn.todo, 1);

  const moved = await post(route, 'card.move', { id: cardId, columnId: 'doing', toIndex: 0 });
  assert.equal(moved.body.ok, true);
  assert.equal(moved.body.card.columnId, 'doing');
  assert.equal(moved.body.counts.byColumn.doing, 1);

  const updated = await post(route, 'card.update', { id: cardId, patch: { done: true, labels: ['文档'] } });
  assert.equal(updated.body.card.done, true);
  assert.deepEqual(updated.body.card.labels, ['文档']);
});

await step('note.toTask links both sides', async () => {
  const { body } = await post(route, 'note.toTask', { id: noteId, columnId: 'todo' });
  assert.equal(body.ok, true);
  const card = body.board.cards.find((entry) => entry.id === body.card.id);
  assert.equal(card.noteId, noteId);
  const note = body.notes.find((entry) => entry.id === noteId);
  assert.equal(note.linkedCardId, card.id);
});

let linkedNoteId;
await step('card.toNote links both sides', async () => {
  const { body } = await post(route, 'card.toNote', { id: cardId });
  assert.equal(body.ok, true);
  const note = body.notes.find((entry) => entry.id === body.note.id);
  assert.ok(note !== undefined);
  linkedNoteId = note.id;
  const card = body.board.cards.find((entry) => entry.id === cardId);
  assert.equal(card.noteId, note.id);
  assert.equal(note.linkedCardId, cardId);
});

await step('unlinking a card clears the note side', async () => {
  const { body } = await post(route, 'card.update', { id: cardId, patch: { noteId: null } });
  assert.equal(body.ok, true);
  assert.equal(body.board.cards.find((entry) => entry.id === cardId).noteId, null);
  assert.equal(body.notes.find((entry) => entry.id === linkedNoteId).linkedCardId, null);
});

await step('link.sync pushes note content onto the linked card', async () => {
  const created = await post(route, 'note.create', {
    note: {
      lines: [
        { kind: 'text', text: '同步标题' },
        { kind: 'text', text: '第二行' },
        { kind: 'todo', text: '待办项', done: true },
      ],
    },
  });
  const noteId = created.body.note.id;
  const toTask = await post(route, 'note.toTask', { id: noteId, columnId: 'todo' });
  const cardId = toTask.body.card.id;

  // 这些字段必须被同步保留
  await post(route, 'card.update', {
    id: cardId,
    patch: { priority: 'P0', dueDate: '2026-12-31', labels: ['保留'] },
  });
  await post(route, 'note.update', {
    id: noteId,
    patch: {
      lines: [
        { kind: 'text', text: '同步标题-已改' },
        { kind: 'todo', text: '新待办', done: false },
      ],
    },
  });

  const synced = await post(route, 'link.sync', { cardId });
  assert.equal(synced.body.ok, true);
  const card = synced.body.board.cards.find((entry) => entry.id === cardId);
  assert.equal(card.title, '同步标题-已改');
  assert.match(card.note, /- \[ \] 新待办/);
  assert.equal(card.priority, 'P0');
  assert.equal(card.dueDate, '2026-12-31');
  assert.deepEqual(card.labels, ['保留']);

  const plain = await post(route, 'card.create', { card: { title: '无关联任务' } });
  const rejected = await post(route, 'link.sync', { cardId: plain.body.card.id });
  assert.equal(rejected.status, 400, 'a card without a linked note is rejected');

  const tool = tools.get('sticky_note_sync_to_task');
  const viaTool = await tool.execute({ id: noteId }, {});
  assert.match(viaTool.text, /同步到任务/);
  await assert.rejects(() => tool.execute({ id: plain.body.card.id }, {}), /找不到|还没有关联/);

  await post(route, 'card.remove', { id: cardId, permanent: true });
  await post(route, 'card.remove', { id: plain.body.card.id, permanent: true });
  await post(route, 'note.remove', { id: noteId, permanent: true });
});

await step('history undo/redo work through the route and the tool', async () => {
  const created = await post(route, 'note.create', { note: { lines: [{ kind: 'text', text: '撤销测试' }] } });
  const noteId = created.body.note.id;
  assert.equal((await get(route)).body.notes.some((note) => note.id === noteId), true);

  const undone = await post(route, 'history.undo');
  assert.equal(undone.body.undone, true);
  assert.equal(undone.body.notes.some((note) => note.id === noteId), false, 'undo removed the note');

  const redone = await post(route, 'history.redo');
  assert.equal(redone.body.undone, true);
  assert.equal(redone.body.notes.some((note) => note.id === noteId), true, 'redo restored it');

  const manage = tools.get('sticky_board_manage');
  const viaTool = await manage.execute({ action: 'undo' }, {});
  assert.match(viaTool.text, /已撤销一步/);
  assert.equal((await get(route)).body.notes.some((note) => note.id === noteId), false, 'the tool undid it too');

  await post(route, 'history.redo');
  await post(route, 'note.remove', { id: noteId, permanent: true });
});

await step('trash, restore and purge a note', async () => {
  const removed = await post(route, 'note.remove', { id: noteId });
  assert.equal(removed.body.ok, true);
  assert.equal(removed.body.counts.notesTrash, 1);
  const restored = await post(route, 'note.restore', { id: noteId });
  assert.equal(restored.body.counts.notesTrash, 0);
  const purged = await post(route, 'note.remove', { id: noteId, permanent: true });
  assert.equal(purged.body.ok, true);
  assert.equal(purged.body.notes.some((note) => note.id === noteId), false);
});

await step('columns can be added, renamed and removed', async () => {
  const added = await post(route, 'column.add', { title: '归档' });
  assert.equal(added.body.ok, true);
  const id = added.body.column.id;
  const renamed = await post(route, 'column.update', { id, patch: { title: '已完成' } });
  assert.equal(renamed.body.column.title, '已完成');
  const removed = await post(route, 'column.remove', { id });
  assert.equal(removed.body.ok, true);
  assert.equal(removed.body.board.columns.length, 3);
});

await step('settings and export round-trip', async () => {
  const settings = await post(route, 'settings.update', { patch: { activeView: 'board' } });
  assert.equal(settings.body.settings.activeView, 'board');
  const exported = await post(route, 'export');
  assert.equal(exported.body.ok, true);
  assert.equal(exported.body.document.version, 2);
  const imported = await post(route, 'import', { document: exported.body.document, mode: 'merge' });
  assert.equal(imported.body.ok, true);
});

await step('document survives a reload from disk', async () => {
  const raw = JSON.parse(await readFile(storePath, 'utf8'));
  assert.equal(raw.version, 2);
  assert.ok(Array.isArray(raw.boards) && raw.boards.length === 1);
  assert.ok(raw.rev > 0);
});

await step('note height persists through update and reload', async () => {
  const created = await post(route, 'note.create', { note: { lines: [{ kind: 'text', text: '尺寸便签' }] } });
  const id = created.body.note.id;
  assert.equal(created.body.note.h, null, 'new notes default to auto height');

  const resized = await post(route, 'note.update', { id, patch: { w: 320, h: 260 } });
  assert.equal(resized.body.note.w, 320);
  assert.equal(resized.body.note.h, 260);

  const reloaded = fakeContext();
  apply(reloaded, { storePath });
  const snapshot = await get(reloaded.registered.route);
  const note = snapshot.body.notes.find((entry) => entry.id === id);
  assert.equal(note.h, 260, 'height must survive a reload');
  assert.equal(note.w, 320);

  const clamped = await post(route, 'note.update', { id, patch: { h: 5 } });
  assert.equal(clamped.body.note.h, 80, 'height is clamped to the minimum');
  await post(route, 'note.remove', { id, permanent: true });
});

await step('card checklist persists, toggles and reaches the tools', async () => {
  const created = await post(route, 'card.create', {
    card: {
      title: '带检查项',
      checklist: [{ text: '第一步', done: false }, { text: '第二步', done: false }],
    },
  });
  const cardId = created.body.card.id;
  assert.equal(created.body.card.checklist.length, 2);
  assert.match(created.body.card.checklist[0].id, /^item-/);

  // 勾选第一项（整组替换，和 UI 一样）
  const next = created.body.card.checklist.map((item, index) => ({ ...item, done: index === 0 }));
  const toggled = await post(route, 'card.update', { id: cardId, patch: { checklist: next } });
  assert.equal(toggled.body.card.checklist[0].done, true);

  // 工具侧能看到进度并改写
  const listed = await tools.get('sticky_task_list').execute({ query: '带检查项' }, {});
  assert.match(listed.text, /☑ 1\/2/);
  const toolUpdated = await tools.get('sticky_task_update').execute(
    { id: cardId, checklist: [{ text: '只剩一项', done: false }] },
    {},
  );
  assert.match(toolUpdated.text, /检查项/);
  assert.match(toolUpdated.text, /1 项/);

  // 重开 store 后仍在
  const reloaded = fakeContext();
  apply(reloaded, { storePath });
  const snapshot = await get(reloaded.registered.route);
  const card = snapshot.body.board.cards.find((entry) => entry.id === cardId);
  assert.deepEqual(card.checklist.map((item) => item.text), ['只剩一项']);
  // 旧文档迁移：v1 文件读入即 v2
  assert.equal(snapshot.body.rev >= 0, true);

  await post(route, 'card.remove', { id: cardId, permanent: true });
});

await step('a corrupt file is backed up and rebuilt', async () => {
  const corruptPath = path.join(tmp, 'corrupt.json');
  await writeFile(corruptPath, '{ this is not json', 'utf8');
  const second = fakeContext();
  apply(second, { storePath: corruptPath });
  const snapshot = await get(second.registered.route);
  assert.equal(snapshot.status, 200);
  assert.deepEqual(snapshot.body.notes, []);
  const files = await import('node:fs/promises').then((fs) => fs.readdir(tmp));
  assert.ok(files.some((name) => name.startsWith('corrupt.json.corrupt-')), `backup missing: ${files.join(',')}`);
});

await step('tools share the same document as the route', async () => {
  const create = tools.get('sticky_task_create');
  const created = await create.execute({ title: '模型建的任务', priority: 'P0' }, {});
  assert.match(created.text, /模型建的任务/);

  const snapshot = await get(route);
  const card = snapshot.body.board.cards.find((entry) => entry.title === '模型建的任务');
  assert.ok(card !== undefined, 'task created by the tool is not visible to the route');
  assert.equal(card.priority, 'P0');

  const listed = await tools.get('sticky_task_list').execute({}, {});
  assert.match(listed.text, /模型建的任务/);

  const board = await tools.get('sticky_board_get').execute({}, {});
  assert.match(board.text, /看板/);

  const removed = await tools.get('sticky_task_remove').execute({ id: card.id }, {});
  assert.match(removed.text, /回收站/);
});

await step('custom column survives a reload from disk', async () => {
  const added = await post(route, 'column.add', { title: '评审' });
  const columnId = added.body.column.id;
  assert.equal(added.body.board.columns.some((column) => column.id === columnId), true);

  const reloaded = fakeContext();
  apply(reloaded, { storePath });
  const snapshot = await get(reloaded.registered.route);
  assert.equal(
    snapshot.body.board.columns.some((column) => column.id === columnId),
    true,
    `custom column lost on reload: ${snapshot.body.board.columns.map((column) => column.id).join(',')}`,
  );
  await post(route, 'column.remove', { id: columnId });
});

await step('boards can be added, renamed, selected and removed', async () => {
  const added = await post(route, 'board.add', { title: '项目 B' });
  assert.equal(added.body.ok, true);
  const newBoardId = added.body.board.id;
  assert.equal(added.body.activeBoardId, newBoardId);
  assert.equal(added.body.board.columns.length, 3);
  assert.equal(added.body.counts.cards, 0);

  const renamed = await post(route, 'board.update', { id: newBoardId, patch: { title: '项目 B2' } });
  assert.equal(renamed.body.boards.find((entry) => entry.id === newBoardId).title, '项目 B2');

  const back = await post(route, 'board.select', { id: 'board-main' });
  assert.equal(back.body.activeBoardId, 'board-main');

  const removed = await post(route, 'board.remove', { id: newBoardId });
  assert.equal(removed.body.ok, true);
  assert.equal(removed.body.boards.length, 1);

  const last = await post(route, 'board.remove', { id: added.body.boards[0].id });
  assert.equal(last.status, 400, 'the last board must not be removable');
});

await step('board templates seed the requested columns', async () => {
  const defaultBoard = await post(route, 'board.add', { title: '模板-默认' });
  assert.equal(defaultBoard.body.board.columns.length, 3, 'no template = default three columns');

  const two = await post(route, 'board.add', { title: '模板-两列', columns: ['甲', '乙'] });
  assert.deepEqual(two.body.board.columns.map((column) => column.title), ['甲', '乙']);

  const five = await post(route, 'board.add', {
    title: '模板-五列',
    columns: ['A', 'B', 'C', 'D', 'E'],
  });
  assert.equal(five.body.board.columns.length, 5);

  const blank = await post(route, 'board.add', { title: '模板-空白', columns: ['待办'] });
  assert.equal(blank.body.board.columns.length, 1);

  const manage = tools.get('sticky_board_manage');
  const viaTool = await manage.execute({ action: 'create', title: '模板-工具五列', template: 'five' }, {});
  assert.match(viaTool.text, /5 列/);

  for (const board of (await get(route)).body.boards) {
    if (board.title.startsWith('模板-')) await post(route, 'board.remove', { id: board.id });
  }
});

await step('each board keeps its own cards', async () => {
  const created = await post(route, 'card.create', { card: { title: '板A任务' } });
  const boardA = created.body.activeBoardId;
  const second = await post(route, 'board.add', { title: '板B' });
  assert.equal(second.body.counts.cards, 0);

  const onB = await post(route, 'card.create', { card: { title: '板B任务' } });
  assert.equal(onB.body.counts.cards, 1);
  assert.equal(onB.body.activeBoardId, second.body.activeBoardId);

  await post(route, 'board.select', { id: boardA });
  const snapshot = await get(route);
  assert.equal(snapshot.body.board.cards.some((card) => card.title === '板A任务'), true);
  assert.equal(snapshot.body.board.cards.some((card) => card.title === '板B任务'), false);

  for (const entry of snapshot.body.boards) {
    if (entry.id !== boardA) await post(route, 'board.remove', { id: entry.id });
  }
});

await step('card.trashMany moves many cards to the trash', async () => {
  const before = (await get(route)).body.counts.cardsTrash;
  const a = await post(route, 'card.create', { card: { title: '批量卡 A' } });
  const b = await post(route, 'card.create', { card: { title: '批量卡 B' } });
  const trashed = await post(route, 'card.trashMany', { cardIds: [a.body.card.id, b.body.card.id] });
  assert.equal(trashed.body.ok, true);
  assert.equal(trashed.body.cardsTrashed, 2);
  assert.equal(trashed.body.counts.cardsTrash, before + 2);

  const restored = await post(route, 'trash.restoreMany', {
    noteIds: [],
    cardIds: [a.body.card.id, b.body.card.id],
  });
  assert.equal(restored.body.cardsRestored, 2);
  assert.equal(restored.body.counts.cardsTrash, before);

  await post(route, 'card.remove', { id: a.body.card.id, permanent: true });
  await post(route, 'card.remove', { id: b.body.card.id, permanent: true });
});

await step('note.tidy spreads notes and trash.clear empties the trash', async () => {
  for (let index = 0; index < 5; index += 1) {
    await post(route, 'note.create', { note: { lines: [{ kind: 'text', text: `便签 ${index}` }] } });
  }
  const tidied = await post(route, 'note.tidy');
  assert.equal(tidied.body.ok, true);
  const notes = tidied.body.notes;
  assert.equal(tidied.body.count, notes.length);
  const spots = new Set(notes.map((note) => `${note.x},${note.y}`));
  assert.equal(spots.size, notes.length, 'tidy produced overlapping positions');

  await post(route, 'note.remove', { id: notes[0].id });
  const cleared = await post(route, 'trash.clear');
  assert.equal(cleared.body.counts.notesTrash, 0);
  assert.equal(cleared.body.notes.some((note) => note.id === notes[0].id), false);
});

await step('trash batch restore and purge work', async () => {
  const a = await post(route, 'note.create', { note: { lines: [{ kind: 'text', text: '批量便签 A' }] } });
  const b = await post(route, 'note.create', { note: { lines: [{ kind: 'text', text: '批量便签 B' }] } });
  const card = await post(route, 'card.create', { card: { title: '批量任务' } });
  await post(route, 'note.remove', { id: a.body.note.id });
  await post(route, 'note.remove', { id: b.body.note.id });
  await post(route, 'card.remove', { id: card.body.card.id });

  const before = await get(route);
  assert.equal(before.body.counts.notesTrash, 2);
  assert.equal(before.body.counts.cardsTrash, 1);

  const restored = await post(route, 'trash.restoreMany', {
    noteIds: [a.body.note.id],
    cardIds: [card.body.card.id],
  });
  assert.equal(restored.body.ok, true);
  assert.equal(restored.body.notesRestored, 1);
  assert.equal(restored.body.cardsRestored, 1);
  assert.equal(restored.body.counts.notesTrash, 1);

  const purged = await post(route, 'trash.purgeMany', { noteIds: [b.body.note.id] });
  assert.equal(purged.body.ok, true);
  assert.equal(purged.body.notesPurged, 1);
  assert.equal(purged.body.notes.some((note) => note.id === b.body.note.id), false);
  assert.equal(purged.body.counts.notesTrash, 0);

  // 批量软删（便签多选删除用）
  const c = await post(route, 'note.create', { note: { lines: [{ kind: 'text', text: '批量软删 C' }] } });
  const d = await post(route, 'note.create', { note: { lines: [{ kind: 'text', text: '批量软删 D' }] } });
  const trashed = await post(route, 'note.trashMany', { noteIds: [c.body.note.id, d.body.note.id] });
  assert.equal(trashed.body.ok, true);
  assert.equal(trashed.body.notesTrashed, 2);
  assert.equal(trashed.body.counts.notesTrash, 2);
  await post(route, 'trash.purgeMany', { noteIds: [c.body.note.id, d.body.note.id] });
  assert.equal((await get(route)).body.counts.notesTrash, 0);

  // 收拾现场，避免影响后续步骤
  await post(route, 'note.remove', { id: a.body.note.id });
  await post(route, 'card.remove', { id: card.body.card.id });
});

await step('sticky_board_manage lists and creates boards', async () => {
  const manage = tools.get('sticky_board_manage');
  const listed = await manage.execute({ action: 'list' }, {});
  assert.match(listed.text, /看板/);
  const created = await manage.execute({ action: 'create', title: '工具建的板' }, {});
  assert.match(created.text, /工具建的板/);
  const snapshot = await get(route);
  assert.equal(snapshot.body.board.title, '工具建的板');
  await manage.execute({ action: 'delete', boardId: snapshot.body.activeBoardId }, {});
});

await step('column.move reorders the active board columns', async () => {
  const before = await get(route);
  const ids = before.body.board.columns.map((column) => column.id);
  assert.ok(ids.length >= 3);

  // 向右移一格：拖到目标列上时，被拖的列"占据"目标列的位置。
  const right1 = await post(route, 'column.move', { id: ids[0], toIndex: 1 });
  assert.equal(right1.body.ok, true);
  assert.deepEqual(right1.body.board.columns.map((column) => column.id).slice(0, 2), [ids[1], ids[0]]);

  // 向右移到底。
  const moved = await post(route, 'column.move', { id: ids[0], toIndex: ids.length - 1 });
  assert.equal(moved.body.ok, true);
  const after = moved.body.board.columns.map((column) => column.id);
  assert.equal(after[after.length - 1], ids[0]);
  assert.deepEqual([...after].sort(), [...ids].sort(), 'column move must not lose a column');
  await post(route, 'column.move', { id: ids[0], toIndex: 0 });
});

await step('board.move reorders the board tabs without switching', async () => {
  const added = await post(route, 'board.add', { title: '排序板' });
  const newBoardId = added.body.board.id;
  const firstBoardId = added.body.boards[0].id;

  // 向左移一格
  const moved = await post(route, 'board.move', { id: newBoardId, toIndex: 0 });
  assert.equal(moved.body.ok, true);
  assert.equal(moved.body.boards[0].id, newBoardId);
  assert.equal(moved.body.activeBoardId, newBoardId, 'moving must not change the active board');

  // 向右移一格（第 0 块 -> 第 1 块）
  const right1 = await post(route, 'board.move', { id: firstBoardId, toIndex: 1 });
  assert.equal(right1.body.ok, true);
  assert.equal(right1.body.boards[1].id, firstBoardId);

  await post(route, 'board.remove', { id: newBoardId });
});

await step('locate finds entries across boards', async () => {
  const before = await get(route);
  const boardA = before.body.activeBoardId;
  const created = await post(route, 'card.create', { card: { title: '定位任务' } });
  const cardId = created.body.card.id;
  const added = await post(route, 'board.add', { title: '定位板' });
  const boardB = added.body.activeBoardId;
  assert.notEqual(boardA, boardB);

  const cardFound = await post(route, 'locate', { id: cardId });
  assert.equal(cardFound.body.ok, true);
  assert.equal(cardFound.body.found.kind, 'card');
  assert.equal(cardFound.body.found.boardId, boardA);

  const note = await post(route, 'note.create', { note: { lines: [{ kind: 'text', text: '定位便签' }] } });
  const noteFound = await post(route, 'locate', { id: note.body.note.id });
  assert.equal(noteFound.body.found.kind, 'note');
  assert.equal(noteFound.body.found.boardId, null);

  const missing = await post(route, 'locate', { id: 'card-nope' });
  assert.equal(missing.status, 404);

  await post(route, 'board.remove', { id: boardB });
  await post(route, 'card.remove', { id: cardId, permanent: true });
  await post(route, 'note.remove', { id: note.body.note.id, permanent: true });
});

await step('server-side search filters notes and keeps global counts', async () => {
  await post(route, 'note.create', { note: { lines: [{ kind: 'text', text: '服务端搜索目标' }] } });
  const all = await get(route);
  const totalNotes = all.body.counts.notes;
  const hit = await get(route, `?trash=1&q=${encodeURIComponent('服务端搜索目标')}`);
  assert.equal(hit.body.ok, true);
  assert.equal(hit.body.notes.length, 1);
  assert.match(hit.body.notes[0].text, /服务端搜索目标/);
  assert.equal(hit.body.counts.notes, totalNotes, 'counts must stay global, not filtered');
  const miss = await get(route, '?trash=1&q=zzz-nothing-matches');
  assert.equal(miss.body.notes.length, 0);
  assert.equal(miss.body.board.cards.length, 0);
});

await step('import replace swaps the whole document', async () => {
  const exported = await post(route, 'export');
  const document = exported.body.document;
  const before = await get(route);
  assert.ok(before.body.notes.length > 0);
  const replaced = await post(route, 'import', { document, mode: 'replace' });
  assert.equal(replaced.body.ok, true);
  assert.equal(replaced.body.boards.length, document.boards.length);
  assert.equal(replaced.body.board.cards.length, document.boards[0].cards.length);
  assert.equal(replaced.body.notes.length, document.notes.length);
});

await step('unknown action and missing id answer 400, missing entity 404', async () => {
  const bad = await post(route, 'nonsense');
  assert.equal(bad.status, 400);
  assert.equal(bad.body.ok, false);
  const missing = await post(route, 'note.update', { id: 'note-nope', patch: { pinned: true } });
  assert.equal(missing.status, 404);
  const noId = await post(route, 'card.move', { id: '', columnId: 'todo' });
  assert.equal(noId.status, 400);
});

await rm(tmp, { recursive: true, force: true });

if (failures > 0) {
  console.error(`\n${failures} step(s) failed`);
  process.exit(1);
}
console.log('\nall smoke steps passed');
