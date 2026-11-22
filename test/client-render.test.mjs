/**
 * Render smoke test for the browser half.
 *
 * The panel is a single plain-JS module: a crash in its render path blanks the
 * whole `main` slot in the real app and the only test budget it had was
 * `node --check` (syntax). This renders the registered components for real —
 * first a static pass over the loading state, then a mounted pass with a fake
 * snapshot — so a thrown render (including a hook deps array referencing a
 * later `const`, which blanked the panel once) fails `node --test`.
 *
 * Kept out of the shipped bundle: devDependencies only.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { JSDOM } from 'jsdom';

const root = path.resolve(import.meta.dirname, '..');

// Install the browser globals BEFORE importing React: React captures `canUseDOM`
// at module load, and without DOM it skips the code paths that turn an `input`
// event into `onChange` — controlled inputs then never update in these tests.
const dom = installDom();
const ReactModule = await import('react');
const React = ReactModule.default;
const act = ReactModule.act;
const { createRoot } = await import('react-dom/client');
const { renderToStaticMarkup } = await import('react-dom/server');

/** A snapshot shaped exactly like `repository.snapshot({ includeTrash: true })`. */
function fakeSnapshot() {
  const now = 1_700_000_000_000;
  return {
    ok: true,
    rev: 7,
    updatedAt: now,
    settings: { activeView: 'board', wallDensity: 'auto', activeBoardId: 'board-main' },
    notes: [
      {
        id: 'note-aaaaaaaaaa',
        lines: [{ id: 'l-aaaaaaaaaa', kind: 'text', text: '便签甲' }],
        text: '便签甲',
        color: 'amber',
        pinned: false,
        collapsed: false,
        x: 0.1,
        y: 0.1,
        w: 240,
        h: null,
        trashed: false,
        deletedAt: null,
        linkedCardId: 'card-bbbbbbbbbb',
        rev: 1,
        createdAt: now,
        updatedAt: now,
      },
    ],
    board: {
      id: 'board-main',
      title: '默认看板',
      doneColumnId: 'done',
      columns: [
        { id: 'todo', title: '待办', order: 0 },
        { id: 'doing', title: '进行中', order: 1 },
        { id: 'done', title: '完成', order: 2 },
      ],
      cards: [
        {
          id: 'card-bbbbbbbbbb',
          title: '卡片甲',
          note: '**重点** 与 `代码`',
          acceptance: '验收：冒烟通过',
          columnId: 'todo',
          order: 0,
          priority: 'P1',
          labels: ['文档'],
          blocked: true,
          blockedReason: '等外部 API',
          checklist: [
            { id: 'item-aaaaaaaaaa', text: '检查项一', done: true },
            { id: 'item-bbbbbbbbbb', text: '检查项二', done: false },
          ],
          dueDate: '2026-12-01',
          done: false,
          noteId: 'note-aaaaaaaaaa',
          trashed: false,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
          rev: 1,
        },
      ],
    },
    activeBoardId: 'board-main',
    boards: [{ id: 'board-main', title: '默认看板', cards: 1 }],
    counts: {
      notes: 1,
      pinned: 0,
      cards: 1,
      done: 0,
      notesTrash: 0,
      cardsTrash: 0,
      byColumn: { todo: 1, doing: 0, done: 0 },
    },
    storePath: '/tmp/sticky-board/board.json',
  };
}

/** Install a browser-ish global set before the client module runs. */
function installDom() {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/' });
  const globals = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    MouseEvent: dom.window.MouseEvent,
  };
  // Node 24 defines a getter-only `navigator`; defineProperty works for both cases.
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

/** Load client.js with a fake ModuleLoader and return its registered slots. */
async function loadClient() {
  const registered = [];
  const captured = [];
  window.__ModuleLoader__ = {
    load(module) {
      captured.push(module);
    },
  };
  await import(pathToFileURL(path.join(root, 'client.js')).href);
  assert.equal(captured.length, 1, 'client.js must register exactly one module');

  const module = captured[0];
  assert.equal(module.id, '@local/sticky-board');

  const ctx = {
    effect(fn) {
      const dispose = fn();
      return typeof dispose === 'function' ? dispose : () => {};
    },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    locale: {
      register() {
        return () => {};
      },
      bind() {
        return (key) => key;
      },
    },
    slots: {
      inject(_key, callback) {
        callback();
        return () => {};
      },
      register(options, component) {
        registered.push({ options, component });
        return () => {};
      },
    },
  };

  const api = module.factory((id) => {
    if (id === 'react') return React;
    if (id === 'react/jsx-runtime') {
      return {
        jsx: React.createElement,
        jsxs: React.createElement,
        Fragment: React.Fragment,
      };
    }
    throw new Error(`unexpected require("${id}")`);
  });

  api.apply(ctx);
  return { registered, api };
}

const { registered, api } = await loadClient();
const mainEntry = registered.find((entry) => entry.options.name === 'main');
const sidebarEntry = registered.find((entry) => entry.options.name === 'sidebar.panellist');

test('the client registers the main panel and the sidebar entry', () => {
  assert.equal(registered.length, 2);
  assert.equal(mainEntry.options.key, 'sticky-board');
  assert.equal(sidebarEntry.options.id, 'sticky-board');
  assert.equal(sidebarEntry.options.order, 16);
  assert.equal(typeof mainEntry.component, 'function');
  assert.equal(typeof sidebarEntry.component, 'function');

  const icon = renderToStaticMarkup(React.createElement(sidebarEntry.component, { size: 16, active: true }));
  assert.match(icon, /^<svg/);
});

test('the panel renders its loading state without throwing', () => {
  const markup = renderToStaticMarkup(React.createElement(mainEntry.component));
  assert.match(markup, /class="sb-root"/);
  assert.match(markup, /status\.loading/);
});

test('the panel renders a live snapshot (toolbar, board, card)', async () => {
  const payload = fakeSnapshot();
  globalThis.fetch = async () => ({ ok: true, json: async () => payload });

  const container = document.createElement('div');
  document.body.appendChild(container);
  const reactRoot = createRoot(container);
  try {
    await act(async () => {
      reactRoot.render(React.createElement(mainEntry.component));
    });
    const html = container.innerHTML;
    assert.match(html, /sb-bar/, 'toolbar must render');
    assert.match(html, /data-sb-scheme="dark"/, 'no theme service → dark palette');
    assert.match(html, /tab\.wall/, 'wall tab label');
    assert.match(html, /便签甲/, 'note from the snapshot renders on the wall');

    // Switch to the board tab before asserting the board content.
    const boardTab = container.querySelectorAll('.sb-tab')[1];
    assert.ok(boardTab !== null, 'board tab exists');
    await act(async () => {
      boardTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    const boardHtml = container.innerHTML;
    assert.match(boardHtml, /待办/, 'column title from the snapshot');
    assert.match(boardHtml, /卡片甲/, 'card title from the snapshot');
    assert.match(boardHtml, /sb-boardtabs/, 'board tab strip');
    assert.match(boardHtml, /action\.filter/, 'board filter control');
    assert.match(boardHtml, /sb-stats/, 'board stats bar renders');
    assert.match(boardHtml, /stats\.blocked/, 'stats bar has a blocked count');
    assert.match(boardHtml, /label\.doneColumn/, 'stats bar lets the user pick the done column');
    assert.match(boardHtml, /sb-col-done/, 'the configured done column carries its ✓ marker');
    assert.match(boardHtml, /label\.blocked/, 'blocked chip renders on the card');

    // The "+" tab opens the board-template menu (it used to be clipped by the
    // scrollable tab strip; the popover must at least render with its items).
    const addBoard = container.querySelector('.sb-boardtab-add');
    assert.ok(addBoard !== null, 'add-board button exists');
    await act(async () => {
      addBoard.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    const menuHtml = container.innerHTML;
    assert.match(menuHtml, /template\.three/, 'template menu lists the three-column board');
    assert.match(menuHtml, /template\.five/, 'template menu lists the five-column board');
    assert.match(menuHtml, /template\.blank/, 'template menu lists the blank board');
    assert.match(boardHtml, /sb-boardtab-edit/, 'the active board tab offers the rename pencil');

    // 单击卡片打开抽屉
    const card = container.querySelector('[data-card-id="card-bbbbbbbbbb"]');
    assert.ok(card !== null, 'the card element exists');
    await act(async () => {
      card.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    const drawerHtml = container.innerHTML;
    assert.match(drawerHtml, /sb-drawer/, 'clicking a card opens the drawer');
    assert.match(drawerHtml, /P1/, 'drawer shows the priority segment');
    assert.match(drawerHtml, /sb-checklist/, 'drawer renders the checklist section');
    assert.match(drawerHtml, /检查项一/, 'checklist items come from the snapshot');
    assert.match(drawerHtml, /label\.checklist 1\/2/, 'checklist progress in the label');
    assert.match(drawerHtml, /action\.preview/, 'drawer offers the markdown preview toggle');
    assert.match(drawerHtml, /label\.acceptance/, 'drawer has an acceptance-criteria field');
    assert.match(drawerHtml, /验收：冒烟通过/, 'acceptance text comes from the snapshot');
    assert.match(boardHtml, /chip\.acceptance/, 'a card with acceptance criteria shows its chip');
  } finally {
    await act(async () => {
      reactRoot.unmount();
    });
    container.remove();
  }
});

/**
 * A tiny stateful fake Host: GET returns the document, POST applies the card
 * update the UI sends. Enough to drive real interactions, not just rendering.
 */
function createFakeHost(initial) {
  let doc = structuredClone(initial);
  const calls = [];
  const respond = (status = 200) => ({ ok: status < 400, status, json: async () => doc });
  const handler = async (input, init) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method === 'GET') return respond();
    const body = JSON.parse(init.body);
    calls.push(body);
    if (String(body.action).startsWith('history.')) {
      return { ok: true, status: 200, json: async () => ({ ...doc, undone: true }) };
    }
    if (!String(body.action).startsWith('card.')) return respond();
    if (body.action === 'card.bulkUpdate') {
      for (const id of Array.isArray(body.ids) ? body.ids : []) {
        const entry = doc.board.cards.find((card) => card.id === id);
        if (entry === undefined) continue;
        Object.assign(entry, body.patch ?? {});
        entry.rev = (entry.rev ?? 0) + 1;
      }
      return respond();
    }
    const card = doc.board.cards.find((entry) => entry.id === body.id);
    if (card === undefined) return respond(404);
    if (body.action === 'card.update') {
      const patch = { ...body.patch };
      if (Array.isArray(patch.checklist)) {
        // The real Host normalises items (id/text/done); mirror that here.
        patch.checklist = patch.checklist.map((item) => ({
          id: item.id ?? `item-${Math.random().toString(16).slice(2, 12)}`,
          text: String(item.text ?? ''),
          done: item.done === true,
        }));
      }
      Object.assign(card, patch);
    }
    card.rev = (card.rev ?? 0) + 1;
    return respond();
  };
  return { handler, calls, doc: () => doc };
}

/** Mount the panel against a fake Host; returns handles for interaction. */
async function mountPanel(payload) {
  const host = createFakeHost(payload);
  globalThis.fetch = host.handler;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const reactRoot = createRoot(container);
  await act(async () => {
    reactRoot.render(React.createElement(mainEntry.component));
  });
  return {
    container,
    host,
    async unmount() {
      await act(async () => {
        reactRoot.unmount();
      });
      container.remove();
    },
  };
}

test('checklist: ticking an item and adding one really update the Host', async () => {
  const { container, host, unmount } = await mountPanel(fakeSnapshot());
  try {
    const boardTab = container.querySelectorAll('.sb-tab')[1];
    await act(async () => {
      boardTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    const card = container.querySelector('[data-card-id="card-bbbbbbbbbb"]');
    await act(async () => {
      card.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });

    // 勾选第一项（快照里它是已完成）
    const box = container.querySelector('.sb-check-row input[type="checkbox"]');
    assert.ok(box !== null, 'first checklist row exists');
    assert.equal(box.checked, true, 'snapshot shows the first item as done');
    await act(async () => {
      box.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {});
    const toggled = host.calls.find((call) => Array.isArray(call.patch?.checklist));
    assert.ok(toggled !== undefined, 'a card.update with a checklist was sent');
    assert.equal(toggled.patch.checklist[0].done, false, 'ticking turns the item off');

    // 输入一条新检查项并回车
    const input = container.querySelector('.sb-check-add input');
    assert.ok(input !== null, 'add-item input exists');
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      setValue.call(input, '新增子项');
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    await act(async () => {});
    const checklistCalls = host.calls.filter((call) => Array.isArray(call.patch?.checklist));
    const added = checklistCalls.at(-1);
    assert.equal(added.patch.checklist.length, 3, 'the new item was appended');
    assert.equal(added.patch.checklist[2].text, '新增子项');
    assert.equal(
      host.doc().board.cards.find((entry) => entry.id === 'card-bbbbbbbbbb').checklist.length,
      3,
      'the fake Host stored three items',
    );
  } finally {
    await unmount();
  }
});

test('the panel follows the Host theme scheme for its decorative palette', () => {
  let lightMain = null;
  const themeCtx = {
    effect(fn) {
      const dispose = fn();
      return typeof dispose === 'function' ? dispose : () => {};
    },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    locale: { register() { return () => {}; }, bind() { return (key) => key; } },
    slots: {
      inject(_key, callback) { callback(); return () => {}; },
      register(options, component) {
        if (options.name === 'main') lightMain = component;
        return () => {};
      },
    },
    get(service) {
      if (service === 'theme') return { getTheme: () => ({ active: { colorScheme: 'light' } }) };
      return undefined;
    },
    on() { return () => {}; },
  };
  api.apply(themeCtx);
  assert.equal(typeof lightMain, 'function');
  const markup = renderToStaticMarkup(React.createElement(lightMain));
  assert.match(markup, /data-sb-scheme="light"/, 'light scheme reaches the root element');
});

test('Ctrl+Z / Ctrl+Shift+Z request undo and redo from the Host', async () => {
  const { container, host, unmount } = await mountPanel(fakeSnapshot());
  try {
    const rootEl = container.querySelector('.sb-root');
    assert.ok(rootEl !== null, 'panel root exists');
    await act(async () => {
      rootEl.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    });
    await act(async () => {});
    assert.ok(host.calls.some((call) => call.action === 'history.undo'), 'Ctrl+Z asks for undo');
    assert.match(container.innerHTML, /toast\.undone/, 'undo toast shows');

    await act(async () => {
      rootEl.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true }));
    });
    await act(async () => {});
    assert.ok(host.calls.some((call) => call.action === 'history.redo'), 'Ctrl+Shift+Z asks for redo');
    assert.match(container.innerHTML, /toast\.redone/, 'redo toast shows');
  } finally {
    await unmount();
  }
});

test('destructive actions ask in a themed dialog; cancel does not act', async () => {
  const payload = fakeSnapshot();
  payload.boards.push({ id: 'board-two', title: '副板', cards: 0 });
  const { container, host, unmount } = await mountPanel(payload);
  try {
    const boardTab = container.querySelectorAll('.sb-tab')[1];
    await act(async () => {
      boardTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    const deleteButton = container.querySelector('[title="action.deleteBoard"]');
    assert.ok(deleteButton !== null, 'delete-board control exists with more than one board');
    await act(async () => {
      deleteButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    assert.match(container.innerHTML, /sb-modal/, 'a dialog opens');
    assert.match(container.innerHTML, /confirm\.deleteBoard/, 'dialog explains the consequence');
    assert.match(container.innerHTML, /confirm\.undoHint/, 'dialog mentions undo');

    // 取消：关闭弹窗且不发请求
    const cancel = container.querySelector('.sb-modal-actions button');
    assert.ok(cancel !== null, 'dialog has a cancel button');
    await act(async () => {
      cancel.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    assert.doesNotMatch(container.innerHTML, /sb-modal/, 'cancel closes the dialog');
    assert.equal(host.calls.some((call) => call.action === 'board.remove'), false, 'cancel sends nothing');

    // 确认：发 board.remove
    await act(async () => {
      deleteButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    const buttons = container.querySelectorAll('.sb-modal-actions button');
    assert.equal(buttons.length, 2, 'dialog has cancel + confirm');
    await act(async () => {
      buttons[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    assert.ok(host.calls.some((call) => call.action === 'board.remove'), 'confirm asks the Host to remove the board');
  } finally {
    await unmount();
  }
});

test('Enter confirms the dialog from the keyboard', async () => {
  const payload = fakeSnapshot();
  payload.boards.push({ id: 'board-two', title: '副板', cards: 0 });
  const { container, host, unmount } = await mountPanel(payload);
  try {
    const boardTab = container.querySelectorAll('.sb-tab')[1];
    await act(async () => {
      boardTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    const deleteButton = container.querySelector('[title="action.deleteBoard"]');
    await act(async () => {
      deleteButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    const modal = container.querySelector('.sb-modal');
    assert.ok(modal !== null, 'dialog opens');
    await act(async () => {
      modal.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    assert.ok(host.calls.some((call) => call.action === 'board.remove'), 'Enter confirms');
  } finally {
    await unmount();
  }
});

test('wall view exposes density and colour filters', async () => {
  const { container, host, unmount } = await mountPanel(fakeSnapshot());
  try {
    assert.match(container.innerHTML, /data-sb-density="auto"/, 'root carries the density preset');

    const filterButton = container.querySelector('[title="action.filter"]');
    assert.ok(filterButton !== null, 'wall filter button exists');
    await act(async () => {
      filterButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    assert.match(container.innerHTML, /label\.color/, 'colour filter menu opens');
    assert.match(container.innerHTML, /label\.pinnedOnly/, 'pinned-only toggle exists');

    const swatch = container.querySelector('.sb-swatch');
    assert.ok(swatch !== null, 'colour swatches render');
    await act(async () => {
      swatch.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    assert.equal(container.querySelector('.sb-swatch').getAttribute('data-on'), 'true', 'picked colour is marked');

    const densityButton = container.querySelector('[title="action.density"]');
    assert.ok(densityButton !== null, 'density button exists');
    await act(async () => {
      densityButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {});
    assert.ok(
      host.calls.some((call) => call.action === 'settings.update' && call.patch?.wallDensity === 'compact'),
      'density button persists the next preset',
    );
  } finally {
    await unmount();
  }
});

test('the stats bar can change the done column', async () => {
  const { container, host, unmount } = await mountPanel(fakeSnapshot());
  try {
    const boardTab = container.querySelectorAll('.sb-tab')[1];
    await act(async () => {
      boardTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    const picker = container.querySelector('[title="hint.doneColumn"]');
    assert.ok(picker !== null, 'done-column picker exists in the stats bar');
    await act(async () => {
      picker.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    assert.match(container.innerHTML, /label\.doneColumn/, 'picker menu opens');
    assert.match(container.innerHTML, /label\.noDoneColumn/, 'picker offers a "no done column" option');

    const menu = container.querySelector('.sb-menu.sb-filter');
    assert.ok(menu !== null, 'picker popover rendered');
    const target = [...menu.querySelectorAll('button')].find((button) => button.textContent === '进行中');
    assert.ok(target !== undefined, 'every column is listed');
    await act(async () => {
      target.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {});
    const sent = host.calls.find((call) => call.action === 'board.update');
    assert.ok(sent !== undefined, 'picking a column writes the board');
    assert.equal(sent.patch.doneColumnId, 'doing');
  } finally {
    await unmount();
  }
});

test('multi-selected cards toggle done in one bulk write', async () => {
  const payload = fakeSnapshot();
  const second = structuredClone(payload.board.cards[0]);
  second.id = 'card-cccccccccc';
  second.title = '卡片乙';
  second.order = 1;
  second.noteId = null;
  second.checklist = [];
  second.acceptance = '';
  payload.board.cards.push(second);

  const { container, host, unmount } = await mountPanel(payload);
  try {
    const boardTab = container.querySelectorAll('.sb-tab')[1];
    await act(async () => {
      boardTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    for (const id of ['card-bbbbbbbbbb', 'card-cccccccccc']) {
      const card = container.querySelector(`[data-card-id="${id}"]`);
      assert.ok(card !== null, `card ${id} exists`);
      await act(async () => {
        card.dispatchEvent(new window.MouseEvent('click', { bubbles: true, ctrlKey: true }));
      });
    }
    const selbar = container.querySelector('.sb-selbar');
    assert.ok(selbar !== null, 'selection bar appears for two cards');
    const doneButton = [...selbar.querySelectorAll('button')].find((button) => button.textContent === 'action.done');
    assert.ok(doneButton !== undefined, 'batch done button exists');
    await act(async () => {
      doneButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {});
    const bulk = host.calls.find((call) => call.action === 'card.bulkUpdate');
    assert.ok(bulk !== undefined, 'one bulk request instead of one update per card');
    assert.deepEqual(bulk.ids, ['card-bbbbbbbbbb', 'card-cccccccccc']);
    assert.equal(bulk.patch.done, true);
  } finally {
    await unmount();
  }
});
