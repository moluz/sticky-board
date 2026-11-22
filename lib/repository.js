/**
 * sticky-board repository: every note, card, column and linkage operation the
 * panel and the agent tools share. One implementation, two callers — the HTTP
 * route and `lib/tools.js` both call these methods, so UI and model can never
 * drift apart.
 *
 * All methods are async: they first wait for the store to load, then run one
 * serialized mutation on the single JSON document.
 *
 * @module @local/sticky-board/repository
 */

import {
  LINE_KINDS,
  NOTE_COLORS,
  PRIORITIES,
  cardToNote,
  defaultColumns,
  noteText,
  normalizeCard,
  normalizeDocument,
  normalizeLines,
  normalizeNote,
  noteToCard,
  noteTitle,
  orderedCards,
  newId,
} from './model.js';

/** Hard capacity, mirroring the plan's 500/500 ceiling. */
export const MAX_NOTES = 500;
export const MAX_CARDS = 500;

/** Fields a note patch may change. */
const NOTE_PATCH_KEYS = ['lines', 'color', 'pinned', 'collapsed', 'x', 'y', 'w', 'h', 'trashed'];

/** Fields a card patch may change; `noteId` re-points the wall link. */
const CARD_PATCH_KEYS = ['title', 'note', 'columnId', 'priority', 'labels', 'checklist', 'dueDate', 'done', 'trashed', 'noteId'];

/** Fields `settings` may change. */
const SETTINGS_PATCH_KEYS = ['activeView', 'wallDensity'];

/** True when the value is a non-empty string. */
function isText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/** Whether a value is a finite number. */
function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Copy only the recognized patch keys that are present. */
function pick(payload, keys) {
  const patch = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) patch[key] = payload[key];
  }
  return patch;
}

/** Clamp a number into a range. */
function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/**
 * Build the repository over one store.
 * @param options - `{ store, now }`.
 * @returns the repository bound to that store.
 */
export function createRepository({ store, now = () => Date.now() }) {
  /** Current document after the store finished loading. */
  async function read() {
    await store.ready;
    return store.snapshot();
  }

  /** The board the panel and the tools currently work on. */
  function boardOf(doc) {
    const activeId = doc?.settings?.activeBoardId;
    return doc.boards.find((board) => board.id === activeId) ?? doc.boards[0];
  }

  /** Find a live-or-trashed note by id. */
  function findNote(doc, id) {
    return doc.notes.find((note) => note.id === id);
  }

  /** Find a live-or-trashed card by id. */
  function findCard(doc, id) {
    return boardOf(doc).cards.find((card) => card.id === id);
  }

  /** Find one column of the board. */
  function findColumn(doc, id) {
    return boardOf(doc).columns.find((column) => column.id === id);
  }

  /** A free spot for the next note, in panel-relative percentages. */
  function nextNoteSpot(doc) {
    const live = doc.notes.filter((note) => note.trashed !== true);
    const index = live.length;
    return {
      x: clamp(0.04 + (index % 4) * 0.235, 0, 0.9),
      y: clamp(0.04 + (Math.floor(index / 4) % 3) * 0.24, 0, 0.88),
      w: 240,
    };
  }

  /** Counts for the status line and the panel's header. */
  function countsOf(doc) {
    const board = boardOf(doc);
    const notes = doc.notes;
    const cards = board.cards;
    const byColumn = {};
    for (const column of board.columns) {
      byColumn[column.id] = cards.filter((card) => card.trashed !== true && card.columnId === column.id).length;
    }
    return {
      notes: notes.filter((note) => note.trashed !== true).length,
      pinned: notes.filter((note) => note.trashed !== true && note.pinned === true).length,
      cards: cards.filter((card) => card.trashed !== true).length,
      done: cards.filter((card) => card.trashed !== true && card.done === true).length,
      notesTrash: notes.filter((note) => note.trashed === true).length,
      cardsTrash: cards.filter((card) => card.trashed === true).length,
      byColumn,
    };
  }

  /** One snapshot for the panel; trashed items are opt-in. */
  function payloadOf(doc, { includeTrash = false, query = '' } = {}) {
    const board = boardOf(doc);
    const needle = typeof query === 'string' ? query.trim().toLowerCase() : '';
    const match = (text) => needle === '' || String(text ?? '').toLowerCase().includes(needle);

    const notes = doc.notes
      .filter((note) => (includeTrash === true ? true : note.trashed !== true))
      .filter((note) => match(noteTitle(note)) || match(noteText(note)))
      .sort((a, b) => a.createdAt - b.createdAt);

    const cards = board.cards
      .filter((card) => (includeTrash === true ? true : card.trashed !== true))
      .filter((card) => match(card.title) || match(card.note))
      .sort((a, b) => a.order - b.order);

    return {
      rev: doc.rev,
      updatedAt: doc.updatedAt,
      settings: doc.settings,
      notes,
      board: {
        id: board.id,
        title: board.title,
        columns: [...board.columns].sort((a, b) => a.order - b.order),
        cards,
      },
      activeBoardId: board.id,
      boards: doc.boards.map((entry) => ({
        id: entry.id,
        title: entry.title,
        cards: entry.cards.filter((card) => card.trashed !== true).length,
      })),
      counts: countsOf(doc),
      storePath: store.path,
    };
  }

  /** Read-only snapshot for the panel and the `board_get` tool. */
  async function snapshot(options = {}) {
    return payloadOf(await read(), options);
  }

  /**
   * Undo the most recent write. History lives in memory only (a Host restart
   * clears it); the restored document still gets a fresh `rev` so pollers see it.
   */
  async function undo() {
    return store.undo();
  }

  /** Redo the most recently undone write. */
  async function redo() {
    return store.redo();
  }

  /** Current undo/redo depth, used by the panel and tools to explain state. */
  function historyDepth() {
    return store.historyDepth();
  }

  /** Run one serialized mutation; `fn` mutates the live document in place. */
  async function mutate(fn) {
    const outcome = await store.mutate((doc) => fn(doc));
    return outcome;
  }

  // ------------------------------------------------------------------
  // Notes
  // ------------------------------------------------------------------

  /** Create one note from text, lines, or both. */
  async function createNote(input = {}) {
    const doc = await read();
    if (doc.notes.filter((note) => note.trashed !== true).length >= MAX_NOTES) {
      throw Object.assign(new Error(`便签数量已达上限 ${MAX_NOTES}；先清理回收站再新建`), { status: 409 });
    }
    const at = now();
    const spot = nextNoteSpot(doc);
    const lines = Array.isArray(input.lines) ? input.lines : normalizeLines(undefined, at);
    const base = normalizeNote(
      {
        id: newId('note'),
        lines: lines.length === 0 ? [{ id: newId('l'), kind: 'text', text: '' }] : lines,
        color: input.color,
        pinned: input.pinned,
        x: isNumber(input.x) ? input.x : spot.x,
        y: isNumber(input.y) ? input.y : spot.y,
        w: isNumber(input.w) ? input.w : spot.w,
        createdAt: at,
        updatedAt: at,
        rev: 1,
      },
      at,
    );
    const note = { ...base, text: noteText(base), linkedCardId: null };
    await mutate((live) => {
      live.notes.push(note);
    });
    return note;
  }

  /** Patch one note; unknown or invalid fields are ignored after normalization. */
  async function updateNote(id, rawPatch = {}) {
    const patch = pick(rawPatch, NOTE_PATCH_KEYS);
    const at = now();
    let updated;
    const outcome = await mutate((doc) => {
      const index = doc.notes.findIndex((note) => note.id === id);
      if (index === -1) return undefined;
      const current = doc.notes[index];
      const merged = { ...current, ...patch, updatedAt: at };
      if (Object.prototype.hasOwnProperty.call(patch, 'lines')) {
        merged.lines = normalizeLines(patch.lines, at);
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'trashed')) {
        merged.trashed = patch.trashed === true;
        merged.deletedAt = merged.trashed ? at : null;
      }
      const next = normalizeNote(merged, at);
      next.rev = (current.rev ?? 0) + 1;
      next.text = noteText(next);
      doc.notes[index] = next;
      updated = next;
      return updated;
    });
    return outcome.value ?? updated;
  }

  /** Move one note to the trash, or erase it with `permanent`. */
  async function removeNote(id, { permanent = false } = {}) {
    if (permanent === true) {
      const outcome = await mutate((doc) => {
        const index = doc.notes.findIndex((note) => note.id === id);
        if (index === -1) return false;
        const [removed] = doc.notes.splice(index, 1);
        for (const board of doc.boards) {
          for (const card of board.cards) {
            if (card.noteId === removed.id) card.noteId = null;
          }
        }
        return true;
      });
      return { removed: outcome.value === true, permanent: true };
    }
    const note = await updateNote(id, { trashed: true });
    return { removed: note !== undefined, note, permanent: false };
  }

  /** Restore one note from the trash. */
  async function restoreNote(id) {
    return updateNote(id, { trashed: false });
  }

  // ------------------------------------------------------------------
  // Cards
  // ------------------------------------------------------------------

  /** Create one card in a column. */
  async function createCard(input = {}) {
    const doc = await read();
    const cardCount = boardOf(doc).cards.filter((card) => card.trashed !== true).length;
    if (cardCount >= MAX_CARDS) {
      throw Object.assign(new Error(`任务数量已达上限 ${MAX_CARDS}；先清理回收站再新建`), { status: 409 });
    }
    const board = boardOf(doc);
    const columnId = isText(input.columnId) && findColumn(doc, input.columnId) !== undefined
      ? input.columnId
      : board.columns[0].id;
    const order = orderedCards(board.cards, columnId).length;
    const at = now();
    const card = normalizeCard(
      {
        id: newId('card'),
        title: typeof input.title === 'string' && input.title.trim() !== '' ? input.title : '未命名任务',
        note: typeof input.note === 'string' ? input.note : '',
        columnId,
        order,
        priority: PRIORITIES.includes(input.priority) ? input.priority : 'P2',
        labels: Array.isArray(input.labels) ? input.labels.filter(isText).map((label) => String(label).trim()).slice(0, 8) : [],
        checklist: Array.isArray(input.checklist) ? input.checklist : [],
        dueDate: typeof input.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) ? input.dueDate : null,
        done: input.done === true,
        createdAt: at,
        updatedAt: at,
        rev: 1,
      },
      at,
    );
    card.noteId = typeof input.noteId === 'string' && input.noteId !== '' ? input.noteId : null;
    await mutate((live) => {
      boardOf(live).cards.push(card);
    });
    return card;
  }

  /** Patch one card. Changing `columnId` moves it to the end of that column. */
  async function updateCard(id, rawPatch = {}) {
    const patch = pick(rawPatch, CARD_PATCH_KEYS);
    const at = now();
    let updated;
    const outcome = await mutate((doc) => {
      const board = boardOf(doc);
      const index = board.cards.findIndex((card) => card.id === id);
      if (index === -1) return undefined;
      const current = board.cards[index];
      const merged = { ...current, ...patch, updatedAt: at };
      if (Object.prototype.hasOwnProperty.call(patch, 'trashed')) {
        merged.trashed = patch.trashed === true;
        merged.deletedAt = merged.trashed ? at : null;
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'labels')) {
        merged.labels = Array.isArray(patch.labels)
          ? patch.labels.filter(isText).map((label) => String(label).trim()).slice(0, 8)
          : [];
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'dueDate')) {
        merged.dueDate = typeof patch.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(patch.dueDate) ? patch.dueDate : null;
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'done')) merged.done = patch.done === true;
      if (Object.prototype.hasOwnProperty.call(patch, 'priority') && !PRIORITIES.includes(patch.priority)) {
        merged.priority = current.priority;
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'columnId') && patch.columnId !== current.columnId) {
        const target = findColumn(doc, patch.columnId);
        merged.columnId = target === undefined ? current.columnId : patch.columnId;
        merged.order = orderedCards(board.cards, merged.columnId).filter((card) => card.id !== id).length;
        merged.done = merged.columnId === 'done' ? true : merged.done;
      }
      const next = normalizeCard(merged, at);
      next.rev = (current.rev ?? 0) + 1;
      next.noteId = merged.noteId ?? null;
      board.cards[index] = next;
      // Keep both sides of the wall link consistent: clear the note that
      // pointed at this card, and point the new note at it.
      if (Object.prototype.hasOwnProperty.call(patch, 'noteId')) {
        const targetNoteId = typeof patch.noteId === 'string' && patch.noteId !== '' ? patch.noteId : null;
        for (const note of doc.notes) {
          if (note.id !== targetNoteId && note.linkedCardId === next.id) {
            note.linkedCardId = null;
            note.rev = (note.rev ?? 0) + 1;
            note.updatedAt = at;
          }
          if (targetNoteId !== null && note.id === targetNoteId) {
            note.linkedCardId = next.id;
            note.rev = (note.rev ?? 0) + 1;
            note.updatedAt = at;
          }
        }
      }
      updated = next;
      return updated;
    });
    return outcome.value ?? updated;
  }

  /** Move one card across or within columns, keeping each column's order dense. */
  async function moveCard(id, { columnId, toIndex } = {}) {
    const at = now();
    let updated;
    const outcome = await mutate((doc) => {
      const board = boardOf(doc);
      const card = board.cards.find((entry) => entry.id === id);
      if (card === undefined) return undefined;
      const target = findColumn(doc, columnId);
      if (target === undefined) return undefined;
      const targetColumn = columnId;
      const columnCards = orderedCards(board.cards, targetColumn).filter((entry) => entry.id !== id);
      const index = isNumber(toIndex) ? clamp(Math.round(toIndex), 0, columnCards.length) : columnCards.length;
      const placed = { ...card, columnId: targetColumn, updatedAt: at, rev: (card.rev ?? 0) + 1 };
      if (targetColumn === 'done') placed.done = true;
      const ordered = [...columnCards];
      ordered.splice(index, 0, placed);
      for (let position = 0; position < ordered.length; position += 1) {
        ordered[position].order = position;
      }
      // Rewrite every card of the target column, plus the moved card itself.
      const byId = new Map(ordered.map((entry) => [entry.id, entry]));
      board.cards = board.cards.map((entry) =>
        byId.has(entry.id) ? { ...entry, ...byId.get(entry.id) } : entry,
      );
      updated = byId.get(id);
      return updated;
    });
    return outcome.value ?? updated;
  }

  /** Soft-delete or erase one card; a linked note keeps its side of the pair. */
  async function removeCard(id, { permanent = false } = {}) {
    if (permanent === true) {
      const outcome = await mutate((doc) => {
        const board = boardOf(doc);
        const index = board.cards.findIndex((card) => card.id === id);
        if (index === -1) return false;
        const [removed] = board.cards.splice(index, 1);
        for (const note of doc.notes) {
          if (note.linkedCardId === removed.id) note.linkedCardId = null;
        }
        for (const column of board.columns) {
          const remaining = orderedCards(board.cards, column.id);
          for (let position = 0; position < remaining.length; position += 1) {
            remaining[position].order = position;
          }
        }
        return true;
      });
      return { removed: outcome.value === true, permanent: true };
    }
    const card = await updateCard(id, { trashed: true });
    return { removed: card !== undefined, card, permanent: false };
  }

  /** Restore one card from the trash. */
  async function restoreCard(id) {
    const at = now();
    let updated;
    const outcome = await mutate((doc) => {
      const board = boardOf(doc);
      const index = board.cards.findIndex((card) => card.id === id);
      if (index === -1) return undefined;
      const current = board.cards[index];
      const next = { ...current, trashed: false, deletedAt: null, updatedAt: at, rev: (current.rev ?? 0) + 1 };
      next.order = orderedCards(board.cards, next.columnId).filter((card) => card.id !== id).length;
      board.cards[index] = next;
      updated = next;
      return updated;
    });
    return outcome.value ?? updated;
  }

  // ------------------------------------------------------------------
  // Columns
  // ------------------------------------------------------------------

  /** Append one column. */
  async function addColumn(title) {
    const name = typeof title === 'string' && title.trim() !== '' ? title.trim().slice(0, 24) : '新列';
    let created;
    const outcome = await mutate((doc) => {
      const board = boardOf(doc);
      if (board.columns.length >= 8) return undefined;
      const column = { id: newId('col'), title: name, order: board.columns.length };
      board.columns.push(column);
      created = column;
      return column;
    });
    return outcome.value ?? created;
  }

  /** Move one column to a new index in the active board. */
  async function moveColumn(id, toIndex) {
    let moved;
    const outcome = await mutate((doc) => {
      const board = boardOf(doc);
      const from = board.columns.findIndex((column) => column.id === id);
      if (from === -1) return undefined;
      const target = isNumber(toIndex)
        ? clamp(Math.round(toIndex), 0, board.columns.length - 1)
        : board.columns.length - 1;
      const [column] = board.columns.splice(from, 1);
      board.columns.splice(target, 0, column);
      board.columns.forEach((entry, index) => {
        entry.order = index;
      });
      moved = { id: column.id, order: column.order };
      return moved;
    });
    return outcome.value ?? moved;
  }

  /** Rename or reorder one column. */
  async function updateColumn(id, patch = {}) {
    let updated;
    const outcome = await mutate((doc) => {
      const board = boardOf(doc);
      const index = board.columns.findIndex((column) => column.id === id);
      if (index === -1) return undefined;
      const current = board.columns[index];
      const next = { ...current };
      if (typeof patch.title === 'string' && patch.title.trim() !== '') next.title = patch.title.trim().slice(0, 24);
      if (isNumber(patch.order)) next.order = patch.order;
      board.columns[index] = next;
      board.columns = [...board.columns].sort((a, b) => a.order - b.order);
      board.columns.forEach((column, position) => {
        column.order = position;
      });
      updated = next;
      return next;
    });
    return outcome.value ?? updated;
  }

  /** Delete one column, first relocating its cards to the first remaining column. */
  async function removeColumn(id) {
    const outcome = await mutate((doc) => {
      const board = boardOf(doc);
      if (board.columns.length <= 1) return { removed: false, reason: 'last-column' };
      const index = board.columns.findIndex((column) => column.id === id);
      if (index === -1) return { removed: false, reason: 'missing' };
      const [removed] = board.columns.splice(index, 1);
      board.columns.forEach((column, position) => {
        column.order = position;
      });
      const fallback = board.columns[0].id;
      const displaced = orderedCards(board.cards, removed.id);
      for (const card of displaced) {
        card.columnId = fallback;
        card.order = orderedCards(board.cards, fallback).length;
        card.updatedAt = now();
        card.rev = (card.rev ?? 0) + 1;
      }
      return { removed: true, movedTo: fallback, moved: displaced.length };
    });
    return outcome.value;
  }

  // ------------------------------------------------------------------
  // Boards
  // ------------------------------------------------------------------

  /** Every board with a light summary; `active` marks the current one. */
  async function listBoards() {
    const doc = await read();
    const activeId = boardOf(doc).id;
    return doc.boards.map((board) => ({
      id: board.id,
      title: board.title,
      active: board.id === activeId,
      columns: board.columns.length,
      cards: board.cards.filter((card) => card.trashed !== true).length,
    }));
  }

  /** Create one board and make it active. */
  /**
   * Build columns from a template (titles or `{title}` objects); an empty or
   * invalid list falls back to the default three columns.
   */
  function columnsFromTitles(columns) {
    const list = Array.isArray(columns) ? columns : [];
    const out = [];
    for (const entry of list) {
      const title = typeof entry === 'string'
        ? entry.trim()
        : entry !== null && typeof entry === 'object' && typeof entry.title === 'string'
          ? entry.title.trim()
          : '';
      if (title === '') continue;
      out.push({ id: newId('col'), title: title.slice(0, 24), order: out.length });
      if (out.length >= 8) break;
    }
    return out.length === 0 ? defaultColumns() : out;
  }

  /** Create one board (optionally from a column template) and make it active. */
  async function addBoard(title, columns) {
    const name = typeof title === 'string' && title.trim() !== '' ? title.trim().slice(0, 40) : '新看板';
    const seeded = columnsFromTitles(columns);
    let created;
    const outcome = await mutate((doc) => {
      if (doc.boards.length >= 12) return undefined;
      const board = { id: newId('board'), title: name, columns: seeded, cards: [] };
      doc.boards.push(board);
      doc.settings = { ...doc.settings, activeBoardId: board.id };
      created = board;
      return board;
    });
    return outcome.value ?? created;
  }

  /** Rename one board. */
  async function updateBoard(id, patch = {}) {
    let updated;
    const outcome = await mutate((doc) => {
      const board = doc.boards.find((entry) => entry.id === id);
      if (board === undefined) return undefined;
      if (typeof patch.title === 'string' && patch.title.trim() !== '') board.title = patch.title.trim().slice(0, 40);
      updated = { id: board.id, title: board.title };
      return updated;
    });
    return outcome.value ?? updated;
  }

  /** Delete one board; the last board cannot be deleted. */
  async function removeBoard(id) {
    const outcome = await mutate((doc) => {
      if (doc.boards.length <= 1) return { removed: false, reason: 'last-board' };
      const index = doc.boards.findIndex((board) => board.id === id);
      if (index === -1) return { removed: false, reason: 'missing' };
      const [removed] = doc.boards.splice(index, 1);
      if (doc.settings.activeBoardId === removed.id) {
        doc.settings = { ...doc.settings, activeBoardId: doc.boards[0].id };
      }
      return { removed: true, activeBoardId: boardOf(doc).id, cards: removed.cards.length };
    });
    return outcome.value;
  }

  /** Switch the active board. */
  async function selectBoard(id) {
    let selected;
    const outcome = await mutate((doc) => {
      const board = doc.boards.find((entry) => entry.id === id);
      if (board === undefined) return undefined;
      doc.settings = { ...doc.settings, activeBoardId: board.id };
      selected = { id: board.id, title: board.title };
      return selected;
    });
    return outcome.value ?? selected;
  }

  /** Find where one id lives: a note, or a card on a specific board. */
  async function locate(id) {
    const doc = await read();
    if (doc.notes.some((note) => note.id === id)) return { kind: 'note', boardId: null };
    for (const board of doc.boards) {
      if (board.cards.some((card) => card.id === id)) return { kind: 'card', boardId: board.id };
    }
    return { kind: null, boardId: null };
  }

  /** Move one board to a new index in the board list. */
  async function moveBoard(id, toIndex) {
    const outcome = await mutate((doc) => {
      const from = doc.boards.findIndex((board) => board.id === id);
      if (from === -1) return undefined;
      const target = isNumber(toIndex) ? clamp(Math.round(toIndex), 0, doc.boards.length - 1) : doc.boards.length - 1;
      const [board] = doc.boards.splice(from, 1);
      doc.boards.splice(target, 0, board);
      return { id: board.id, order: target };
    });
    return outcome.value;
  }

  // ------------------------------------------------------------------
  // Wall ↔ board linkage
  // ------------------------------------------------------------------

  /** Point both sides of a note/card pair at each other. */
  async function link(noteId, cardId) {
    const outcome = await mutate((doc) => {
      const note = findNote(doc, noteId);
      const card = findCard(doc, cardId);
      if (note === undefined || card === undefined) return undefined;
      note.linkedCardId = card.id;
      note.rev = (note.rev ?? 0) + 1;
      note.updatedAt = now();
      card.noteId = note.id;
      card.rev = (card.rev ?? 0) + 1;
      card.updatedAt = now();
      return { note, card };
    });
    return outcome.value;
  }

  /**
   * Push a linked note's content onto its card (decision D1: one-way, manual).
   * Title and description are replaced; the card keeps its priority, labels,
   * due date, done flag and column.
   */
  async function syncNoteToCard(cardId) {
    const doc = await read();
    const card = boardOf(doc).cards.find((entry) => entry.id === cardId);
    if (card === undefined) return { ok: false, reason: 'card-missing' };
    const noteId = card.noteId;
    const note = noteId === null || noteId === undefined ? undefined : findNote(doc, noteId);
    if (note === undefined) return { ok: false, reason: 'note-missing' };
    if (noteText(note).trim() === '') return { ok: false, reason: 'note-empty' };

    const at = now();
    const title = noteTitle(note).slice(0, 200);
    const body = (note.lines ?? [])
      .map((line) => {
        if (line.kind === 'todo') return `- [${line.done === true ? 'x' : ' '}] ${line.text}`;
        if (line.kind === 'ul') return `- ${line.text}`;
        if (line.kind === 'ol') return `1. ${line.text}`;
        return line.text;
      })
      .join('\n');

    const outcome = await mutate((live) => {
      const liveCard = boardOf(live).cards.find((entry) => entry.id === cardId);
      if (liveCard === undefined) return undefined;
      liveCard.title = title;
      liveCard.note = body;
      liveCard.rev = (liveCard.rev ?? 0) + 1;
      liveCard.updatedAt = at;
      return liveCard;
    });
    if (outcome.value === undefined) return { ok: false, reason: 'card-missing' };
    return { ok: true, card: outcome.value, note };
  }

  /** Turn one note into a task, keeping the note and recording the pair. */
  async function noteToTask(noteId, { columnId } = {}) {
    const doc = await read();
    const note = findNote(doc, noteId);
    if (note === undefined) return { ok: false, reason: 'note-missing' };
    const board = boardOf(doc);
    if (board.cards.filter((card) => card.trashed !== true).length >= MAX_CARDS) {
      throw Object.assign(new Error(`任务数量已达上限 ${MAX_CARDS}`), { status: 409 });
    }
    const target = isText(columnId) && findColumn(doc, columnId) !== undefined ? columnId : board.columns[0].id;
    const at = now();
    const draft = noteToCard(note, { columnId: target, now: at });
    const card = normalizeCard(
      {
        ...draft.card,
        order: orderedCards(board.cards, target).length,
        createdAt: at,
        updatedAt: at,
        rev: 1,
      },
      at,
    );
    card.noteId = note.id;
    await mutate((live) => {
      const liveBoard = boardOf(live);
      liveBoard.cards.push(card);
      const liveNote = findNote(live, noteId);
      if (liveNote !== undefined) {
        liveNote.linkedCardId = card.id;
        liveNote.rev = (liveNote.rev ?? 0) + 1;
        liveNote.updatedAt = at;
      }
    });
    return { ok: true, card, note };
  }

  /** Turn one card into a wall note, keeping the card and recording the pair. */
  async function taskToNote(cardId) {
    const doc = await read();
    const card = findCard(doc, cardId);
    if (card === undefined) return { ok: false, reason: 'card-missing' };
    if (doc.notes.filter((note) => note.trashed !== true).length >= MAX_NOTES) {
      throw Object.assign(new Error(`便签数量已达上限 ${MAX_NOTES}`), { status: 409 });
    }
    const at = now();
    const spot = nextNoteSpot(doc);
    const draft = cardToNote(card, { now: at, x: spot.x, y: spot.y });
    const note = normalizeNote(
      {
        ...draft.note,
        x: spot.x,
        y: spot.y,
        w: spot.w,
        createdAt: at,
        updatedAt: at,
        rev: 1,
      },
      at,
    );
    note.text = noteText(note);
    note.linkedCardId = card.id;
    await mutate((live) => {
      live.notes.push(note);
      const liveCard = findCard(live, cardId);
      if (liveCard !== undefined) {
        liveCard.noteId = note.id;
        liveCard.rev = (liveCard.rev ?? 0) + 1;
        liveCard.updatedAt = at;
      }
    });
    return { ok: true, note, card };
  }

  // ------------------------------------------------------------------
  // Document level
  // ------------------------------------------------------------------

  /** Patch the settings block. */
  async function updateSettings(patch = {}) {
    const allowed = pick(patch, SETTINGS_PATCH_KEYS);
    const outcome = await mutate((doc) => {
      doc.settings = { ...doc.settings, ...allowed };
      return doc.settings;
    });
    return outcome.value;
  }

  /** Whole document, for export and backups. */
  async function exportDocument() {
    return JSON.parse(JSON.stringify(await read()));
  }

  /** Move many notes to the trash at once; unknown ids are ignored. */
  async function trashNotes(ids) {
    const wanted = new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []);
    const at = now();
    const outcome = await mutate((doc) => {
      let notes = 0;
      for (const note of doc.notes) {
        if (note.trashed !== true && wanted.has(note.id)) {
          note.trashed = true;
          note.deletedAt = at;
          note.rev = (note.rev ?? 0) + 1;
          note.updatedAt = at;
          notes += 1;
        }
      }
      return { notesTrashed: notes };
    });
    return outcome.value;
  }

  /** Move many cards of the active board to the trash at once. */
  async function trashCards(ids) {
    const wanted = new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []);
    const at = now();
    const outcome = await mutate((doc) => {
      const board = boardOf(doc);
      let cards = 0;
      for (const card of board.cards) {
        if (card.trashed !== true && wanted.has(card.id)) {
          card.trashed = true;
          card.deletedAt = at;
          card.rev = (card.rev ?? 0) + 1;
          card.updatedAt = at;
          cards += 1;
        }
      }
      return { cardsTrashed: cards };
    });
    return outcome.value;
  }

  /** Restore many trashed entries at once; unknown ids are ignored. */
  async function restoreMany({ noteIds = [], cardIds = [] } = {}) {
    const noteSet = new Set(Array.isArray(noteIds) ? noteIds.filter((id) => typeof id === 'string') : []);
    const cardSet = new Set(Array.isArray(cardIds) ? cardIds.filter((id) => typeof id === 'string') : []);
    const at = now();
    const outcome = await mutate((doc) => {
      let notes = 0;
      let cards = 0;
      for (const note of doc.notes) {
        if (note.trashed === true && noteSet.has(note.id)) {
          note.trashed = false;
          note.deletedAt = null;
          note.rev = (note.rev ?? 0) + 1;
          note.updatedAt = at;
          notes += 1;
        }
      }
      for (const board of doc.boards) {
        for (const card of board.cards) {
          if (card.trashed === true && cardSet.has(card.id)) {
            card.trashed = false;
            card.deletedAt = null;
            card.order = orderedCards(board.cards, card.columnId).filter((entry) => entry.id !== card.id).length;
            card.rev = (card.rev ?? 0) + 1;
            card.updatedAt = at;
            cards += 1;
          }
        }
      }
      return { notesRestored: notes, cardsRestored: cards };
    });
    return outcome.value;
  }

  /** Permanently delete many trashed entries at once; only trashed ones are touched. */
  async function purgeMany({ noteIds = [], cardIds = [] } = {}) {
    const noteSet = new Set(Array.isArray(noteIds) ? noteIds.filter((id) => typeof id === 'string') : []);
    const cardSet = new Set(Array.isArray(cardIds) ? cardIds.filter((id) => typeof id === 'string') : []);
    const outcome = await mutate((doc) => {
      const notesBefore = doc.notes.length;
      doc.notes = doc.notes.filter((note) => !(note.trashed === true && noteSet.has(note.id)));
      const notes = notesBefore - doc.notes.length;
      let cards = 0;
      for (const board of doc.boards) {
        const before = board.cards.length;
        board.cards = board.cards.filter((card) => !(card.trashed === true && cardSet.has(card.id)));
        cards += before - board.cards.length;
      }
      // 删除后清理悬空关联
      const liveNoteIds = new Set(doc.notes.map((note) => note.id));
      const liveCardIds = new Set(doc.boards.flatMap((board) => board.cards.map((card) => card.id)));
      for (const note of doc.notes) {
        if (note.linkedCardId !== null && note.linkedCardId !== undefined && !liveCardIds.has(note.linkedCardId)) {
          note.linkedCardId = null;
        }
      }
      for (const board of doc.boards) {
        for (const card of board.cards) {
          if (card.noteId !== null && card.noteId !== undefined && !liveNoteIds.has(card.noteId)) card.noteId = null;
        }
      }
      return { notesPurged: notes, cardsPurged: cards };
    });
    return outcome.value;
  }

  /** Permanently remove every trashed note and card, and drop dangling links. */
  async function clearTrash() {
    const outcome = await mutate((doc) => {
      let notesRemoved = 0;
      let cardsRemoved = 0;
      doc.notes = doc.notes.filter((note) => {
        if (note.trashed === true) {
          notesRemoved += 1;
          return false;
        }
        return true;
      });
      for (const board of doc.boards) {
        board.cards = board.cards.filter((card) => {
          if (card.trashed === true) {
            cardsRemoved += 1;
            return false;
          }
          return true;
        });
      }
      const noteIds = new Set(doc.notes.map((note) => note.id));
      const cardIds = new Set(doc.boards.flatMap((board) => board.cards.map((card) => card.id)));
      for (const note of doc.notes) {
        if (note.linkedCardId !== null && note.linkedCardId !== undefined && !cardIds.has(note.linkedCardId)) {
          note.linkedCardId = null;
        }
      }
      for (const board of doc.boards) {
        for (const card of board.cards) {
          if (card.noteId !== null && card.noteId !== undefined && !noteIds.has(card.noteId)) card.noteId = null;
        }
      }
      return { notesRemoved, cardsRemoved };
    });
    return outcome.value;
  }

  /** Lay every visible note out on a four-column grid, pinned notes first. */
  async function tidyNotes() {
    const at = now();
    const outcome = await mutate((doc) => {
      const visible = doc.notes.filter((note) => note.trashed !== true);
      const pinned = visible.filter((note) => note.pinned === true);
      const rest = visible.filter((note) => note.pinned !== true);
      const ordered = [...pinned, ...rest].sort((a, b) => a.createdAt - b.createdAt);
      for (let index = 0; index < ordered.length; index += 1) {
        const note = ordered[index];
        const x = Math.min(0.9, 0.02 + (index % 4) * 0.245);
        const y = Math.min(0.9, 0.02 + Math.floor(index / 4) * 0.215);
        if (note.x !== x || note.y !== y) {
          note.x = x;
          note.y = y;
          note.rev = (note.rev ?? 0) + 1;
          note.updatedAt = at;
        }
      }
      return { count: ordered.length };
    });
    return outcome.value;
  }

  /**
   * Import a document.
   * @param payload - a previously exported document.
   * @param mode - `replace` swaps the whole document, `merge` keeps existing
   *   entries and appends the imported ones with fresh ids.
   */
  async function importDocument(payload, mode = 'merge') {
    if (typeof payload !== 'object' || payload === null) {
      throw Object.assign(new Error('导入内容必须是 JSON 对象'), { status: 400 });
    }
    const outcome = await mutate((doc) => {
      if (mode === 'replace') {
        const incoming = normalizeDocument(payload);
        doc.version = incoming.version;
        doc.notes = incoming.notes;
        doc.boards = incoming.boards;
        doc.settings = incoming.settings;
        return { mode: 'replace', notes: doc.notes.length, cards: doc.boards.reduce((sum, board) => sum + board.cards.length, 0) };
      }
      const incomingNotes = Array.isArray(payload.notes) ? payload.notes : [];
      const incomingBoards = Array.isArray(payload.boards) ? payload.boards : [];
      const existingNoteIds = new Set(doc.notes.map((note) => note.id));
      const existingCardIds = new Set(boardOf(doc).cards.map((card) => card.id));
      let addedNotes = 0;
      let addedCards = 0;
      const at = now();
      for (const incoming of incomingNotes) {
        if (typeof incoming !== 'object' || incoming === null) continue;
        const note = normalizeNote({ ...incoming, id: existingNoteIds.has(incoming.id) ? newId('note') : incoming.id }, at);
        note.text = noteText(note);
        doc.notes.push(note);
        existingNoteIds.add(note.id);
        addedNotes += 1;
      }
      const target = boardOf(doc);
      const incomingCards = incomingBoards.flatMap((board) => (Array.isArray(board?.cards) ? board.cards : []));
      for (const incoming of incomingCards) {
        if (typeof incoming !== 'object' || incoming === null) continue;
        const columnId = target.columns.some((column) => column.id === incoming.columnId) ? incoming.columnId : target.columns[0].id;
        const card = normalizeCard(
          {
            ...incoming,
            id: existingCardIds.has(incoming.id) ? newId('card') : incoming.id,
            columnId,
            order: orderedCards(target.cards, columnId).length,
          },
          at,
        );
        target.cards.push(card);
        existingCardIds.add(card.id);
        addedCards += 1;
      }
      return { mode: 'merge', notes: addedNotes, cards: addedCards };
    });
    return outcome.value;
  }

  return {
    ready: store.ready,
    path: store.path,
    revision: () => store.revision(),
    snapshot,
    counts: async () => countsOf(await read()),
    undo,
    redo,
    historyDepth,
    createNote,
    updateNote,
    removeNote,
    restoreNote,
    createCard,
    updateCard,
    moveCard,
    removeCard,
    restoreCard,
    addColumn,
    updateColumn,
    removeColumn,
    link,
    syncNoteToCard,
    noteToTask,
    taskToNote,
    updateSettings,
    exportDocument,
    importDocument,
    listBoards,
    addBoard,
    updateBoard,
    removeBoard,
    selectBoard,
    moveBoard,
    locate,
    moveColumn,
    clearTrash,
    trashNotes,
    trashCards,
    restoreMany,
    purgeMany,
    tidyNotes,
    /** Title helper shared with the UI. */
    titleOf: (note) => noteTitle(note),
    /** Whether a string is one of the accepted note colours. */
    isColor: (value) => NOTE_COLORS.includes(value),
    /** Whether a string is one of the accepted line kinds. */
    isLineKind: (value) => LINE_KINDS.includes(value),
    /** Exposed for tests. */
    _store: store,
  };
}
