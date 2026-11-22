// 便签墙 + 任务板：纯逻辑数据模型层。
// 约定：所有导出函数都是纯函数（不读写文件、不打日志、不修改入参）；
// newId 依赖随机数，但同进程内通过 issuedIds 保证不重复。

import { randomBytes } from 'node:crypto';

export const SCHEMA_VERSION = 5;
export const NOTE_COLORS = ['amber', 'rose', 'mint', 'sky', 'violet', 'slate', 'plain'];
export const LINE_KINDS = ['text', 'todo', 'ul', 'ol'];
export const PRIORITIES = ['P0', 'P1', 'P2', 'P3'];

const MAX_TEXT = 20000;
/** 卡片验收标准：多行纯文本，上限 2000 字。 */
const MAX_ACCEPTANCE = 2000;
/** 卡片检查项：数量与单项文本上限。 */
const MAX_CHECKLIST = 100;
const MAX_CHECKLIST_TEXT = 300;
const SUMMARY_LIMIT = 120;

const DEFAULT_BOARD_ID = 'board-main';
const DEFAULT_BOARD_TITLE = '默认看板';
const COLUMN_IDS = ['todo', 'doing', 'done'];
const COLUMN_TITLES = { todo: '待办', doing: '进行中', done: '完成' };
/** 看板与列的上限：单文档 JSON，超过这个量级就该换存储了。 */
const MAX_BOARDS = 12;
const MAX_COLUMNS = 8;
const MAX_BOARD_TITLE = 40;
const MAX_COLUMN_TITLE = 24;
const DEFAULT_COLUMN_TITLE = '列';

const DEFAULT_NOTE_COLOR = 'amber';
const DEFAULT_NOTE_TITLE = '未命名便签';
const NOTE_PLACEHOLDER = '写点什么…';
const DEFAULT_NOTE_X = 0.05;
const DEFAULT_NOTE_Y = 0.05;
const DEFAULT_NOTE_W = 240;
const MIN_NOTE_W = 180;
const MAX_NOTE_W = 520;
/** 便签高度：null = 跟随内容自适应；拖右下角后变成固定像素。 */
const MIN_NOTE_H = 80;
const MAX_NOTE_H = 900;

const DEFAULT_CARD_COLUMN = 'todo';
const DEFAULT_PRIORITY = 'P2';

const issuedIds = new Set();

/* ------------------------------------------------------------------ *
 * 通用小工具
 * ------------------------------------------------------------------ */

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return NaN;
}

function clampNumber(value, min, max, fallback) {
  const number = toNumber(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function toInteger(value, fallback, min = 0) {
  const number = toNumber(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.floor(number));
}

function toTimestamp(value, fallback) {
  const number = toNumber(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.floor(number));
}

function toBool(value) {
  return value === true || value === 1 || value === 'true' || value === '1';
}

function toText(value, max = MAX_TEXT) {
  let text;
  if (typeof value === 'string') text = value;
  else if (typeof value === 'number' || typeof value === 'boolean') text = String(value);
  else return '';
  return text.length > max ? text.slice(0, max) : text;
}

function toOptionalId(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function ensureId(value, prefix) {
  const id = toOptionalId(value);
  return id === null ? newId(prefix) : id;
}

function oneLine(value, max = SUMMARY_LIMIT) {
  const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

/* ------------------------------------------------------------------ *
 * 常量 / 空文档
 * ------------------------------------------------------------------ */

/** 生成 `${prefix}-${10 位小写 hex}` 形式的 id，同进程内不重复。 */
export function newId(prefix = 'id') {
  const name = typeof prefix === 'string' && prefix.trim() !== '' ? prefix.trim() : 'id';
  for (;;) {
    const id = `${name}-${randomBytes(5).toString('hex')}`;
    if (!issuedIds.has(id)) {
      issuedIds.add(id);
      return id;
    }
  }
}

/** 默认三列（todo / doing / done）。每次返回全新对象。 */
export function defaultColumns() {
  return COLUMN_IDS.map((id, order) => ({ id, title: COLUMN_TITLES[id], order }));
}

/** 默认看板（三列固定为 todo / doing / done，完成列 = done）。每次返回全新对象。 */
export function defaultBoard() {
  return {
    id: DEFAULT_BOARD_ID,
    title: DEFAULT_BOARD_TITLE,
    columns: defaultColumns(),
    doneColumnId: 'done',
    cards: [],
  };
}

/** 完整空文档。每次返回全新对象，可直接被调用方修改。 */
export function emptyDocument() {
  return {
    version: SCHEMA_VERSION,
    rev: 0,
    notes: [],
    boards: [defaultBoard()],
    settings: { activeView: 'wall', wallDensity: 'auto', activeBoardId: DEFAULT_BOARD_ID, lastBackupAt: null },
    updatedAt: 0,
  };
}

/* ------------------------------------------------------------------ *
 * 归一化
 * ------------------------------------------------------------------ */

/**
 * 修正一行清单条目：丢弃非法 kind，text 转字符串，todo 行兜底 done 布尔。
 * 返回新数组；入参不被修改。
 */
export function normalizeLines(lines, now = Date.now()) {
  void now; // 行条目暂无时间字段，保留参数是为了和其它 normalize* 保持签名一致
  if (!Array.isArray(lines)) return [];
  const seenIds = new Set();
  const out = [];
  for (const raw of lines) {
    if (!isPlainObject(raw)) continue;
    const kind = typeof raw.kind === 'string' ? raw.kind.trim() : 'text';
    if (!LINE_KINDS.includes(kind)) continue;
    let id = toOptionalId(raw.id);
    if (id === null || seenIds.has(id)) id = newId('l');
    seenIds.add(id);
    out.push({
      id,
      kind,
      text: toText(raw.text),
      done: kind === 'todo' ? toBool(raw.done) : false,
    });
  }
  return out;
}

/** 修正一张便签：补默认、夹取 x/y/w、生成缺失 id、修正 lines、派生 text。 */
export function normalizeNote(input, now = Date.now()) {
  const raw = isPlainObject(input) ? input : {};
  const nowValue = toTimestamp(now, Date.now());
  const createdAt = toTimestamp(raw.createdAt, nowValue);
  const updatedAt = toTimestamp(raw.updatedAt, createdAt);
  const trashed = toBool(raw.trashed);
  const lines = normalizeLines(raw.lines, nowValue);
  const note = {
    id: ensureId(raw.id, 'note'),
    lines,
    text: '',
    color: NOTE_COLORS.includes(raw.color) ? raw.color : DEFAULT_NOTE_COLOR,
    pinned: toBool(raw.pinned),
    collapsed: toBool(raw.collapsed),
    x: clampNumber(raw.x, 0, 1, DEFAULT_NOTE_X),
    y: clampNumber(raw.y, 0, 1, DEFAULT_NOTE_Y),
    w: clampNumber(raw.w, MIN_NOTE_W, MAX_NOTE_W, DEFAULT_NOTE_W),
    h: normalizeNoteHeight(raw.h),
    trashed,
    deletedAt: trashed ? toTimestamp(raw.deletedAt, nowValue) : null,
    linkedCardId: toOptionalId(raw.linkedCardId),
    rev: Math.max(1, toInteger(raw.rev, 1)),
    createdAt,
    updatedAt,
  };
  const derived = noteText(note);
  note.text = toText(derived !== '' ? derived : raw.text);
  return note;
}

/** 便签高度：非法/缺省 = null（自适应内容），数字则夹到 [MIN_NOTE_H, MAX_NOTE_H]。 */
function normalizeNoteHeight(value) {
  if (value === null || value === undefined) return null;
  const height = Number(value);
  if (!Number.isFinite(height)) return null;
  return clampNumber(height, MIN_NOTE_H, MAX_NOTE_H, MIN_NOTE_H);
}

/** 修正一张任务卡：补默认、校验枚举/日期、生成缺失 id。 */
export function normalizeCard(input, now = Date.now()) {
  const raw = isPlainObject(input) ? input : {};
  const nowValue = toTimestamp(now, Date.now());
  const createdAt = toTimestamp(raw.createdAt, nowValue);
  const updatedAt = toTimestamp(raw.updatedAt, createdAt);
  const trashed = toBool(raw.trashed);
  const done = toBool(raw.done);
  const acceptedAt = normalizeAcceptedAt(raw.acceptedAt);
  return {
    id: ensureId(raw.id, 'card'),
    title: toText(raw.title),
    note: toText(raw.note),
    acceptance: toText(raw.acceptance, MAX_ACCEPTANCE),
    columnId: toOptionalId(raw.columnId) || DEFAULT_CARD_COLUMN,
    order: toInteger(raw.order, 0),
    priority: PRIORITIES.includes(raw.priority) ? raw.priority : DEFAULT_PRIORITY,
    labels: normalizeLabels(raw.labels),
    checklist: normalizeChecklist(raw.checklist),
    dueDate: normalizeDueDate(raw.dueDate),
    blocked: toBool(raw.blocked),
    blockedReason: normalizeBlockedReason(raw.blockedReason),
    done,
    // 验收是第二状态（schema v5）：只有完成后的卡才能带验收时间戳。
    acceptedAt: done ? acceptedAt : null,
    noteId: toOptionalId(raw.noteId),
    trashed,
    deletedAt: trashed ? toTimestamp(raw.deletedAt, nowValue) : null,
    createdAt,
    updatedAt,
    rev: Math.max(1, toInteger(raw.rev, 1)),
  };
}

/** 用户验收时间戳：正数才有效，其余存 null。 */
function normalizeAcceptedAt(value) {
  const number = toNumber(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.floor(number);
}

/** 「阻塞原因」：去空白、200 字上限；空串存 null。 */
function normalizeBlockedReason(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text.slice(0, 200);
}

function normalizeLabels(labels) {
  if (!Array.isArray(labels)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of labels) {
    if (typeof raw !== 'string') continue;
    const label = raw.trim();
    if (label === '' || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

/**
 * 修正卡片检查项（schema v2）：每项 `{ id, text, done }`；
 * 缺 id 或重复 id 重新生成，空文本保留（用户常在输入中），数量与长度夹取。
 */
function normalizeChecklist(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    if (!isPlainObject(raw)) continue;
    let id = toOptionalId(raw.id);
    if (id === null || seen.has(id)) id = newId('item');
    seen.add(id);
    out.push({
      id,
      text: toText(raw.text).slice(0, MAX_CHECKLIST_TEXT),
      done: toBool(raw.done),
    });
    if (out.length >= MAX_CHECKLIST) break;
  }
  return out;
}

function normalizeDueDate(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  return valid ? text : null;
}

/**
 * 容错归一化整个文档：
 * - 非对象输入 → emptyDocument()；
 * - 逐字段夹取，丢弃/去重非法 id；
 * - 保留全部看板（去重 id，至多 MAX_BOARDS 块，至少 1 块）；
 * - 每块看板保留自定义列（至少 1 列），卡片列不存在时落第一列；
 * - 每列卡片 order 重排为 0..n-1；
 * - `settings.activeBoardId` 指向不存在的板时回落到第一块；
 * - version 固定为当前 SCHEMA_VERSION（读入旧版文档即视为已迁移：卡片补
 *   `acceptance` / `acceptedAt`，看板补 `doneColumnId`；v3 及更早还会把该列里的
 *   卡片补成完成）；
 * - 返回全新对象，不修改 raw。
 */
export function normalizeDocument(raw) {
  if (!isPlainObject(raw)) return emptyDocument();
  const now = Date.now();
  const fromVersion = toInteger(raw.version, 0);
  // done 回填只属于 v3 → v4 那一次迁移；v4 → v5 只补 acceptedAt，不再改动完成状态。
  const backfillLegacyDone = fromVersion < 4;
  const boards = normalizeBoards(raw.boards, now, backfillLegacyDone);
  const settings = normalizeSettings(raw.settings);
  const activeBoardId =
    settings.activeBoardId !== null && boards.some((board) => board.id === settings.activeBoardId)
      ? settings.activeBoardId
      : boards[0].id;
  return {
    version: SCHEMA_VERSION,
    rev: toInteger(raw.rev, 0),
    notes: normalizeNotes(raw.notes, now),
    boards,
    settings: { ...settings, activeBoardId },
    updatedAt: toTimestamp(raw.updatedAt, 0),
  };
}

function normalizeNotes(value, now) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    if (!isPlainObject(raw)) continue;
    const note = normalizeNote(raw, now);
    if (seen.has(note.id)) continue; // 重复 id 保留第一个
    seen.add(note.id);
    out.push(note);
  }
  return out;
}

/** 归一化全部看板：去重 id，至多 MAX_BOARDS 块，至少 1 块。 */
function normalizeBoards(value, now, backfillLegacyDone) {
  const candidates = Array.isArray(value) ? value.filter(isPlainObject) : [];
  const seen = new Set();
  const boards = [];
  for (const raw of candidates) {
    const board = normalizeBoard(raw, now, backfillLegacyDone);
    if (seen.has(board.id)) continue; // 重复 id 保留第一个
    seen.add(board.id);
    boards.push(board);
    if (boards.length >= MAX_BOARDS) break;
  }
  if (boards.length === 0) boards.push(defaultBoard());
  return boards;
}

/** 归一化一块看板：保留自定义列，卡片列不存在时落第一列。 */
function normalizeBoard(raw, now, backfillLegacyDone) {
  const columns = normalizeColumns(raw.columns);
  const board = {
    id: toOptionalId(raw.id) || DEFAULT_BOARD_ID,
    title: (toText(raw.title).trim() || DEFAULT_BOARD_TITLE).slice(0, MAX_BOARD_TITLE),
    columns,
    doneColumnId: normalizeDoneColumnId(raw, columns),
    cards: [],
  };
  board.cards = normalizeCards(raw.cards, columns, now);
  if (backfillLegacyDone === true) backfillDone(board);
  return board;
}

/**
 * 看板的「完成列」：
 * - 字段存在（含 null）→ 只接受本板已有的列 id，否则视为「不指定」；
 * - 字段缺失（v3 及更早）→ 先找 id 为 `done` 的列，再找标题为「完成 / 已完成 /
 *   Done / Completed」的列，都没有则不指定。
 */
function normalizeDoneColumnId(raw, columns) {
  if (Object.prototype.hasOwnProperty.call(raw, 'doneColumnId')) {
    const id = toOptionalId(raw.doneColumnId);
    return id !== null && columns.some((column) => column.id === id) ? id : null;
  }
  return inferDoneColumnId(columns);
}

/**
 * 猜一列作为「完成列」：id 为 `done` 优先，其次按标题匹配。新建看板模板与
 * v3 → v4 迁移共用。
 */
export function inferDoneColumnId(columns) {
  const list = Array.isArray(columns) ? columns : [];
  const byId = list.find((column) => isPlainObject(column) && column.id === 'done');
  if (byId !== undefined) return byId.id;
  const byTitle = list.find(
    (column) => isPlainObject(column) && /^(完成|已完成|done|completed)$/i.test(toText(column.title).trim()),
  );
  return byTitle === undefined ? null : byTitle.id;
}

/** v3 → v4：把已经躺在完成列里的卡片补成 `done: true`（一次性迁移）。 */
function backfillDone(board) {
  if (board.doneColumnId === null) return;
  for (const card of board.cards) {
    if (card.columnId === board.doneColumnId && card.done !== true) card.done = true;
  }
}

/** 归一化列：保留合法的自定义列，去重 id，至少 1 列。 */
function normalizeColumns(value) {
  const candidates = Array.isArray(value) ? value.filter(isPlainObject) : [];
  const seen = new Set();
  const columns = [];
  for (const raw of candidates) {
    const id = toOptionalId(raw.id);
    if (id === null || seen.has(id)) continue;
    seen.add(id);
    const title = toText(raw.title).trim();
    columns.push({
      id,
      title: (title === '' ? COLUMN_TITLES[id] ?? DEFAULT_COLUMN_TITLE : title).slice(0, MAX_COLUMN_TITLE),
      order: columns.length,
    });
    if (columns.length >= MAX_COLUMNS) break;
  }
  if (columns.length === 0) {
    return COLUMN_IDS.map((id, order) => ({ id, title: COLUMN_TITLES[id], order }));
  }
  return columns;
}

function normalizeCards(value, columns, now) {
  if (!Array.isArray(value)) return [];
  const columnIds = new Set(columns.map((column) => column.id));
  const fallback = columns[0].id;
  const seen = new Set();
  const cards = [];
  for (const raw of value) {
    if (!isPlainObject(raw)) continue;
    const card = normalizeCard(raw, now);
    if (seen.has(card.id)) continue; // 重复 id 保留第一个
    seen.add(card.id);
    if (!columnIds.has(card.columnId)) card.columnId = fallback;
    cards.push(card);
  }
  // 每列 order 重排为连续整数；同 order 时保持输入顺序（sort 稳定）。
  const byColumn = new Map(columns.map((column) => [column.id, []]));
  for (const card of cards) byColumn.get(card.columnId).push(card);
  for (const column of columns) {
    const columnCards = byColumn.get(column.id);
    columnCards.sort((a, b) => a.order - b.order);
    columnCards.forEach((card, index) => {
      card.order = index;
    });
  }
  return cards;
}

/** 备份日期键 'YYYY-MM-DD'；非法值存 null。 */
function normalizeDateKey(value) {
  if (typeof value !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : null;
}

function normalizeSettings(value) {
  const raw = isPlainObject(value) ? value : {};
  const wallDensity = toOptionalId(raw.wallDensity);
  return {
    activeView: raw.activeView === 'board' ? 'board' : 'wall',
    wallDensity: wallDensity === null ? 'auto' : wallDensity.slice(0, 40),
    activeBoardId: toOptionalId(raw.activeBoardId),
    lastBackupAt: normalizeDateKey(raw.lastBackupAt),
  };
}

/* ------------------------------------------------------------------ *
 * 便签读法辅助
 * ------------------------------------------------------------------ */

/** lines 拼接成的可读文本；todo 行带 '☑ ' / '☐ ' 前缀，其余原样。 */
export function noteText(note) {
  if (!isPlainObject(note) || !Array.isArray(note.lines)) return '';
  const parts = [];
  for (const line of note.lines) {
    if (!isPlainObject(line)) continue;
    const text = toText(line.text);
    if (line.kind === 'todo') parts.push(`${toBool(line.done) ? '☑' : '☐'} ${text}`);
    else parts.push(text);
  }
  return parts.join('\n');
}

/** 首个非空行文本（不含 todo 前缀），空便签返回 '未命名便签'。 */
export function noteTitle(note) {
  if (!isPlainObject(note)) return DEFAULT_NOTE_TITLE;
  const lines = Array.isArray(note.lines) ? note.lines : [];
  for (const line of lines) {
    if (!isPlainObject(line)) continue;
    const text = toText(line.text).trim();
    if (text !== '') return text;
  }
  // lines 为空或全为空时，退回到持久化的 text 副本
  if (typeof note.text === 'string') {
    for (const rawLine of note.text.split('\n')) {
      const text = rawLine.replace(/^[☑☐]\s*/, '').trim();
      if (text !== '') return text;
    }
  }
  return DEFAULT_NOTE_TITLE;
}

/** 空便签的输入占位串；已有内容时返回空串（占位符本身不再需要）。 */
export function notePlaceholder(note) {
  const source = isPlainObject(note) ? note : {};
  const lines = Array.isArray(source.lines) ? source.lines : [];
  const hasContent = lines.some(
    (line) => isPlainObject(line) && toText(line.text).trim() !== '',
  );
  return hasContent ? '' : NOTE_PLACEHOLDER;
}

/* ------------------------------------------------------------------ *
 * 排序 / 过滤
 * ------------------------------------------------------------------ */

/** 排序便签（返回新数组）：'updated'（默认）| 'created' | 'pinned'。 */
export function sortNotes(notes, mode = 'updated') {
  if (!Array.isArray(notes)) return [];
  const key = mode === 'created' || mode === 'pinned' ? mode : 'updated';
  const time = (value) => (Number.isFinite(value) ? value : 0);
  const byUpdated = (a, b) => {
    const left = isPlainObject(a) ? a : {};
    const right = isPlainObject(b) ? b : {};
    return time(right.updatedAt) - time(left.updatedAt) || time(right.createdAt) - time(left.createdAt);
  };
  const list = notes.slice();
  if (key === 'pinned') {
    list.sort((a, b) => {
      const pinnedDelta =
        (isPlainObject(b) && toBool(b.pinned) ? 1 : 0) - (isPlainObject(a) && toBool(a.pinned) ? 1 : 0);
      return pinnedDelta !== 0 ? pinnedDelta : byUpdated(a, b);
    });
  } else if (key === 'created') {
    list.sort((a, b) => {
      const left = isPlainObject(a) ? a : {};
      const right = isPlainObject(b) ? b : {};
      return time(right.createdAt) - time(left.createdAt) || byUpdated(a, b);
    });
  } else {
    list.sort(byUpdated);
  }
  return list;
}

/** 某列里未进回收站的卡片，按 order 升序（返回新数组）。 */
export function orderedCards(cards, columnId) {
  if (!Array.isArray(cards)) return [];
  return cards
    .filter(
      (card) =>
        isPlainObject(card) && card.columnId === columnId && !toBool(card.trashed),
    )
    .sort((a, b) => {
      const left = Number.isFinite(a.order) ? a.order : 0;
      const right = Number.isFinite(b.order) ? b.order : 0;
      return left - right;
    });
}

/**
 * 移动卡片（跨列或列内重排），返回新的 cards 数组，不改入参。
 * 目标 id 不存在或 columnId 非法时原样返回入参引用；
 * toIndex 越界时夹取到 [0, 目标列长度]。
 */
export function moveCard(cards, id, columnId, toIndex) {
  if (!Array.isArray(cards)) return cards;
  const targetColumn = toOptionalId(columnId);
  if (targetColumn === null) return cards;
  const moving = cards.find((card) => isPlainObject(card) && card.id === id);
  if (moving === undefined) return cards;

  // 按列收集除待移动卡片以外的所有卡片（回收站卡片也保留位置，方便整列重排）。
  const byColumn = new Map();
  for (const card of cards) {
    if (!isPlainObject(card) || card === moving) continue;
    const key = toOptionalId(card.columnId) || DEFAULT_CARD_COLUMN;
    if (!byColumn.has(key)) byColumn.set(key, []);
    byColumn.get(key).push(card);
  }
  for (const list of byColumn.values()) {
    list.sort((a, b) => {
      const left = Number.isFinite(a.order) ? a.order : 0;
      const right = Number.isFinite(b.order) ? b.order : 0;
      return left - right;
    });
  }

  const destination = byColumn.get(targetColumn) || [];
  let index = Math.floor(Number(toIndex));
  if (!Number.isFinite(index)) index = destination.length;
  index = Math.max(0, Math.min(index, destination.length));
  destination.splice(index, 0, { ...moving, columnId: targetColumn });
  byColumn.set(targetColumn, destination);

  const orderById = new Map();
  for (const list of byColumn.values()) {
    list.forEach((card, position) => {
      orderById.set(card.id, position);
    });
  }

  return cards.map((card) => {
    if (!isPlainObject(card)) return card;
    const order = orderById.has(card.id) ? orderById.get(card.id) : toInteger(card.order, 0);
    if (card === moving) return { ...card, columnId: targetColumn, order };
    return { ...card, order };
  });
}

/** 生成实体更新副本：rev+1、updatedAt=now。 */
export function touch(entity, now = Date.now()) {
  const source = isPlainObject(entity) ? entity : {};
  const updatedAt = toTimestamp(now, Date.now());
  return {
    ...source,
    rev: toInteger(source.rev, 0) + 1,
    updatedAt,
  };
}

/* ------------------------------------------------------------------ *
 * 墙 ↔ 板 联动
 * ------------------------------------------------------------------ */

/** 便签正文的 Markdown 渲染（不含被用作标题的那一行）。 */
function renderNoteBody(note) {
  if (!isPlainObject(note)) return '';
  const lines = Array.isArray(note.lines) ? note.lines : [];
  let titleIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (isPlainObject(line) && toText(line.text).trim() !== '') {
      titleIndex = index;
      break;
    }
  }
  const body = titleIndex === -1 ? [] : lines.slice(titleIndex + 1);
  const rendered = [];
  let orderedIndex = 0;
  for (const line of body) {
    if (!isPlainObject(line)) continue;
    const text = toText(line.text);
    if (line.kind === 'todo') {
      rendered.push(`- [${toBool(line.done) ? 'x' : ' '}] ${text}`);
    } else if (line.kind === 'ul') {
      rendered.push(`- ${text}`);
    } else if (line.kind === 'ol') {
      orderedIndex += 1;
      rendered.push(`${orderedIndex}. ${text}`);
    } else {
      rendered.push(text);
    }
  }
  return rendered.join('\n');
}

/**
 * 便签 → 任务卡。返回 { card, notePatch }。
 * 卡标题取便签标题，卡描述取「标题行之后的正文」的 Markdown。
 */
export function noteToCard(note, { columnId = DEFAULT_CARD_COLUMN, now = Date.now() } = {}) {
  const source = isPlainObject(note) ? note : {};
  const at = toTimestamp(now, Date.now());
  const card = {
    id: newId('card'),
    title: noteTitle(source),
    note: toText(renderNoteBody(source)),
    columnId: toOptionalId(columnId) || DEFAULT_CARD_COLUMN,
    order: 0,
    priority: DEFAULT_PRIORITY,
    labels: [],
    dueDate: null,
    done: false,
    noteId: toOptionalId(source.id),
    trashed: false,
    deletedAt: null,
    createdAt: at,
    updatedAt: at,
    rev: 1,
  };
  return { card, notePatch: { linkedCardId: card.id } };
}

/** 解析 Markdown 描述行（'- [ ] ' / '- [x] ' / '- ' / 'N. ' / 其它）。 */
function parseMarkdownLine(rawLine) {
  const line = String(rawLine == null ? '' : rawLine);
  let match = /^-\s*\[([ xX])\]\s?(.*)$/.exec(line);
  if (match !== null) return { kind: 'todo', text: match[2], done: match[1].toLowerCase() === 'x' };
  match = /^-\s+(.*)$/.exec(line);
  if (match !== null) return { kind: 'ul', text: match[1], done: false };
  match = /^\s*(\d+)\.\s+(.*)$/.exec(line);
  if (match !== null) return { kind: 'ol', text: match[2], done: false };
  return { kind: 'text', text: line, done: false };
}

/**
 * 任务卡 → 便签。返回 { note, cardPatch }。
 * note.lines = 卡标题一行 text + 卡描述逐行解析；卡侧只补 noteId 外键。
 */
export function cardToNote(card, { now = Date.now(), x = null, y = null } = {}) {
  const source = isPlainObject(card) ? card : {};
  const at = toTimestamp(now, Date.now());
  const lines = [
    { id: newId('l'), kind: 'text', text: toText(source.title), done: false },
  ];
  const body = typeof source.note === 'string' && source.note !== '' ? source.note.split(/\r?\n/) : [];
  for (const rawLine of body) {
    const parsed = parseMarkdownLine(rawLine);
    lines.push({ id: newId('l'), kind: parsed.kind, text: toText(parsed.text), done: parsed.done });
  }
  const rawNote = {
    id: newId('note'),
    lines,
    text: '',
    color: DEFAULT_NOTE_COLOR,
    pinned: false,
    collapsed: false,
    x: x === null || x === undefined ? DEFAULT_NOTE_X : x,
    y: y === null || y === undefined ? DEFAULT_NOTE_Y : y,
    w: DEFAULT_NOTE_W,
    trashed: false,
    deletedAt: null,
    linkedCardId: toOptionalId(source.id),
    rev: 1,
    createdAt: at,
    updatedAt: at,
  };
  const note = normalizeNote(rawNote, at);
  return { note, cardPatch: { noteId: note.id } };
}

/* ------------------------------------------------------------------ *
 * 文本摘要（给模型工具/日志用）
 * ------------------------------------------------------------------ */

/** 单行便签摘要：`- id | 标题 | 颜色[pinned][trash] | text 截断 120`。 */
export function noteSummary(note) {
  const source = isPlainObject(note) ? note : {};
  const id = typeof source.id === 'string' ? source.id : '';
  const color = NOTE_COLORS.includes(source.color) ? source.color : DEFAULT_NOTE_COLOR;
  const flags = `${toBool(source.pinned) ? ' [pinned]' : ''}${toBool(source.trashed) ? ' [trash]' : ''}`;
  const text = noteText(source) || toText(source.text);
  return `- ${id} | ${noteTitle(source)} | ${color}${flags} | ${oneLine(text)}`;
}

/** 单行卡片摘要：`- id | 标题 | columnId | 优先级[done][accepted][trash][☑ d/n][acceptance] | note 截断 120`。 */
export function cardSummary(card) {
  const source = isPlainObject(card) ? card : {};
  const id = typeof source.id === 'string' ? source.id : '';
  const priority = PRIORITIES.includes(source.priority) ? source.priority : DEFAULT_PRIORITY;
  const accepted = normalizeAcceptedAt(source.acceptedAt) !== null;
  const flags = `${toBool(source.done) ? ' [done]' : ''}${accepted ? ' [accepted]' : ''}${toBool(source.trashed) ? ' [trash]' : ''}`;
  const items = Array.isArray(source.checklist) ? source.checklist : [];
  const progress = items.length === 0
    ? ''
    : ` [☑ ${items.filter((item) => toBool(item?.done)).length}/${items.length}]`;
  const acceptance = toText(source.acceptance).trim() === '' ? '' : ' [acceptance]';
  return `- ${id} | ${toText(source.title)} | ${toText(source.columnId)} | ${priority}${flags}${progress}${acceptance} | ${oneLine(toText(source.note))}`;
}
