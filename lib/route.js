/**
 * The authenticated sticky-board route: `GET` returns one snapshot, `POST`
 * performs one named action. It lives under `/api`, so the connection service
 * has already applied its Host/Origin fence and browser-session check before
 * the handler runs.
 *
 * One path, one action dispatcher: the panel and the tools both talk to the
 * same repository, and a new verb never needs a new route.
 *
 * @module @local/sticky-board/route
 */

/** Mount path; the panel uses the same constant. */
export const ROUTE_PATH = '/api/sticky-board';

/** Largest accepted body. */
const MAX_BODY_BYTES = 512 * 1024;

/** Headers shared by every answer; board data is user data, never cached. */
const BASE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

/**
 * Describe the route for `ctx.connection.fetch.register`.
 * @param repository - the sticky-board repository.
 * @returns the route definition.
 */
export function createRoute(repository) {
  return {
    path: ROUTE_PATH,
    methods: ['GET', 'HEAD', 'POST'],
    requestBody: 'buffered',
    fetch: (request) => handleRequest(request, repository),
  };
}

/** Whole-document snapshot used by every mutation answer. */
async function fullSnapshot(repository) {
  return repository.snapshot({ includeTrash: true });
}

/**
 * Answer one request.
 * @param request - the Fetch request built by the bridge.
 * @param repository - the sticky-board repository.
 * @returns the JSON response.
 */
export async function handleRequest(request, repository) {
  try {
    if (request.method === 'GET' || request.method === 'HEAD') {
      const url = new URL(request.url, 'http://sticky-board.invalid');
      const includeTrash = url.searchParams.get('trash') === '1';
      const query = url.searchParams.get('q') ?? '';
      return json(200, { ok: true, ...(await repository.snapshot({ includeTrash, query })) });
    }
    if (request.method !== 'POST') return json(405, { ok: false, error: 'method not allowed' });

    const body = await readJson(request);
    const action = typeof body.action === 'string' ? body.action : '';
    const result = await perform(repository, action, body);
    return json(200, { ok: true, ...result });
  } catch (error) {
    return json(statusOf(error), { ok: false, error: messageOf(error) });
  }
}

/**
 * Dispatch one named action onto the repository.
 * @param repository - the sticky-board repository.
 * @param action - the action name.
 * @param body - the decoded payload.
 * @returns the response body without `ok`.
 */
async function perform(repository, action, body) {
  switch (action) {
    // --- notes -----------------------------------------------------
    case 'note.create': {
      const note = await repository.createNote(body.note ?? body);
      return { note, ...(await fullSnapshot(repository)) };
    }
    case 'note.update': {
      const note = await repository.updateNote(requireId(body), body.patch ?? body);
      if (note === undefined) throw notFound('便签');
      return { note, ...(await fullSnapshot(repository)) };
    }
    case 'note.remove': {
      const outcome = await repository.removeNote(requireId(body), { permanent: body.permanent === true });
      if (!outcome.removed) throw notFound('便签');
      return { ...outcome, ...(await fullSnapshot(repository)) };
    }
    case 'note.restore': {
      const note = await repository.restoreNote(requireId(body));
      if (note === undefined) throw notFound('便签');
      return { note, ...(await fullSnapshot(repository)) };
    }
    case 'note.toTask': {
      const outcome = await repository.noteToTask(requireId(body), { columnId: body.columnId });
      if (outcome.ok !== true) throw notFound('便签');
      return { card: outcome.card, ...(await fullSnapshot(repository)) };
    }

    // --- cards -----------------------------------------------------
    case 'card.create': {
      const card = await repository.createCard(body.card ?? body);
      return { card, ...(await fullSnapshot(repository)) };
    }
    case 'card.update': {
      const card = await repository.updateCard(requireId(body), body.patch ?? body);
      if (card === undefined) throw notFound('任务');
      return { card, ...(await fullSnapshot(repository)) };
    }
    case 'card.move': {
      const card = await repository.moveCard(requireId(body), { columnId: body.columnId, toIndex: body.toIndex });
      if (card === undefined) throw notFound('任务');
      return { card, ...(await fullSnapshot(repository)) };
    }
    case 'card.remove': {
      const outcome = await repository.removeCard(requireId(body), { permanent: body.permanent === true });
      if (!outcome.removed) throw notFound('任务');
      return { ...outcome, ...(await fullSnapshot(repository)) };
    }
    case 'card.restore': {
      const card = await repository.restoreCard(requireId(body));
      if (card === undefined) throw notFound('任务');
      return { card, ...(await fullSnapshot(repository)) };
    }
    case 'card.toNote': {
      const outcome = await repository.taskToNote(requireId(body));
      if (outcome.ok !== true) throw notFound('任务');
      return { note: outcome.note, ...(await fullSnapshot(repository)) };
    }

    // --- columns ---------------------------------------------------
    case 'column.add': {
      const column = await repository.addColumn(body.title);
      return { column, ...(await fullSnapshot(repository)) };
    }
    case 'column.update': {
      const column = await repository.updateColumn(requireId(body), body.patch ?? body);
      if (column === undefined) throw notFound('列');
      return { column, ...(await fullSnapshot(repository)) };
    }
    case 'column.move': {
      const column = await repository.moveColumn(requireId(body), body.toIndex);
      if (column === undefined) throw notFound('列');
      return { column, ...(await fullSnapshot(repository)) };
    }
    case 'column.remove': {
      const outcome = await repository.removeColumn(requireId(body));
      if (outcome.removed !== true) {
        throw Object.assign(new Error(outcome.reason === 'last-column' ? '至少要保留一列' : '找不到这一列'), { status: 400 });
      }
      return { ...outcome, ...(await fullSnapshot(repository)) };
    }

    // --- boards ----------------------------------------------------
    case 'board.list': {
      return { boards: await repository.listBoards(), ...(await fullSnapshot(repository)) };
    }
    case 'board.add': {
      const board = await repository.addBoard(body.title, body.columns);
      if (board === undefined) throw badRequest(`看板数量已达上限`);
      return { board, ...(await fullSnapshot(repository)) };
    }
    case 'board.update': {
      const board = await repository.updateBoard(requireId(body), body.patch ?? body);
      if (board === undefined) throw notFound('看板');
      return { board, ...(await fullSnapshot(repository)) };
    }
    case 'board.remove': {
      const outcome = await repository.removeBoard(requireId(body));
      if (outcome.removed !== true) {
        throw Object.assign(new Error(outcome.reason === 'last-board' ? '至少要保留一块看板' : '找不到这块看板'), { status: 400 });
      }
      return { ...outcome, ...(await fullSnapshot(repository)) };
    }
    case 'board.select': {
      const board = await repository.selectBoard(requireId(body));
      if (board === undefined) throw notFound('看板');
      return { board, ...(await fullSnapshot(repository)) };
    }
    case 'board.move': {
      const board = await repository.moveBoard(requireId(body), body.toIndex);
      if (board === undefined) throw notFound('看板');
      return { board, ...(await fullSnapshot(repository)) };
    }
    case 'locate': {
      const found = await repository.locate(requireId(body));
      if (found.kind === null) throw notFound('条目');
      return { found };
    }

    // --- column / wall helpers -------------------------------------
    case 'note.tidy': {
      const outcome = await repository.tidyNotes();
      return { ...outcome, ...(await fullSnapshot(repository)) };
    }
    case 'trash.clear': {
      const outcome = await repository.clearTrash();
      return { ...outcome, ...(await fullSnapshot(repository)) };
    }
    case 'note.trashMany': {
      const outcome = await repository.trashNotes(body.noteIds);
      return { ...outcome, ...(await fullSnapshot(repository)) };
    }
    case 'card.trashMany': {
      const outcome = await repository.trashCards(body.cardIds);
      return { ...outcome, ...(await fullSnapshot(repository)) };
    }
    case 'trash.restoreMany': {
      const outcome = await repository.restoreMany({ noteIds: body.noteIds, cardIds: body.cardIds });
      return { ...outcome, ...(await fullSnapshot(repository)) };
    }
    case 'trash.purgeMany': {
      const outcome = await repository.purgeMany({ noteIds: body.noteIds, cardIds: body.cardIds });
      return { ...outcome, ...(await fullSnapshot(repository)) };
    }

    // --- linkage / settings / document -----------------------------
    case 'link': {
      if (typeof body.noteId !== 'string' || typeof body.cardId !== 'string') {
        throw badRequest('link 需要 noteId 和 cardId');
      }
      const outcome = await repository.link(body.noteId, body.cardId);
      if (outcome === undefined) throw notFound('便签或任务');
      return { ...outcome, ...(await fullSnapshot(repository)) };
    }
    case 'link.sync': {
      const cardId = typeof body.cardId === 'string' ? body.cardId.trim() : '';
      if (cardId === '') throw badRequest('link.sync 需要 cardId');
      const outcome = await repository.syncNoteToCard(cardId);
      if (outcome.ok !== true) {
        if (outcome.reason === 'card-missing') throw notFound('任务');
        throw badRequest(outcome.reason === 'note-missing' ? '这张任务还没有关联便签' : '关联的便签是空的，没有可同步的内容');
      }
      return { card: outcome.card, ...(await fullSnapshot(repository)) };
    }
    case 'history.undo':
    case 'history.redo': {
      const outcome = body.action === 'history.undo' ? await repository.undo() : await repository.redo();
      return { undone: outcome.changed === true, ...(await fullSnapshot(repository)) };
    }
    case 'settings.update': {
      const settings = await repository.updateSettings(body.patch ?? body.settings ?? {});
      return { settings, ...(await fullSnapshot(repository)) };
    }
    case 'export': {
      return { document: await repository.exportDocument() };
    }
    case 'import': {
      const outcome = await repository.importDocument(body.document ?? body.data, body.mode === 'replace' ? 'replace' : 'merge');
      return { ...outcome, ...(await fullSnapshot(repository)) };
    }
    default:
      throw badRequest(`未知操作：${action === '' ? '(空)' : action}`);
  }
}

/** Read the required `id` field. */
function requireId(body) {
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (id === '') throw badRequest('缺少 id');
  return id;
}

/** A 404 with a readable message. */
function notFound(what) {
  return Object.assign(new Error(`找不到这条${what}，可能已被删除`), { status: 404 });
}

/** A 400 with a readable message. */
function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

/**
 * Parse the request body, refusing oversized payloads before parsing.
 * @param request - the incoming request.
 * @returns the parsed JSON object.
 */
async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw Object.assign(new Error('请求体过大'), { status: 413 });
  try {
    const parsed = JSON.parse(text === '' ? '{}' : text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw Object.assign(new Error('请求体必须是 JSON 对象'), { status: 400 });
    }
    return parsed;
  } catch (error) {
    if (typeof error.status === 'number') throw error;
    throw Object.assign(new Error('请求体不是合法 JSON'), { status: 400 });
  }
}

/**
 * Build one JSON answer.
 * @param status - HTTP status.
 * @param body - JSON-serializable body.
 * @returns the response.
 */
function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** Map a thrown error onto a status code. */
function statusOf(error) {
  return typeof error?.status === 'number' ? error.status : 500;
}

/** A message a client can show without leaking internals. */
function messageOf(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}
