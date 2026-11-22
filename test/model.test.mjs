import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SCHEMA_VERSION,
  NOTE_COLORS,
  LINE_KINDS,
  PRIORITIES,
  newId,
  defaultBoard,
  emptyDocument,
  normalizeDocument,
  normalizeNote,
  normalizeCard,
  normalizeLines,
  noteText,
  noteTitle,
  notePlaceholder,
  sortNotes,
  orderedCards,
  moveCard,
  touch,
  noteToCard,
  cardToNote,
  noteSummary,
  cardSummary,
} from '../lib/model.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

/* ------------------------------------------------------------------ *
 * 常量 / 空文档
 * ------------------------------------------------------------------ */

test('常量导出符合数据模型 v5', () => {
  assert.equal(SCHEMA_VERSION, 5);
  assert.deepEqual(NOTE_COLORS, ['amber', 'rose', 'mint', 'sky', 'violet', 'slate', 'plain']);
  assert.deepEqual(LINE_KINDS, ['text', 'todo', 'ul', 'ol']);
  assert.deepEqual(PRIORITIES, ['P0', 'P1', 'P2', 'P3']);
});

test('emptyDocument 结构完整且是全新对象', () => {
  const doc = emptyDocument();
  assert.deepEqual(doc, {
    version: 5,
    rev: 0,
    notes: [],
    boards: [
      {
        id: 'board-main',
        title: '默认看板',
        columns: [
          { id: 'todo', title: '待办', order: 0 },
          { id: 'doing', title: '进行中', order: 1 },
          { id: 'done', title: '完成', order: 2 },
        ],
        doneColumnId: 'done',
        cards: [],
      },
    ],
    settings: { activeView: 'wall', wallDensity: 'auto', activeBoardId: 'board-main', lastBackupAt: null },
    updatedAt: 0,
  });

  // 不同调用之间不共享引用
  const first = emptyDocument();
  const second = emptyDocument();
  first.notes.push({ id: 'note-x' });
  first.boards[0].cards.push({ id: 'card-x' });
  first.settings.activeView = 'board';
  assert.equal(second.notes.length, 0);
  assert.equal(second.boards[0].cards.length, 0);
  assert.equal(second.settings.activeView, 'wall');
});

test('defaultBoard 每次返回独立对象', () => {
  const board = defaultBoard();
  assert.equal(board.id, 'board-main');
  assert.equal(board.title, '默认看板');
  assert.deepEqual(board.columns.map((column) => column.id), ['todo', 'doing', 'done']);
  assert.equal(board.doneColumnId, 'done');
  assert.deepEqual(board.cards, []);
  board.columns[0].title = '被改掉';
  assert.equal(defaultBoard().columns[0].title, '待办');
});

test('newId 生成 10 位小写 hex 且不重复', () => {
  const seen = new Set();
  for (let index = 0; index < 500; index += 1) {
    const id = newId('note');
    assert.match(id, /^note-[0-9a-f]{10}$/);
    assert.equal(seen.has(id), false);
    seen.add(id);
  }
  assert.match(newId('l'), /^l-[0-9a-f]{10}$/);
  assert.match(newId(''), /^id-[0-9a-f]{10}$/);
});

/* ------------------------------------------------------------------ *
 * normalizeDocument
 * ------------------------------------------------------------------ */

test('normalizeDocument 容错垃圾输入', () => {
  for (const input of [null, undefined, 'oops', 42, true, [], [1, 2, 3], () => {}]) {
    assert.deepEqual(normalizeDocument(input), emptyDocument());
  }
});

test('normalizeDocument 补齐缺失字段', () => {
  const doc = normalizeDocument({
    notes: [{ lines: [{ kind: 'text', text: 'hello' }] }],
    boards: [{ cards: [{}] }],
  });

  assert.equal(doc.version, 5);
  assert.equal(doc.rev, 0);
  assert.equal(doc.notes.length, 1);
  const note = doc.notes[0];
  assert.match(note.id, /^note-[0-9a-f]{10}$/);
  assert.equal(note.lines.length, 1);
  assert.match(note.lines[0].id, /^l-[0-9a-f]{10}$/);
  assert.equal(note.text, 'hello');
  assert.equal(note.color, 'amber');
  assert.equal(note.pinned, false);
  assert.equal(note.collapsed, false);
  assert.equal(note.x, 0.05);
  assert.equal(note.y, 0.05);
  assert.equal(note.w, 240);
  assert.equal(note.trashed, false);
  assert.equal(note.deletedAt, null);
  assert.equal(note.linkedCardId, null);
  assert.equal(note.rev, 1);
  assert.ok(Number.isInteger(note.createdAt) && note.createdAt > 0);
  assert.equal(note.updatedAt, note.createdAt);

  assert.equal(doc.boards.length, 1);
  assert.equal(doc.boards[0].id, 'board-main');
  assert.equal(doc.boards[0].title, '默认看板');
  assert.deepEqual(doc.boards[0].columns.map((column) => column.id), ['todo', 'doing', 'done']);
  assert.equal(doc.boards[0].doneColumnId, 'done');
  assert.equal(doc.boards[0].cards.length, 1);
  const card = doc.boards[0].cards[0];
  assert.match(card.id, /^card-[0-9a-f]{10}$/);
  assert.equal(card.title, '');
  assert.equal(card.note, '');
  assert.equal(card.acceptance, '');
  assert.equal(card.columnId, 'todo');
  assert.equal(card.order, 0);
  assert.equal(card.priority, 'P2');
  assert.deepEqual(card.labels, []);
  assert.equal(card.dueDate, null);
  assert.equal(card.done, false);
  assert.equal(card.acceptedAt, null);
  assert.equal(card.noteId, null);
  assert.equal(card.rev, 1);
  assert.equal(doc.settings.activeView, 'wall');
  assert.equal(doc.settings.wallDensity, 'auto');
});

test('normalizeDocument 对 notes/cards 重复 id 去重（保留第一个）', () => {
  const doc = normalizeDocument({
    notes: [
      { id: 'note-1111111111', lines: [{ kind: 'text', text: '第一条' }] },
      { id: 'note-1111111111', lines: [{ kind: 'text', text: '第二条' }] },
    ],
    boards: [
      {
        cards: [
          { id: 'card-1111111111', title: '第一张' },
          { id: 'card-1111111111', title: '第二张' },
        ],
      },
    ],
  });
  assert.equal(doc.notes.length, 1);
  assert.equal(doc.notes[0].text, '第一条');
  assert.equal(doc.boards[0].cards.length, 1);
  assert.equal(doc.boards[0].cards[0].title, '第一张');
});

test('normalizeDocument 非法枚举/数值夹取/无效日期', () => {
  const doc = normalizeDocument({
    notes: [
      {
        id: 'note-aaaaaaaaaa',
        color: 'rainbow',
        x: -3,
        y: 5,
        w: 12,
        pinned: 'false',
        lines: [
          { id: 'l-bad', kind: 'bogus', text: '丢弃' },
          { id: 'l-todo', kind: 'todo', text: 42, done: 1 },
          { id: 'l-ul', kind: 'ul', text: '无序' },
        ],
      },
    ],
    boards: [
      {
        cards: [
          {
            id: 'card-1',
            columnId: 'archived',
            priority: 'PX',
            dueDate: '2026-02-30',
            order: -2,
            labels: [' a ', 'a', 3, '', 'b'],
          },
          {
            id: 'card-2',
            columnId: 'doing',
            priority: 'P0',
            dueDate: '2026-11-20',
            done: true,
          },
        ],
      },
    ],
  });

  const note = doc.notes[0];
  assert.equal(note.color, 'amber');
  assert.equal(note.x, 0);
  assert.equal(note.y, 1);
  assert.equal(note.w, 180);
  assert.equal(note.pinned, false); // 字符串 'false' 不应被当成 true
  assert.equal(note.lines.length, 2);
  assert.deepEqual(
    note.lines.map((line) => [line.kind, line.text, line.done]),
    [
      ['todo', '42', true],
      ['ul', '无序', false],
    ],
  );

  const cards = doc.boards[0].cards;
  const archived = cards.find((card) => card.id === 'card-1');
  assert.equal(archived.columnId, 'todo'); // 不存在的列落 todo
  assert.equal(archived.priority, 'P2');
  assert.equal(archived.dueDate, null); // 2 月 30 日非法
  assert.equal(archived.order, 0);
  assert.deepEqual(archived.labels, ['a', 'b']);

  const doing = cards.find((card) => card.id === 'card-2');
  assert.equal(doing.columnId, 'doing');
  assert.equal(doing.priority, 'P0');
  assert.equal(doing.dueDate, '2026-11-20');
  assert.equal(doing.done, true);
});

test('normalizeDocument 保留多块看板与自定义列', () => {
  const doc = normalizeDocument({
    boards: [
      {
        id: 'b1',
        title: 'T1',
        columns: [
          { id: 'doing', title: '正在做' },
          { id: 'extra', title: '多余列' },
          { id: 'todo' },
        ],
        cards: [
          { id: 'c1', title: 'C1', columnId: 'nope' },
          { id: 'c2', title: 'C2', columnId: 'doing', order: 5 },
          { id: 'c3', title: 'C3', columnId: 'doing', order: 1 },
        ],
      },
      { id: 'b2', title: 'T2', columns: [{ id: 'todo' }] },
    ],
  });

  assert.equal(doc.boards.length, 2);
  const board = doc.boards[0];
  assert.equal(board.id, 'b1');
  assert.equal(board.title, 'T1');
  // 自定义列被保留，而不是塌回固定三列
  assert.deepEqual(board.columns.map((column) => column.id), ['doing', 'extra', 'todo']);
  assert.deepEqual(board.columns.map((column) => column.order), [0, 1, 2]);
  assert.equal(board.columns[0].title, '正在做');
  assert.equal(board.columns[1].title, '多余列');

  // 不存在的列回落到该板第一列（这里是 doing）
  const byId = new Map(board.cards.map((card) => [card.id, card]));
  assert.equal(byId.get('c1').columnId, 'doing');
  assert.deepEqual(orderedCards(board.cards, 'doing').map((card) => card.id), ['c1', 'c3', 'c2']);
  assert.deepEqual(orderedCards(board.cards, 'doing').map((card) => card.order), [0, 1, 2]);

  assert.equal(doc.boards[1].id, 'b2');
  assert.deepEqual(doc.boards[1].columns.map((column) => column.id), ['todo']);
  // 未指定 activeBoardId 时回落到第一块
  assert.equal(doc.settings.activeBoardId, 'b1');
});

test('normalizeDocument activeBoardId 无效时回落到第一块看板', () => {
  const doc = normalizeDocument({ boards: [{ id: 'a' }, { id: 'b' }], settings: { activeBoardId: 'nope' } });
  assert.equal(doc.settings.activeBoardId, 'a');
  const kept = normalizeDocument({ boards: [{ id: 'a' }, { id: 'b' }], settings: { activeBoardId: 'b' } });
  assert.equal(kept.settings.activeBoardId, 'b');
});

test('normalizeDocument 没有看板时补一块默认看板', () => {
  const doc = normalizeDocument({ boards: [] });
  assert.equal(doc.boards.length, 1);
  assert.deepEqual(doc.boards[0].columns.map((column) => column.id), ['todo', 'doing', 'done']);
  assert.equal(doc.settings.activeBoardId, doc.boards[0].id);
  // 重复 id 去重
  const dupes = normalizeDocument({ boards: [{ id: 'x' }, { id: 'x' }] });
  assert.equal(dupes.boards.length, 1);
});

test('normalizeDocument 每列 order 重排为 0..n-1 且同 order 保持输入顺序', () => {
  const doc = normalizeDocument({
    boards: [
      {
        cards: [
          { id: 'a', columnId: 'todo', order: 7 },
          { id: 'b', columnId: 'todo', order: 7 },
          { id: 'c', columnId: 'todo', order: 2 },
          { id: 'd', columnId: 'done', order: 99 },
        ],
      },
    ],
  });
  assert.deepEqual(orderedCards(doc.boards[0].cards, 'todo').map((card) => card.id), ['c', 'a', 'b']);
  assert.deepEqual(orderedCards(doc.boards[0].cards, 'todo').map((card) => card.order), [0, 1, 2]);
  assert.deepEqual(orderedCards(doc.boards[0].cards, 'done').map((card) => card.order), [0]);
});

test('normalizeDocument 截断超长文本（>20000 字符）', () => {
  const long = 'x'.repeat(30000);
  const doc = normalizeDocument({
    notes: [{ id: 'note-long', lines: [{ kind: 'text', text: long }] }],
    boards: [{ cards: [{ id: 'card-long', title: long, note: long }] }],
  });
  assert.equal(doc.notes[0].lines[0].text.length, 20000);
  assert.equal(doc.notes[0].text.length, 20000);
  assert.equal(doc.boards[0].cards[0].title.length, 20000);
  assert.equal(doc.boards[0].cards[0].note.length, 20000);
});

test('normalizeDocument 不修改入参', () => {
  const raw = {
    version: 99,
    rev: 5,
    notes: [{ id: 'note-1', lines: [{ kind: 'bogus', text: 'x' }] }],
    boards: [
      {
        id: 'b',
        columns: [{ id: 'todo', title: 'T' }],
        cards: [{ id: 'card-1', columnId: 'nope', order: 7 }],
      },
    ],
    settings: { activeView: 'board' },
    extra: { keep: true },
  };
  const before = clone(raw);
  const first = normalizeDocument(raw);
  assert.deepEqual(raw, before);
  assert.equal(first.version, 5);
  assert.equal(first.rev, 5);
  assert.equal(first.notes[0].lines.length, 0);
  assert.equal(first.boards[0].columns[0].title, 'T');
  assert.equal(first.boards[0].cards[0].columnId, 'todo');
});

/* ------------------------------------------------------------------ *
 * normalizeNote / normalizeCard / normalizeLines
 * ------------------------------------------------------------------ */

test('normalizeNote 默认值与 trashed/deletedAt', () => {
  const note = normalizeNote(undefined, 1000);
  assert.match(note.id, /^note-[0-9a-f]{10}$/);
  assert.deepEqual(note.lines, []);
  assert.equal(note.text, '');
  assert.equal(note.color, 'amber');
  assert.equal(note.x, 0.05);
  assert.equal(note.y, 0.05);
  assert.equal(note.w, 240);
  assert.equal(note.rev, 1);
  assert.equal(note.createdAt, 1000);
  assert.equal(note.updatedAt, 1000);
  assert.equal(note.deletedAt, null);

  const trashed = normalizeNote({ trashed: true }, 2000);
  assert.equal(trashed.trashed, true);
  assert.equal(trashed.deletedAt, 2000);

  const kept = normalizeNote({ deletedAt: 123 }, 2000);
  assert.equal(kept.trashed, false);
  assert.equal(kept.deletedAt, null);

  const withLines = normalizeNote(
    { lines: [{ kind: 'todo', text: '买牛奶', done: true }], linkedCardId: 'card-1' },
    3000,
  );
  assert.equal(withLines.text, '☑ 买牛奶');
  assert.equal(withLines.linkedCardId, 'card-1');
  assert.equal(withLines.lines[0].done, true);
});

test('normalizeNote 高度：缺省自适应、数字夹取、非法回退', () => {
  assert.equal(normalizeNote({}, 1000).h, null);
  assert.equal(normalizeNote({ h: null }, 1000).h, null);
  assert.equal(normalizeNote({ h: 'auto' }, 1000).h, null);
  assert.equal(normalizeNote({ h: 320 }, 1000).h, 320);
  // 越界夹取
  assert.equal(normalizeNote({ h: 10 }, 1000).h, 80);
  assert.equal(normalizeNote({ h: 5000 }, 1000).h, 900);
  // 便签带上高度后仍保留其它字段
  const note = normalizeNote({ h: 260, w: 300, color: 'sky' }, 1000);
  assert.deepEqual({ h: note.h, w: note.w, color: note.color }, { h: 260, w: 300, color: 'sky' });
});

test('normalizeCard 默认值与字段校验', () => {
  const card = normalizeCard(undefined, 1000);
  assert.match(card.id, /^card-[0-9a-f]{10}$/);
  assert.equal(card.title, '');
  assert.equal(card.note, '');
  assert.equal(card.acceptance, '');
  assert.equal(card.columnId, 'todo');
  assert.equal(card.order, 0);
  assert.equal(card.priority, 'P2');
  assert.deepEqual(card.labels, []);
  assert.equal(card.dueDate, null);
  assert.equal(card.done, false);
  assert.equal(card.acceptedAt, null);
  assert.equal(card.noteId, null);
  assert.equal(card.trashed, false);
  assert.equal(card.deletedAt, null);
  assert.equal(card.rev, 1);
  assert.equal(card.createdAt, 1000);
  assert.equal(card.updatedAt, 1000);

  const full = normalizeCard(
    {
      title: '任务',
      note: '- [ ] 子项',
      columnId: 'doing',
      order: 3,
      priority: 'P1',
      labels: ['功能', ' 功能 ', 'bug'],
      dueDate: '2026-12-31',
      done: true,
      noteId: 'note-1',
      trashed: true,
      deletedAt: 9,
      rev: 4,
    },
    5000,
  );
  assert.equal(full.columnId, 'doing');
  assert.equal(full.order, 3);
  assert.equal(full.priority, 'P1');
  assert.deepEqual(full.labels, ['功能', 'bug']);
  assert.equal(full.dueDate, '2026-12-31');
  assert.equal(full.done, true);
  assert.equal(full.noteId, 'note-1');
  assert.equal(full.trashed, true);
  assert.equal(full.deletedAt, 9);
  assert.equal(full.rev, 4);

  const invalidDate = normalizeCard({ dueDate: '2026-1-1' }, 1);
  assert.equal(invalidDate.dueDate, null);
  const leapDay = normalizeCard({ dueDate: '2024-02-29' }, 1);
  assert.equal(leapDay.dueDate, '2024-02-29');
});

test('normalizeCard 检查项（schema v2）：默认空、补 id、去重、夹取', () => {
  assert.deepEqual(normalizeCard({}, 1).checklist, []);

  const card = normalizeCard(
    {
      checklist: [
        { text: '子项一', done: true },
        { id: 'item-fixed01', text: '子项二' },
        { id: 'item-fixed01', text: '重复 id' },
        'string 条目应被丢弃',
        { text: 'x'.repeat(400) },
      ],
    },
    1,
  );
  assert.equal(card.checklist.length, 4);
  assert.equal(card.checklist[0].done, true);
  assert.match(card.checklist[0].id, /^item-[0-9a-f]{10}$/);
  assert.equal(card.checklist[1].id, 'item-fixed01');
  // 重复 id 会重新生成，不会出现两个相同 id
  assert.notEqual(card.checklist[2].id, 'item-fixed01');
  assert.equal(new Set(card.checklist.map((item) => item.id)).size, 4);
  // 文本按 300 截断
  assert.equal(card.checklist[3].text.length, 300);

  // 数量上限 100
  const many = normalizeCard({ checklist: Array.from({ length: 130 }, (_, index) => ({ text: `n${index}` })) }, 1);
  assert.equal(many.checklist.length, 100);
});

test('cardSummary 带上检查项进度', () => {
  const card = normalizeCard(
    {
      title: '有子项',
      checklist: [
        { text: 'a', done: true },
        { text: 'b', done: false },
      ],
    },
    1,
  );
  assert.match(cardSummary(card), /\[☑ 1\/2\]/);
  const plain = normalizeCard({ title: '无子项' }, 1);
  assert.doesNotMatch(cardSummary(plain), /☑/);
  assert.doesNotMatch(cardSummary(plain), /\[acceptance\]/);
  const withAcceptance = normalizeCard({ title: '有验收', acceptance: '能跑通冒烟测试' }, 1);
  assert.match(cardSummary(withAcceptance), /\[acceptance\]/);
});

test('旧版文档读入即迁移到 v5：补 checklist/blocked/acceptance/acceptedAt 与 doneColumnId', () => {
  const doc = normalizeDocument({
    version: 1,
    boards: [{ id: 'board-main', cards: [{ id: 'card-old', title: '旧卡' }] }],
  });
  assert.equal(doc.version, 5);
  assert.deepEqual(doc.boards[0].cards[0].checklist, []);
  assert.equal(doc.boards[0].cards[0].blocked, false);
  assert.equal(doc.boards[0].cards[0].blockedReason, null);
  assert.equal(doc.boards[0].cards[0].acceptance, '');
  assert.equal(doc.boards[0].cards[0].acceptedAt, null);
  assert.equal(doc.boards[0].doneColumnId, 'done', 'v1 defaults to the todo/doing/done board');

  const kept = normalizeDocument({
    version: 2,
    boards: [{ id: 'board-main', cards: [{ id: 'card-new', checklist: [{ text: '保留', done: true }] }] }],
  });
  assert.equal(kept.boards[0].cards[0].checklist[0].text, '保留');
  assert.equal(kept.boards[0].cards[0].checklist[0].done, true);
});

test('v3 → v5：自定义看板按标题推断完成列，并把该列卡片补成完成', () => {
  const doc = normalizeDocument({
    version: 3,
    boards: [
      {
        id: 'board-custom',
        title: '迭代',
        columns: [
          { id: 'col-todo', title: '待办', order: 0 },
          { id: 'col-doing', title: '进行中', order: 1 },
          { id: 'col-ship', title: '完成', order: 2 },
        ],
        cards: [
          { id: 'card-a', title: '在完成列', columnId: 'col-ship', done: false },
          { id: 'card-b', title: '在待办列', columnId: 'col-todo', done: false },
        ],
      },
    ],
  });
  const board = doc.boards[0];
  assert.equal(board.doneColumnId, 'col-ship', 'infers the column titled 完成');
  assert.equal(board.cards.find((card) => card.id === 'card-a').done, true, 'existing done-column cards are backfilled');
  assert.equal(board.cards.find((card) => card.id === 'card-b').done, false);

  // 显式 null / 非法 id 都表示「不指定完成列」，且迁移不回填。
  const cleared = normalizeDocument({
    version: 3,
    boards: [
      {
        id: 'board-main',
        doneColumnId: null,
        columns: [{ id: 'done', title: '完成', order: 0 }],
        cards: [{ id: 'card-c', title: '在完成列', columnId: 'done', done: false }],
      },
    ],
  });
  assert.equal(cleared.boards[0].doneColumnId, null);
  assert.equal(cleared.boards[0].cards[0].done, false);

  const invalid = normalizeDocument({
    version: 4,
    boards: [{ id: 'board-main', doneColumnId: 'col-missing', columns: [{ id: 'done', title: '完成' }] }],
  });
  assert.equal(invalid.boards[0].doneColumnId, null, 'a doneColumnId that is not a column is dropped');
});

test('v4 → v5：只补 acceptedAt，不再回填完成状态', () => {
  const doc = normalizeDocument({
    version: 4,
    boards: [
      {
        id: 'board-main',
        doneColumnId: 'done',
        columns: [
          { id: 'todo', title: '待办', order: 0 },
          { id: 'done', title: '完成', order: 1 },
        ],
        cards: [{ id: 'card-open', title: '完成列里但未完成', columnId: 'done', done: false }],
      },
    ],
  });
  const card = doc.boards[0].cards[0];
  assert.equal(doc.version, 5);
  assert.equal(card.done, false, 'v4 documents must not be backfilled again');
  assert.equal(card.acceptedAt, null, 'acceptance is never inferred from the column');
});

test('normalizeCard 验收状态：默认 null、完成前忽略、完成后保留时间戳', () => {
  assert.equal(normalizeCard({}, 1).acceptedAt, null);
  assert.equal(normalizeCard({ done: false, acceptedAt: 123456 }, 1).acceptedAt, null, 'not done → no acceptance');
  assert.equal(normalizeCard({ done: true, acceptedAt: 123456 }, 1).acceptedAt, 123456);
  assert.equal(normalizeCard({ done: true, acceptedAt: 0 }, 1).acceptedAt, null);
  assert.equal(normalizeCard({ done: true, acceptedAt: 'oops' }, 1).acceptedAt, null);

  const card = normalizeCard({ done: true, acceptedAt: 1710000000000 }, 1);
  assert.match(cardSummary(card), /\[done\] \[accepted\]/);
});

test('normalizeCard 验收标准：默认空、保留换行、截断 2000 字', () => {
  assert.equal(normalizeCard({}, 1).acceptance, '');
  const card = normalizeCard({ acceptance: '第一行\n第二行' }, 1);
  assert.equal(card.acceptance, '第一行\n第二行');
  assert.equal(normalizeCard({ acceptance: 'x'.repeat(2500) }, 1).acceptance.length, 2000);
  assert.equal(normalizeCard({ acceptance: 42 }, 1).acceptance, '42');
});

test('normalizeLines 过滤非法 kind、转字符串、补 done/id', () => {
  const lines = normalizeLines(
    [
      { kind: 'text', text: 1 },
      { kind: 'bogus', text: '丢弃' },
      { kind: 'todo', text: '待办', done: 1 },
      null,
      'string',
      { kind: ' todo ', text: '带空格 kind', done: false },
    ],
    1,
  );
  assert.equal(lines.length, 3);
  assert.deepEqual(lines.map((line) => line.kind), ['text', 'todo', 'todo']);
  assert.deepEqual(lines.map((line) => line.text), ['1', '待办', '带空格 kind']);
  assert.deepEqual(lines.map((line) => line.done), [false, true, false]);
  for (const line of lines) assert.match(line.id, /^l-[0-9a-f]{10}$/);

  assert.deepEqual(normalizeLines(undefined, 1), []);
  assert.deepEqual(normalizeLines({}, 1), []);

  // 重复的 line id 会被重新生成
  const deduped = normalizeLines(
    [
      { id: 'l-same', kind: 'text', text: 'a' },
      { id: 'l-same', kind: 'text', text: 'b' },
    ],
    1,
  );
  assert.notEqual(deduped[0].id, deduped[1].id);
});

/* ------------------------------------------------------------------ *
 * 文本辅助
 * ------------------------------------------------------------------ */

test('noteText 拼接并按 todo 状态加前缀', () => {
  const note = {
    lines: [
      { kind: 'text', text: '正文' },
      { kind: 'todo', text: '已完成', done: true },
      { kind: 'todo', text: '未完成', done: false },
      { kind: 'ul', text: '无序' },
      { kind: 'ol', text: '有序' },
    ],
  };
  assert.equal(noteText(note), '正文\n☑ 已完成\n☐ 未完成\n无序\n有序');
  assert.equal(noteText({ lines: [] }), '');
  assert.equal(noteText(null), '');
});

test('noteTitle 取首个非空行并去 todo 前缀', () => {
  assert.equal(
    noteTitle({ lines: [{ kind: 'text', text: '   ' }, { kind: 'todo', text: '买牛奶', done: true }] }),
    '买牛奶',
  );
  assert.equal(noteTitle({ lines: [{ kind: 'text', text: '标题' }] }), '标题');
  assert.equal(noteTitle({ lines: [] }), '未命名便签');
  assert.equal(noteTitle(null), '未命名便签');
  // lines 为空时退回到 text 副本
  assert.equal(noteTitle({ lines: [], text: '☑ 甲\n乙' }), '甲');
});

test('notePlaceholder 只对空便签给出占位串', () => {
  assert.equal(notePlaceholder({ lines: [] }), '写点什么…');
  assert.equal(notePlaceholder({ lines: [{ kind: 'text', text: '  ' }] }), '写点什么…');
  assert.equal(notePlaceholder(null), '写点什么…');
  assert.equal(notePlaceholder({ lines: [{ kind: 'text', text: '内容' }] }), '');
});

/* ------------------------------------------------------------------ *
 * 排序 / 过滤 / 移动
 * ------------------------------------------------------------------ */

test('sortNotes 支持 updated / created / pinned 且不改入参', () => {
  const notes = [
    normalizeNote({ id: 'n-a', lines: [{ kind: 'text', text: 'a' }], createdAt: 100, updatedAt: 300 }, 500),
    normalizeNote({ id: 'n-b', lines: [{ kind: 'text', text: 'b' }], createdAt: 200, updatedAt: 200 }, 500),
    normalizeNote(
      { id: 'n-c', lines: [{ kind: 'text', text: 'c' }], createdAt: 300, updatedAt: 100, pinned: true },
      500,
    ),
  ];
  const originalOrder = notes.map((note) => note.id);

  assert.deepEqual(sortNotes(notes).map((note) => note.id), ['n-a', 'n-b', 'n-c']);
  assert.deepEqual(sortNotes(notes, 'updated').map((note) => note.id), ['n-a', 'n-b', 'n-c']);
  assert.deepEqual(sortNotes(notes, 'created').map((note) => note.id), ['n-c', 'n-b', 'n-a']);
  assert.deepEqual(sortNotes(notes, 'pinned').map((note) => note.id), ['n-c', 'n-a', 'n-b']);
  assert.deepEqual(sortNotes(notes, 'unknown').map((note) => note.id), ['n-a', 'n-b', 'n-c']);
  assert.deepEqual(notes.map((note) => note.id), originalOrder);
  assert.deepEqual(sortNotes(null), []);
});

test('orderedCards 过滤列与回收站并按 order 升序', () => {
  const cards = [
    { id: 'a', columnId: 'todo', order: 2, trashed: false },
    { id: 'b', columnId: 'todo', order: 0, trashed: true },
    { id: 'c', columnId: 'todo', order: 1, trashed: false },
    { id: 'd', columnId: 'doing', order: 0, trashed: false },
  ];
  assert.deepEqual(orderedCards(cards, 'todo').map((card) => card.id), ['c', 'a']);
  assert.deepEqual(orderedCards(cards, 'doing').map((card) => card.id), ['d']);
  assert.deepEqual(orderedCards(cards, 'done'), []);
  assert.deepEqual(orderedCards(null, 'todo'), []);
});

test('moveCard 跨列移动并重排两列 order', () => {
  const cards = [
    { id: 'a', columnId: 'todo', order: 0 },
    { id: 'b', columnId: 'todo', order: 1 },
    { id: 'c', columnId: 'todo', order: 2 },
    { id: 'd', columnId: 'doing', order: 0 },
    { id: 'e', columnId: 'doing', order: 1 },
  ];
  const before = clone(cards);

  const moved = moveCard(cards, 'b', 'doing', 1);
  assert.notEqual(moved, cards);
  assert.deepEqual(cards, before); // 入参未被修改
  assert.deepEqual(orderedCards(moved, 'todo').map((card) => card.id), ['a', 'c']);
  assert.deepEqual(orderedCards(moved, 'todo').map((card) => card.order), [0, 1]);
  assert.deepEqual(orderedCards(moved, 'doing').map((card) => card.id), ['d', 'b', 'e']);
  assert.deepEqual(orderedCards(moved, 'doing').map((card) => card.order), [0, 1, 2]);
  assert.equal(moved.find((card) => card.id === 'b').columnId, 'doing');
});

test('moveCard 越界夹取与列内重排', () => {
  const cards = [
    { id: 'a', columnId: 'todo', order: 0 },
    { id: 'b', columnId: 'todo', order: 1 },
    { id: 'c', columnId: 'todo', order: 2 },
  ];
  const toEnd = moveCard(cards, 'a', 'todo', 99);
  assert.deepEqual(orderedCards(toEnd, 'todo').map((card) => card.id), ['b', 'c', 'a']);
  const toStart = moveCard(cards, 'c', 'todo', -5);
  assert.deepEqual(orderedCards(toStart, 'todo').map((card) => card.id), ['c', 'a', 'b']);
  assert.deepEqual(orderedCards(toStart, 'todo').map((card) => card.order), [0, 1, 2]);

  // 非法参数：原样返回入参引用
  assert.equal(moveCard(cards, 'missing', 'todo', 0), cards);
  assert.equal(moveCard(cards, 'a', '', 0), cards);
  assert.equal(moveCard(cards, 'a', null, 0), cards);
});

/* ------------------------------------------------------------------ *
 * 墙 ↔ 板 联动
 * ------------------------------------------------------------------ */

test('noteToCard 生成卡片与 linkedCardId 补丁', () => {
  const note = normalizeNote(
    {
      id: 'note-1111111111',
      lines: [
        { id: 'l-1', kind: 'text', text: '购物清单' },
        { id: 'l-2', kind: 'todo', text: '牛奶', done: true },
        { id: 'l-3', kind: 'todo', text: '鸡蛋' },
        { id: 'l-4', kind: 'ul', text: '苹果' },
        { id: 'l-5', kind: 'ol', text: '先洗' },
        { id: 'l-6', kind: 'ol', text: '再切' },
      ],
    },
    777,
  );

  const { card, notePatch } = noteToCard(note, { columnId: 'doing', now: 999 });
  assert.match(card.id, /^card-[0-9a-f]{10}$/);
  assert.equal(card.title, '购物清单');
  assert.equal(card.note, '- [x] 牛奶\n- [ ] 鸡蛋\n- 苹果\n1. 先洗\n2. 再切');
  assert.equal(card.columnId, 'doing');
  assert.equal(card.order, 0);
  assert.equal(card.priority, 'P2');
  assert.deepEqual(card.labels, []);
  assert.equal(card.dueDate, null);
  assert.equal(card.done, false);
  assert.equal(card.noteId, 'note-1111111111');
  assert.equal(card.trashed, false);
  assert.equal(card.deletedAt, null);
  assert.equal(card.createdAt, 999);
  assert.equal(card.updatedAt, 999);
  assert.equal(card.rev, 1);
  assert.deepEqual(notePatch, { linkedCardId: card.id });

  // 默认列 todo
  assert.equal(noteToCard(note).card.columnId, 'todo');
});

test('cardToNote 解析 Markdown 描述为 lines', () => {
  const card = {
    id: 'card-abc',
    title: '写周报',
    note: '- [x] 收集数据\n- [ ] 写总结\n- 列要点\n1. 先列\n普通文本',
  };
  const { note, cardPatch } = cardToNote(card, { now: 500, x: 0.8, y: 0.2 });

  assert.deepEqual(
    note.lines.map((line) => [line.kind, line.text, line.done]),
    [
      ['text', '写周报', false],
      ['todo', '收集数据', true],
      ['todo', '写总结', false],
      ['ul', '列要点', false],
      ['ol', '先列', false],
      ['text', '普通文本', false],
    ],
  );
  assert.equal(note.text, '写周报\n☑ 收集数据\n☐ 写总结\n列要点\n先列\n普通文本');
  assert.equal(noteTitle(note), '写周报');
  assert.equal(note.x, 0.8);
  assert.equal(note.y, 0.2);
  assert.equal(note.w, 240);
  assert.equal(note.color, 'amber');
  assert.equal(note.linkedCardId, 'card-abc');
  assert.equal(note.rev, 1);
  assert.equal(note.createdAt, 500);
  assert.equal(note.updatedAt, 500);
  assert.deepEqual(cardPatch, { noteId: note.id });

  // 默认位置
  const positioned = cardToNote(card).note;
  assert.equal(positioned.x, 0.05);
  assert.equal(positioned.y, 0.05);

  // 空描述只保留标题行
  const { note: titleOnly } = cardToNote({ id: 'card-x', title: '只有标题', note: '' }, { now: 1 });
  assert.equal(titleOnly.lines.length, 1);
  assert.equal(titleOnly.lines[0].kind, 'text');
  assert.equal(titleOnly.lines[0].text, '只有标题');
});

test('noteToCard ↔ cardToNote 往返语义一致', () => {
  const note = normalizeNote(
    {
      id: 'note-2222222222',
      lines: [
        { kind: 'text', text: '标题行' },
        { kind: 'text', text: '第二行正文' },
        { kind: 'todo', text: '勾上', done: true },
        { kind: 'todo', text: '没勾', done: false },
        { kind: 'ul', text: '要点' },
        { kind: 'ol', text: '第一步' },
      ],
    },
    100,
  );

  const { card } = noteToCard(note, { now: 200 });
  const { note: back } = cardToNote(card, { now: 300 });

  assert.equal(card.noteId, note.id);
  assert.equal(back.linkedCardId, card.id);
  assert.equal(noteText(back), noteText(note));
  assert.equal(noteTitle(back), noteTitle(note));
  assert.deepEqual(back.lines.map((line) => line.kind), note.lines.map((line) => line.kind));
  assert.deepEqual(back.lines.map((line) => line.done), note.lines.map((line) => line.done));

  // 再转一次卡，标题与描述保持稳定
  const { card: cardAgain } = noteToCard(back, { now: 400 });
  assert.equal(cardAgain.title, card.title);
  assert.equal(cardAgain.note, card.note);
});

/* ------------------------------------------------------------------ *
 * touch / 摘要
 * ------------------------------------------------------------------ */

test('touch 返回递增 rev 的新对象且不改入参', () => {
  const note = normalizeNote({ id: 'note-x', lines: [] }, 1);
  const touched = touch(note, 12345);
  assert.notEqual(touched, note);
  assert.equal(touched.rev, 2);
  assert.equal(touched.updatedAt, 12345);
  assert.equal(note.rev, 1);
  assert.equal(note.updatedAt, 1);

  const raw = touch({ id: 'x' }, 10);
  assert.equal(raw.rev, 1);
  assert.equal(raw.updatedAt, 10);
});

test('noteSummary 格式、标记与 120 字截断', () => {
  const note = normalizeNote(
    { id: 'note-abcdefghij', lines: [{ kind: 'text', text: '标题' }], color: 'rose', pinned: true },
    1,
  );
  assert.equal(noteSummary(note), '- note-abcdefghij | 标题 | rose [pinned] | 标题');

  const trashed = normalizeNote(
    { id: 'note-zzzzzzzzzz', lines: [{ kind: 'text', text: 'a' }], trashed: true },
    10,
  );
  assert.equal(noteSummary(trashed), '- note-zzzzzzzzzz | a | amber [trash] | a');

  const long = normalizeNote(
    { id: 'note-long', lines: [{ kind: 'text', text: 'x'.repeat(300) }] },
    1,
  );
  const summary = noteSummary(long);
  const preview = summary.split(' | ').at(-1);
  assert.equal(preview.length, 120);
  assert.ok(preview.endsWith('…'));
});

test('cardSummary 格式、标记与 120 字截断', () => {
  const card = normalizeCard(
    { id: 'card-abcdefghij', title: '任务', columnId: 'doing', priority: 'P0', done: true },
    1,
  );
  assert.equal(cardSummary(card), '- card-abcdefghij | 任务 | doing | P0 [done] | ');

  const trashed = normalizeCard(
    { id: 'card-zzzzzzzzzz', title: '废卡', columnId: 'done', priority: 'P3', trashed: true, note: 'm'.repeat(300) },
    1,
  );
  const summary = cardSummary(trashed);
  assert.ok(summary.includes(' [trash] '));
  assert.equal(summary.split(' | ').at(-1).length, 120);
});

test('normalizeCard 阻塞字段：默认 false、原因去空白并截断 200 字', () => {
  const plain = normalizeCard({}, 1);
  assert.equal(plain.blocked, false);
  assert.equal(plain.blockedReason, null);

  const blocked = normalizeCard({ blocked: true, blockedReason: '  等外部 API  ' }, 1);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.blockedReason, '等外部 API');

  const long = normalizeCard({ blocked: true, blockedReason: 'x'.repeat(400) }, 1);
  assert.equal(long.blockedReason.length, 200);

  const blank = normalizeCard({ blocked: true, blockedReason: '   ' }, 1);
  assert.equal(blank.blockedReason, null);
});

test('normalizeSettings 记录每日备份日期（非法值置空）', () => {
  const ok = normalizeDocument({ settings: { lastBackupAt: '2026-11-22' } });
  assert.equal(ok.settings.lastBackupAt, '2026-11-22');
  for (const bad of ['2026-1-1', '11/22/2026', '', 42, null]) {
    assert.equal(normalizeDocument({ settings: { lastBackupAt: bad } }).settings.lastBackupAt, null);
  }
});
