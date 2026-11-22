import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createStore } from '../lib/store.js';
import { emptyDocument, normalizeNote } from '../lib/model.js';

/** 建一个测试用临时目录，测试结束删除。 */
async function makeTempDir(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sticky-board-store-'));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

/* ------------------------------------------------------------------ *
 * 加载
 * ------------------------------------------------------------------ */

test('旧版 v1 文档加载后视为 v3：卡片补 checklist，写回时落 v3', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = path.join(dir, 'board.json');
  await fs.writeFile(
    filePath,
    JSON.stringify({
      version: 1,
      rev: 3,
      notes: [],
      boards: [
        {
          id: 'board-main',
          title: '默认看板',
          columns: [{ id: 'todo', title: '待办', order: 0 }],
          cards: [{ id: 'card-legacy', title: '旧卡', columnId: 'todo', order: 0 }],
        },
      ],
      settings: { activeView: 'board', wallDensity: 'auto', activeBoardId: 'board-main' },
      updatedAt: 1,
    }),
    'utf8',
  );

  const store = createStore({ filePath });
  const doc = await store.ready;
  assert.equal(doc.version, 3, 'v1 is read as v3');
  const legacyCard = doc.boards[0].cards[0];
  assert.deepEqual(legacyCard.checklist, [], 'migrated cards get an empty checklist');
  assert.equal(legacyCard.title, '旧卡');

  await store.mutate((current) => {
    current.boards[0].cards[0].checklist.push({ text: '迁移后新项', done: false });
  });
  const onDisk = await readJson(filePath);
  assert.equal(onDisk.version, 3);
  assert.equal(onDisk.boards[0].cards[0].checklist[0].text, '迁移后新项');
});

test('首次加载：文件不存在时得到空文档且不写盘', async (t) => {  const dir = await makeTempDir(t);
  // 父目录也不存在，验证懒加载路径不提前 mkdir
  const filePath = path.join(dir, 'nested', 'board.json');
  const store = createStore({ filePath });

  assert.equal(store.path, path.resolve(filePath));
  assert.equal(store.revision(), 0); // 未加载时也是 0

  const doc = await store.ready;
  assert.deepEqual(doc, emptyDocument());
  assert.equal(store.snapshot(), doc); // 返回当前内存文档引用
  assert.deepEqual(store.snapshot(), emptyDocument());
  assert.equal(store.revision(), 0);
  assert.equal(store.backupPath(), null);

  await store.flush();
  await assert.rejects(fs.access(filePath), { code: 'ENOENT' });
});

test('createStore 校验 filePath，mutate 校验 fn', async (t) => {
  const dir = await makeTempDir(t);
  assert.throws(() => createStore({ filePath: '' }), TypeError);
  assert.throws(() => createStore({}), TypeError);
  const store = createStore({ filePath: path.join(dir, 'board.json') });
  await assert.rejects(store.mutate('not-a-function'), TypeError);
  await store.flush();
});

/* ------------------------------------------------------------------ *
 * 写入 / 读回
 * ------------------------------------------------------------------ */

test('mutate 写盘后重新 createStore 读到同样内容', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = path.join(dir, 'board.json');
  const store = createStore({ filePath });
  await store.ready;

  const note = normalizeNote(
    { id: 'note-aaaaaaaaaa', lines: [{ id: 'l-0000000001', kind: 'text', text: '你好' }] },
    111,
  );
  const result = await store.mutate((doc) => {
    doc.notes.push(note);
    doc.settings.activeView = 'board';
  });

  assert.equal(result.changed, true);
  assert.equal(result.value, undefined);
  assert.equal(result.doc.rev, 1);
  assert.equal(store.revision(), 1);
  assert.equal(store.snapshot().notes.length, 1);

  const text = await fs.readFile(filePath, 'utf8');
  assert.ok(text.endsWith('\n')); // 文件末尾带换行
  assert.ok(text.includes('\n  "version": 3')); // 2 空格缩进
  const onDisk = JSON.parse(text);
  assert.equal(onDisk.version, 3);
  assert.equal(onDisk.rev, 1);
  assert.equal(onDisk.notes.length, 1);
  assert.equal(onDisk.notes[0].text, '你好');
  assert.equal(onDisk.settings.activeView, 'board');
  assert.equal(onDisk.updatedAt, result.doc.updatedAt);

  const reloaded = createStore({ filePath });
  const doc2 = await reloaded.ready;
  assert.deepEqual(doc2, store.snapshot());
  assert.equal(doc2.rev, 1);
  assert.equal(doc2.notes[0].text, '你好');
  assert.equal(doc2.settings.activeView, 'board');
});

test('内容未变不写盘（rev 与 mtime 都不变）', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = path.join(dir, 'board.json');
  const store = createStore({ filePath });
  await store.ready;

  const first = await store.mutate((doc) => {
    doc.notes.push(normalizeNote({ lines: [{ kind: 'text', text: '第一条' }] }, 1));
  });
  assert.equal(first.changed, true);
  assert.equal(store.revision(), 1);
  const statAfterFirst = await fs.stat(filePath);

  // fn 什么都不做
  const second = await store.mutate(() => {});
  assert.equal(second.changed, false);
  assert.equal(store.revision(), 1);

  // fn 返回一个内容完全相同的新文档对象，也不应写盘
  const copy = JSON.parse(JSON.stringify(store.snapshot()));
  const third = await store.mutate(() => copy);
  assert.equal(third.changed, false);
  assert.equal(store.revision(), 1);

  const statAfterThird = await fs.stat(filePath);
  assert.equal(statAfterThird.mtimeMs, statAfterFirst.mtimeMs);

  const onDisk = await readJson(filePath);
  assert.equal(onDisk.rev, 1);
  assert.equal(onDisk.notes.length, 1);
});

test('mutate 返回新文档对象时会归一化并落盘', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = path.join(dir, 'board.json');
  const store = createStore({ filePath });
  await store.ready;

  const result = await store.mutate((doc) => ({
    ...doc,
    settings: { activeView: 'board', wallDensity: 'compact' },
    notes: [
      ...doc.notes,
      { id: 'note-returned', lines: [{ kind: 'bogus', text: 'x' }, { kind: 'text', text: '正文' }] },
    ],
  }));
  assert.equal(result.changed, true);
  assert.equal(result.doc.rev, 1);
  assert.equal(result.doc.settings.activeView, 'board');
  assert.equal(result.doc.notes[0].text, '正文'); // 非法行被归一化丢弃
  assert.equal(store.snapshot(), result.doc);

  const onDisk = await readJson(filePath);
  assert.equal(onDisk.rev, 1);
  assert.equal(onDisk.notes[0].id, 'note-returned');
  assert.equal(onDisk.notes[0].lines.length, 1);
});

/* ------------------------------------------------------------------ *
 * 并发 / 原子写
 * ------------------------------------------------------------------ */

test('并发 mutate 串行执行且不丢更新（20 次 push）', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = path.join(dir, 'board.json');
  const store = createStore({ filePath });
  await store.ready;

  const results = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      store.mutate((doc) => {
        doc.notes.push(
          normalizeNote({ lines: [{ kind: 'text', text: `第 ${index} 条` }] }, 1000 + index),
        );
      }),
    ),
  );

  assert.equal(results.length, 20);
  assert.ok(results.every((result) => result.changed === true));
  assert.equal(store.snapshot().notes.length, 20);
  assert.equal(store.revision(), 20);
  assert.deepEqual(
    store.snapshot().notes.map((note) => note.text),
    Array.from({ length: 20 }, (_, index) => `第 ${index} 条`),
  );

  await store.flush();
  const reloaded = createStore({ filePath });
  const doc2 = await reloaded.ready;
  assert.equal(doc2.rev, 20);
  assert.equal(doc2.notes.length, 20);
});

test('原子写不留 tmp 文件，flush 之后改动可见', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = path.join(dir, 'board.json');
  const store = createStore({ filePath });
  await store.ready;

  store.mutate((doc) => {
    doc.settings.wallDensity = 'compact';
  });
  // 不 await mutate，直接 flush 等队列排空
  await store.flush();
  assert.equal(store.snapshot().settings.wallDensity, 'compact');
  assert.equal(store.revision(), 1);

  for (let index = 0; index < 5; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await store.mutate((doc) => {
      doc.rev = doc.rev; // 触发一次内容不变的改写
      doc.notes.push(normalizeNote({ lines: [{ kind: 'text', text: `条目 ${index}` }] }, index));
    });
  }

  const entries = await fs.readdir(dir);
  const tmpFiles = entries.filter((name) => name.includes('.tmp-'));
  assert.deepEqual(tmpFiles, []);
  assert.ok(entries.includes('board.json'));

  const onDisk = await readJson(filePath);
  assert.equal(onDisk.notes.length, 5);
  assert.equal(onDisk.rev, 6);
});

/* ------------------------------------------------------------------ *
 * 损坏文件
 * ------------------------------------------------------------------ */

test('损坏 JSON 文件：改名备份、空文档重建、之后可正常写入', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = path.join(dir, 'board.json');
  const corruptText = '{ this is not json';
  await fs.writeFile(filePath, corruptText, 'utf8');

  const warnings = [];
  const logger = { warn: (message) => warnings.push(String(message)) };
  const store = createStore({ filePath, logger });

  const doc = await store.ready;
  assert.deepEqual(doc, emptyDocument());
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].includes('sticky-board'));

  const backup = store.backupPath();
  assert.equal(typeof backup, 'string');
  assert.ok(backup.startsWith(`${filePath}.corrupt-`));
  assert.equal(await fs.readFile(backup, 'utf8'), corruptText);
  // 原文件已被改名，不会留下损坏内容
  await assert.rejects(fs.access(filePath), { code: 'ENOENT' });

  await store.mutate((current) => {
    current.notes.push(normalizeNote({ lines: [{ kind: 'text', text: '恢复后第一条' }] }, 5));
  });
  const onDisk = await readJson(filePath);
  assert.equal(onDisk.version, 3);
  assert.equal(onDisk.notes.length, 1);
  assert.equal(onDisk.notes[0].text, '恢复后第一条');
});

test('结构非法（非对象 JSON）同样备份重建', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = path.join(dir, 'board.json');
  await fs.writeFile(filePath, '[1,2,3]', 'utf8');

  const warnings = [];
  const store = createStore({ filePath, logger: { warn: (message) => warnings.push(message) } });
  const doc = await store.ready;

  assert.deepEqual(doc, emptyDocument());
  assert.equal(warnings.length, 1);
  const backup = store.backupPath();
  assert.ok(backup !== null && backup.includes('.corrupt-'));
  assert.equal(await fs.readFile(backup, 'utf8'), '[1,2,3]');
  await store.flush();
});

test('撤销/重做：恢复上一版、rev 前进、新写入清空重做栈', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = path.join(dir, 'board.json');
  const store = createStore({ filePath });
  await store.ready;

  await store.mutate((doc) => {
    doc.notes.push(normalizeNote({ lines: [{ kind: 'text', text: '一' }] }, 1));
  });
  const revAfterFirst = store.revision();
  await store.mutate((doc) => {
    doc.notes.push(normalizeNote({ lines: [{ kind: 'text', text: '二' }] }, 2));
  });
  assert.equal(store.snapshot().notes.length, 2);

  const undone = await store.undo();
  assert.equal(undone.changed, true);
  assert.equal(store.snapshot().notes.length, 1);
  assert.ok(store.revision() > revAfterFirst, 'rev moves forward, never back');

  const redone = await store.redo();
  assert.equal(redone.changed, true);
  assert.equal(store.snapshot().notes.length, 2);

  // 新的写入会清空重做栈
  await store.undo();
  await store.mutate((doc) => {
    doc.notes.push(normalizeNote({ lines: [{ kind: 'text', text: '三' }] }, 3));
  });
  assert.equal(store.historyDepth().future, 0);
  assert.equal((await store.redo()).changed, false);
  assert.equal(store.snapshot().notes.length, 2);
});

test('撤销栈按 historyLimit 截断，空栈时返回 changed=false', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = path.join(dir, 'board.json');
  const store = createStore({ filePath, historyLimit: 2 });
  await store.ready;
  assert.equal((await store.undo()).changed, false);
  assert.equal((await store.redo()).changed, false);

  for (let index = 0; index < 4; index += 1) {
    await store.mutate((doc) => {
      doc.notes.push(normalizeNote({ lines: [{ kind: 'text', text: `n${index}` }] }, index + 1));
    });
  }
  assert.deepEqual(store.historyDepth(), { past: 2, future: 0, limit: 2 });
  await store.undo();
  await store.undo();
  assert.equal((await store.undo()).changed, false);
  assert.equal(store.snapshot().notes.length, 2, 'only the two most recent steps are undoable');
  const onDisk = await readJson(filePath);
  assert.equal(onDisk.notes.length, 2, 'the file follows the undo');
});

test('每日快照：首次写入只记日期，同日不重复复制', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = path.join(dir, 'board.json');
  const store = createStore({ filePath });
  await store.ready;
  await store.mutate((doc) => {
    doc.notes.push(normalizeNote({ lines: [{ kind: 'text', text: '一' }] }, 1));
  });
  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  assert.equal(await fs.access(`${filePath}.bak-${key}`).then(() => true, () => false), false, '首次运行没有旧文件可备份');
  assert.equal((await readJson(filePath)).settings.lastBackupAt, key);

  await store.mutate((doc) => {
    doc.notes.push(normalizeNote({ lines: [{ kind: 'text', text: '二' }] }, 2));
  });
  assert.equal(await fs.access(`${filePath}.bak-${key}`).then(() => true, () => false), false, '同一天不重复复制');
});

test('跨天写入生成快照，并只保留最近 7 份', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = path.join(dir, 'board.json');
  const store = createStore({ filePath });
  await store.ready;
  await store.mutate((doc) => {
    doc.notes.push(normalizeNote({ lines: [{ kind: 'text', text: '一' }] }, 1));
  });
  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // 把日期改成过去：下一次写入前应把当前文件复制成今天的快照
  await store.mutate((doc) => {
    doc.settings.lastBackupAt = '2020-01-01';
  });
  assert.equal(await fs.access(`${filePath}.bak-${key}`).then(() => true, () => false), true, '今天已生成快照');

  // 预置 8 份旧快照，触发裁剪
  for (let index = 1; index <= 8; index += 1) {
    await fs.writeFile(`${filePath}.bak-2020-02-0${index}`, 'old', 'utf8');
  }
  await store.mutate((doc) => {
    doc.settings.lastBackupAt = '2019-12-31';
  });
  const backups = (await fs.readdir(dir)).filter((name) => name.startsWith('board.json.bak-')).sort();
  assert.equal(backups.length, 7, `kept ${backups.join(',')}`);
  assert.equal(backups.includes(`board.json.bak-${key}`), true, '今天的快照必须保留');
});
