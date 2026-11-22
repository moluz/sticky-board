/**
 * Agent tools: the same repository the panel drives, exposed to the model.
 *
 * Names are prefixed with `sticky_` so a profile that also runs another
 * notes or kanban plugin never hits a duplicate global tool name.
 *
 * @module @local/sticky-board/tools
 */

import { NOTE_COLORS, PRIORITIES } from './model.js';

/** Shared output shape: one text block the model reads. */
const OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: { text: { type: 'string' } },
    required: ['text'],
  },
  render: (_args, value) => [{ type: 'text', text: String(value?.text ?? '') }],
};

/** A short single-line preview. */
function clip(text, max = 120) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** Column templates shared by the `create` action (data titles, like the UI). */
const TEMPLATE_COLUMNS = {
  three: ['待办', '进行中', '完成'],
  five: ['待办', '进行中', '待评审', '阻塞', '完成'],
  blank: ['待办'],
};

/**
 * Build every tool definition bound to one repository.
 * @param repository - the sticky-board repository.
 * @returns the tool definitions to register.
 */
export function createToolSpecs(repository) {
  return [
    {
      name: 'sticky_board_get',
      description:
        '读取「便签墙 + 任务板」的整体状态：便签数量、看板列表与当前活动看板、每列各有多少任务、数据文件在哪。回答「我的便签墙现在有什么」或需要先了解全局时调用。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: OUTPUT,
      async execute() {
        const snap = await repository.snapshot({ includeTrash: true });
        const counts = snap.counts;
        const columns = snap.board.columns
          .map(
            (column) =>
              `${column.title}( ${column.id} )${column.id === snap.board.doneColumnId ? '【完成列】' : ''}: ${counts.byColumn[column.id] ?? 0}`,
          )
          .join('，');
        const boards = snap.boards
          .map((board) => `${board.id === snap.activeBoardId ? '*' : '-'} ${board.id} 「${board.title}」 ${board.cards} 个任务`)
          .join('\n');
        return {
          text: [
            `便签墙：${counts.notes} 张活跃便签（置顶 ${counts.pinned}），回收站 ${counts.notesTrash} 张。`,
            `看板（* 为当前活动，可用 sticky_board_manage 切换）：\n${boards}`,
            `当前看板「${snap.board.title}」：${counts.cards} 张活跃任务（完成 ${counts.done}），回收站 ${counts.cardsTrash} 张。`,
            `列（id: 数量）：${columns}`,
            `数据文件：${snap.storePath}`,
          ].join('\n'),
        };
      },
    },
    {
      name: 'sticky_board_manage',
      description:
        '管理任务板的看板：list 列出全部看板，select 切换到某块板，create 新建一块板，rename 重命名，delete 删除（至少保留一块），doneColumn 指定当前看板哪一列代表「完成」，undo / redo 撤销或重做。任务类工具（sticky_task_*）总是作用在当前活动看板上，所以跨板操作前先 select。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'select', 'create', 'rename', 'delete', 'doneColumn', 'undo', 'redo'],
            description: '要执行的动作。undo / redo 撤销或重做最近一次写入（内存历史，重启失效）。doneColumn 设置完成列。',
          },
          boardId: { type: 'string', description: '目标看板 id；list、create、doneColumn 之外的动作需要。' },
          title: { type: 'string', description: 'create / rename 时的看板名称。' },
          columnId: {
            type: 'string',
            description: 'doneColumn 时的目标列 id（先用 sticky_board_get 查列 id）；传空字符串表示不指定完成列。',
          },
          template: {
            type: 'string',
            enum: ['three', 'five', 'blank'],
            description: 'create 时的列模板：three=待办/进行中/完成，five=再加待评审/阻塞，blank=只有一列待办。默认 three。',
          },
        },
        required: ['action'],
        additionalProperties: false,
      },
      output: OUTPUT,
      async execute(args) {
        const action = typeof args?.action === 'string' ? args.action : '';
        const boardId = typeof args?.boardId === 'string' ? args.boardId.trim() : '';
        const title = typeof args?.title === 'string' ? args.title.trim() : '';
        if (action === 'list') {
          const boards = await repository.listBoards();
          return {
            text: `共 ${boards.length} 块看板：\n${boards
              .map((board) => `${board.active ? '*' : '-'} ${board.id} 「${board.title}」 ${board.cards} 个任务`)
              .join('\n')}`,
          };
        }
        if (action === 'create') {
          const columns = TEMPLATE_COLUMNS[typeof args?.template === 'string' ? args.template : 'three'];
          const board = await repository.addBoard(title, columns);
          if (board === undefined) throw new Error('看板数量已达上限 12；先删除不用的看板');
          return {
            text: `已新建看板 ${board.id}「${board.title}」（${board.columns.length} 列：${board.columns
              .map((column) => column.title)
              .join(' / ')}），并切换为当前看板。`,
          };
        }
        if (action === 'doneColumn') {
          const snapshot = await repository.snapshot({});
          const wanted = typeof args?.columnId === 'string' ? args.columnId.trim() : '';
          const board = await repository.updateBoard(snapshot.activeBoardId, { doneColumnId: wanted });
          if (board === undefined) throw new Error(`找不到当前看板 ${snapshot.activeBoardId}`);
          if (board.doneColumnId === null) {
            return { text: '已取消当前看板的完成列：卡片进出任何列都不会再自动改完成标记。' };
          }
          const column = snapshot.board.columns.find((entry) => entry.id === board.doneColumnId);
          return {
            text: `已把「${column?.title ?? board.doneColumnId}」(${board.doneColumnId}) 设为当前看板的完成列：卡片移入即标记完成，移出即清除完成标记。`,
          };
        }
        if (action === 'undo' || action === 'redo') {
          const outcome = action === 'undo' ? await repository.undo() : await repository.redo();
          const depth = repository.historyDepth();
          if (outcome.changed !== true) {
            return {
              text: `没有可${action === 'undo' ? '撤销' : '重做'}的操作（可撤销 ${depth.past} 步 / 可重做 ${depth.future} 步）。`,
            };
          }
          const snapshot = await repository.snapshot({});
          const board = snapshot.boards.find((entry) => entry.active === true);
          return {
            text: `已${action === 'undo' ? '撤销' : '重做'}一步；当前看板「${board?.title ?? ''}」共 ${snapshot.counts.cards} 张任务（可撤销 ${depth.past} 步 / 可重做 ${depth.future} 步）。`,
          };
        }
        if (boardId === '') throw new Error('这个动作需要 boardId；先用 action=list 查看');
        if (action === 'select') {
          const board = await repository.selectBoard(boardId);
          if (board === undefined) throw new Error(`找不到 id 为 ${boardId} 的看板；先用 action=list`);
          return { text: `已切换到看板 ${board.id}「${board.title}」。` };
        }
        if (action === 'rename') {
          if (title === '') throw new Error('rename 需要 title');
          const board = await repository.updateBoard(boardId, { title });
          if (board === undefined) throw new Error(`找不到 id 为 ${boardId} 的看板；先用 action=list`);
          return { text: `已把看板 ${board.id} 重命名为「${board.title}」。` };
        }
        if (action === 'delete') {
          const outcome = await repository.removeBoard(boardId);
          if (outcome.removed !== true) {
            throw new Error(outcome.reason === 'last-board' ? '至少要保留一块看板' : `找不到 id 为 ${boardId} 的看板`);
          }
          return { text: `已删除看板 ${boardId}（其中 ${outcome.cards} 个任务一并删除）；当前看板是 ${outcome.activeBoardId}。` };
        }
        throw new Error('action 必须是 list / select / create / rename / delete / doneColumn / undo / redo');
      },
    },

    // --- notes -------------------------------------------------------
    {
      name: 'sticky_note_list',
      description:
        '列出便签墙上的便签，返回每张便签的 id、标题、颜色、置顶/回收站标记和正文摘要。后续 update / remove 都要用这里的 id。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '可选：不区分大小写的子串，匹配标题与正文。' },
          includeTrash: { type: 'boolean', description: '是否包含回收站里的便签，默认 false。' },
        },
        additionalProperties: false,
      },
      output: OUTPUT,
      async execute(args) {
        const snap = await repository.snapshot({
          includeTrash: args?.includeTrash === true,
          query: typeof args?.query === 'string' ? args.query : '',
        });
        if (snap.notes.length === 0) {
          return { text: `没有匹配的便签。便签墙共 ${snap.counts.notes} 张活跃便签，回收站 ${snap.counts.notesTrash} 张。` };
        }
        const lines = snap.notes.map((note) => {
          const marks = [note.color, note.pinned === true ? 'pinned' : '', note.trashed === true ? 'trash' : '']
            .filter((mark) => mark !== '')
            .join(',');
          return `- ${note.id} | ${repository.titleOf(note)}${marks === '' ? '' : ` [${marks}]`} | ${clip(note.text)}`;
        });
        return { text: `${snap.notes.length} 张便签：\n${lines.join('\n')}` };
      },
    },
    {
      name: 'sticky_note_create',
      description:
        '在便签墙上新建一张便签。用户说「记一条」「帮我记下」「存个便签」时使用。正文可以是多行；首行会作为标题显示。',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '便签正文，纯文本，保留换行。每行会成为一个条目。' },
          color: { type: 'string', enum: NOTE_COLORS, description: '纸色，默认 amber。' },
          pinned: { type: 'boolean', description: '是否置顶，默认 false。' },
        },
        required: ['text'],
        additionalProperties: false,
      },
      output: OUTPUT,
      async execute(args) {
        const text = typeof args?.text === 'string' ? args.text : '';
        if (text.trim() === '') throw new Error('便签正文不能为空；把要记住的内容放进 text');
        const note = await repository.createNote({
          lines: text.split('\n').map((line) => ({ kind: 'text', text: line })),
          color: args?.color,
          pinned: args?.pinned === true,
        });
        return { text: `已新建便签 ${note.id}：「${repository.titleOf(note)}」颜色 ${note.color} 置顶 ${note.pinned}。` };
      },
    },
    {
      name: 'sticky_note_update',
      description:
        '修改一张便签：正文、颜色、置顶或是否放进回收站。省略的字段保持不变。改正文会整段替换，不是追加。先用 sticky_note_list 拿到 id。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '便签 id，来自 sticky_note_list 或 sticky_note_create。' },
          text: { type: 'string', description: '新的完整正文（保留换行），整段替换旧正文。' },
          color: { type: 'string', enum: NOTE_COLORS, description: '新的纸色。' },
          pinned: { type: 'boolean', description: 'true 置顶，false 取消置顶。' },
          trashed: { type: 'boolean', description: 'true 放进回收站，false 从回收站恢复。' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      output: OUTPUT,
      async execute(args) {
        const id = typeof args?.id === 'string' ? args.id.trim() : '';
        if (id === '') throw new Error('缺少便签 id；先调用 sticky_note_list');
        const patch = {};
        if (typeof args?.text === 'string') {
          patch.lines = args.text.split('\n').map((line) => ({ kind: 'text', text: line }));
        }
        if (typeof args?.color === 'string') patch.color = args.color;
        if (typeof args?.pinned === 'boolean') patch.pinned = args.pinned;
        if (typeof args?.trashed === 'boolean') patch.trashed = args.trashed;
        if (Object.keys(patch).length === 0) throw new Error('请至少给出 text、color、pinned、trashed 之一');
        const note = await repository.updateNote(id, patch);
        if (note === undefined) throw new Error(`找不到 id 为 ${id} 的便签；先调用 sticky_note_list`);
        return { text: `已更新便签 ${note.id}：「${repository.titleOf(note)}」颜色 ${note.color} 置顶 ${note.pinned} 回收站 ${note.trashed}。` };
      },
    },
    {
      name: 'sticky_note_remove',
      description:
        '删除一张便签。默认移入回收站（可用 sticky_note_update trashed=false 恢复）；permanent=true 会彻底清除。只删用户明确要求删除的便签。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '便签 id，来自 sticky_note_list。' },
          permanent: { type: 'boolean', description: 'true 表示彻底清除，不进回收站。' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      output: OUTPUT,
      async execute(args) {
        const id = typeof args?.id === 'string' ? args.id.trim() : '';
        if (id === '') throw new Error('缺少便签 id；先调用 sticky_note_list');
        const outcome = await repository.removeNote(id, { permanent: args?.permanent === true });
        if (outcome.removed !== true) throw new Error(`找不到 id 为 ${id} 的便签；先调用 sticky_note_list`);
        return { text: args?.permanent === true ? `已彻底删除便签 ${id}。` : `已把便签 ${id} 移入回收站（可用 trashed=false 恢复）。` };
      },
    },

    {
      name: 'sticky_note_bulk',
      description:
        '批量修改便签（墙级工具）：一次给多张便签换纸色、置顶/取消置顶、移入回收站或恢复。ids 来自 sticky_note_list；只改用户明确要求的那一项。整批只算一次写入，可用 undo 一步撤回。',
      parameters: {
        type: 'object',
        properties: {
          ids: {
            type: 'array',
            items: { type: 'string' },
            description: '要修改的便签 id 列表（1–100 个），来自 sticky_note_list。',
          },
          color: { type: 'string', enum: NOTE_COLORS, description: '统一换成这个纸色。' },
          pinned: { type: 'boolean', description: 'true 全部置顶，false 全部取消置顶。' },
          trashed: { type: 'boolean', description: 'true 全部移入回收站，false 全部恢复。' },
        },
        required: ['ids'],
        additionalProperties: false,
      },
      output: OUTPUT,
      async execute(args) {
        const ids = Array.isArray(args?.ids)
          ? args.ids.filter((id) => typeof id === 'string' && id.trim() !== '').map((id) => id.trim()).slice(0, 100)
          : [];
        if (ids.length === 0) throw new Error('ids 不能为空；先用 sticky_note_list 拿便签 id');
        const patch = {};
        if (typeof args?.color === 'string') patch.color = args.color;
        if (typeof args?.pinned === 'boolean') patch.pinned = args.pinned;
        if (typeof args?.trashed === 'boolean') patch.trashed = args.trashed;
        if (Object.keys(patch).length === 0) throw new Error('请至少给出 color、pinned、trashed 之一');
        const outcome = await repository.updateNotes(ids, patch);
        const fields = [
          patch.color === undefined ? '' : `纸色 ${patch.color}`,
          patch.pinned === undefined ? '' : patch.pinned ? '置顶' : '取消置顶',
          patch.trashed === undefined ? '' : patch.trashed ? '移入回收站' : '恢复',
        ].filter((entry) => entry !== '').join(' / ');
        return {
          text: `已批量更新 ${outcome.notesUpdated} / ${ids.length} 张便签（${fields}）。`,
        };
      },
    },

    // --- tasks -------------------------------------------------------
    {
      name: 'sticky_task_list',
      description: '列出任务板上的任务，返回 id、标题、所在列、优先级、完成标记与描述摘要。query 匹配标题、描述、验收标准、检查项文本与标签；move / update / remove 需要这里的 id。',
      parameters: {
        type: 'object',
        properties: {
          columnId: { type: 'string', description: '只看某一列（先用 sticky_board_get 查列 id）。' },
          query: { type: 'string', description: '可选：不区分大小写的子串，匹配标题、描述、验收标准、检查项文本与标签。' },
          includeTrash: { type: 'boolean', description: '是否包含回收站，默认 false。' },
        },
        additionalProperties: false,
      },
      output: OUTPUT,
      async execute(args) {
        const snap = await repository.snapshot({
          includeTrash: args?.includeTrash === true,
          query: typeof args?.query === 'string' ? args.query : '',
        });
        const columnId = typeof args?.columnId === 'string' ? args.columnId : '';
        const cards = columnId === ''
          ? snap.board.cards
          : snap.board.cards.filter((card) => card.columnId === columnId);
        if (cards.length === 0) {
          return { text: `没有匹配的任务。任务板共 ${snap.counts.cards} 张活跃任务，回收站 ${snap.counts.cardsTrash} 张。` };
        }
        const lines = cards.map((card) => {
          const items = Array.isArray(card.checklist) ? card.checklist : [];
          const progress = items.length === 0 ? '' : ` ☑ ${items.filter((item) => item.done === true).length}/${items.length}`;
          const marks = [card.priority, card.done === true ? 'done' : '', card.blocked === true ? 'blocked' : '', card.trashed === true ? 'trash' : '']
            .filter((mark) => mark !== '')
            .join(',');
          const acceptance = typeof card.acceptance === 'string' && card.acceptance.trim() !== ''
            ? ` | 验收: ${clip(card.acceptance, 100)}`
            : '';
          return `- ${card.id} | ${card.title} | ${card.columnId} [${marks}]${progress} | ${clip(card.note)}${acceptance}`;
        });
        return { text: `${cards.length} 张任务：\n${lines.join('\n')}` };
      },
    },
    {
      name: 'sticky_task_create',
      description: '在任务板上新建一张任务卡。用户说「加个任务」「记到待办」「放到看板」时使用。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '任务标题。' },
          note: { type: 'string', description: '任务描述（Markdown 纯文本），可省略。' },
          acceptance: { type: 'string', description: '验收标准（多行纯文本，≤2000 字）：什么算做完。可省略。' },
          columnId: { type: 'string', description: '目标列 id，默认第一列（通常是 todo）。' },
          priority: { type: 'string', enum: PRIORITIES, description: '优先级，默认 P2。' },
          dueDate: { type: 'string', description: '截止日期，格式 YYYY-MM-DD。' },
          checklist: {
            type: 'array',
            description: '检查项（子任务），每项 { text, done }。',
            items: {
              type: 'object',
              properties: { text: { type: 'string' }, done: { type: 'boolean' } },
              required: ['text'],
              additionalProperties: false,
            },
          },
        },
        required: ['title'],
        additionalProperties: false,
      },
      output: OUTPUT,
      async execute(args) {
        const title = typeof args?.title === 'string' ? args.title.trim() : '';
        if (title === '') throw new Error('任务标题不能为空');
        const card = await repository.createCard({
          title,
          note: args?.note,
          acceptance: args?.acceptance,
          columnId: args?.columnId,
          priority: args?.priority,
          dueDate: args?.dueDate,
          checklist: Array.isArray(args?.checklist) ? args.checklist : undefined,
        });
        const items = Array.isArray(card.checklist) ? card.checklist : [];
        return {
          text: `已新建任务 ${card.id}：「${card.title}」列 ${card.columnId} 优先级 ${card.priority}${
            items.length === 0 ? '' : `，检查项 ${items.length} 项`
          }。`,
        };
      },
    },
    {
      name: 'sticky_task_update',
      description: '修改一张任务卡：标题、描述、验收标准、优先级、标签、截止日期、完成状态或所在列。省略的字段保持不变。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '任务 id，来自 sticky_task_list。' },
          title: { type: 'string', description: '新标题。' },
          note: { type: 'string', description: '新的完整描述（整段替换）。' },
          acceptance: { type: 'string', description: '新的验收标准（整段替换，≤2000 字）；传空字符串表示清除。' },
          priority: { type: 'string', enum: PRIORITIES, description: '新的优先级。' },
          labels: { type: 'array', items: { type: 'string' }, description: '标签列表，整组替换。' },
          checklist: {
            type: 'array',
            description: '检查项整组替换；每项 { text, done }。传空数组即清空。',
            items: {
              type: 'object',
              properties: { text: { type: 'string' }, done: { type: 'boolean' } },
              required: ['text'],
              additionalProperties: false,
            },
          },
          dueDate: { type: 'string', description: '截止日期 YYYY-MM-DD；传空字符串表示清除。' },
          blocked: { type: 'boolean', description: '是否阻塞（人员/依赖/外部原因）。' },
          blockedReason: { type: 'string', description: '阻塞原因，最长 200 字；blocked 为 false 时会被忽略。' },
          done: { type: 'boolean', description: '是否完成。' },
          columnId: { type: 'string', description: '移到某一列（自动追加到该列末尾）。' },
          trashed: { type: 'boolean', description: 'true 放进回收站，false 恢复。' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      output: OUTPUT,
      async execute(args) {
        const id = typeof args?.id === 'string' ? args.id.trim() : '';
        if (id === '') throw new Error('缺少任务 id；先调用 sticky_task_list');
        const patch = {};
        if (typeof args?.title === 'string') patch.title = args.title;
        if (typeof args?.note === 'string') patch.note = args.note;
        if (typeof args?.acceptance === 'string') patch.acceptance = args.acceptance;
        if (typeof args?.priority === 'string') patch.priority = args.priority;
        if (Array.isArray(args?.labels)) patch.labels = args.labels;
        if (Array.isArray(args?.checklist)) patch.checklist = args.checklist;
        if (typeof args?.dueDate === 'string') patch.dueDate = args.dueDate === '' ? null : args.dueDate;
        if (typeof args?.blocked === 'boolean') patch.blocked = args.blocked;
        if (typeof args?.blockedReason === 'string') patch.blockedReason = args.blocked ? args.blockedReason : null;
        if (typeof args?.done === 'boolean') patch.done = args.done;
        if (typeof args?.columnId === 'string') patch.columnId = args.columnId;
        if (typeof args?.trashed === 'boolean') patch.trashed = args.trashed;
        if (Object.keys(patch).length === 0) throw new Error('请至少给出一个要修改的字段');
        const card = await repository.updateCard(id, patch);
        if (card === undefined) throw new Error(`找不到 id 为 ${id} 的任务；先调用 sticky_task_list`);
        const items = Array.isArray(card.checklist) ? card.checklist : [];
        const progress = items.length === 0
          ? ''
          : `，检查项 ${items.length} 项（已完成 ${items.filter((item) => item.done === true).length}）`;
        const acceptance = typeof card.acceptance === 'string' && card.acceptance.trim() !== ''
          ? `，验收标准 ${card.acceptance.trim().length} 字`
          : '';
        return {
          text: `已更新任务 ${card.id}：「${card.title}」列 ${card.columnId} 优先级 ${card.priority} 完成 ${card.done}${progress}${acceptance}。`,
        };
      },
    },
    {
      name: 'sticky_task_move',
      description: '把一张任务卡移动到某一列，可指定列内落点位置。跨列拖动的等价操作。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '任务 id。' },
          columnId: { type: 'string', description: '目标列 id。' },
          toIndex: { type: 'integer', description: '目标列内插入位置，0 表示最前；省略表示末尾。' },
        },
        required: ['id', 'columnId'],
        additionalProperties: false,
      },
      output: OUTPUT,
      async execute(args) {
        const id = typeof args?.id === 'string' ? args.id.trim() : '';
        const columnId = typeof args?.columnId === 'string' ? args.columnId.trim() : '';
        if (id === '') throw new Error('缺少任务 id；先调用 sticky_task_list');
        if (columnId === '') throw new Error('缺少 columnId；先用 sticky_board_get 查列 id');
        const card = await repository.moveCard(id, { columnId, toIndex: args?.toIndex });
        if (card === undefined) throw new Error(`任务 ${id} 或列 ${columnId} 不存在；先调用 sticky_task_list / sticky_board_get`);
        return { text: `已把任务 ${card.id}「${card.title}」移到 ${columnId} 的第 ${card.order + 1} 位。` };
      },
    },
    {
      name: 'sticky_task_remove',
      description: '删除一张任务卡。默认移入回收站（可用 sticky_task_update trashed=false 恢复）；permanent=true 彻底清除。只删用户明确要求删除的任务。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '任务 id，来自 sticky_task_list。' },
          permanent: { type: 'boolean', description: 'true 表示彻底清除。' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      output: OUTPUT,
      async execute(args) {
        const id = typeof args?.id === 'string' ? args.id.trim() : '';
        if (id === '') throw new Error('缺少任务 id；先调用 sticky_task_list');
        const outcome = await repository.removeCard(id, { permanent: args?.permanent === true });
        if (outcome.removed !== true) throw new Error(`找不到 id 为 ${id} 的任务；先调用 sticky_task_list`);
        return { text: args?.permanent === true ? `已彻底删除任务 ${id}。` : `已把任务 ${id} 移入回收站（可用 trashed=false 恢复）。` };
      },
    },

    {
      name: 'sticky_task_bulk',
      description:
        '批量修改任务（板级工具）：一次移动多张任务到某一列、统一改优先级/标签、标记完成、设阻塞或移入回收站/恢复。ids 来自 sticky_task_list；整批只算一次写入，可用 undo 一步撤回。',
      parameters: {
        type: 'object',
        properties: {
          ids: {
            type: 'array',
            items: { type: 'string' },
            description: '要修改的任务 id 列表（1–100 个），来自 sticky_task_list。',
          },
          columnId: { type: 'string', description: '统一移到这一列（追加到该列末尾，按 ids 顺序）。' },
          priority: { type: 'string', enum: PRIORITIES, description: '统一改成这个优先级。' },
          labels: { type: 'array', items: { type: 'string' }, description: '统一替换成这组标签。' },
          done: { type: 'boolean', description: 'true 全部标记完成，false 全部标记未完成。' },
          blocked: { type: 'boolean', description: 'true 全部标为阻塞，false 全部解除阻塞。' },
          blockedReason: { type: 'string', description: '阻塞原因（≤200 字，仅在 blocked 为 true 时生效）。' },
          trashed: { type: 'boolean', description: 'true 全部移入回收站，false 全部恢复。' },
        },
        required: ['ids'],
        additionalProperties: false,
      },
      output: OUTPUT,
      async execute(args) {
        const ids = Array.isArray(args?.ids)
          ? args.ids.filter((id) => typeof id === 'string' && id.trim() !== '').map((id) => id.trim()).slice(0, 100)
          : [];
        if (ids.length === 0) throw new Error('ids 不能为空；先用 sticky_task_list 拿任务 id');
        const patch = {};
        if (typeof args?.columnId === 'string') patch.columnId = args.columnId;
        if (typeof args?.priority === 'string') patch.priority = args.priority;
        if (Array.isArray(args?.labels)) patch.labels = args.labels;
        if (typeof args?.done === 'boolean') patch.done = args.done;
        if (typeof args?.blocked === 'boolean') patch.blocked = args.blocked;
        if (typeof args?.blockedReason === 'string') patch.blockedReason = args.blocked === true ? args.blockedReason : null;
        if (typeof args?.trashed === 'boolean') patch.trashed = args.trashed;
        if (Object.keys(patch).length === 0) throw new Error('请至少给出一个要修改的字段');
        const outcome = await repository.updateCards(ids, patch);
        const target = typeof args?.columnId === 'string' && args.columnId !== '' ? `，列 ${args.columnId}` : '';
        return {
          text: `已批量更新 ${outcome.cardsUpdated} / ${ids.length} 张任务${target}。`,
        };
      },
    },

    // --- wall ↔ board ------------------------------------------------
    {
      name: 'sticky_note_to_task',
      description: '把便签墙上的某张便签转成任务板上的任务：首行作标题、其余行作描述与勾选清单，便签保留并与新任务互相引用。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '便签 id。' },
          columnId: { type: 'string', description: '目标列 id，默认第一列。' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      output: OUTPUT,
      async execute(args) {
        const id = typeof args?.id === 'string' ? args.id.trim() : '';
        if (id === '') throw new Error('缺少便签 id；先调用 sticky_note_list');
        const outcome = await repository.noteToTask(id, { columnId: args?.columnId });
        if (outcome.ok !== true) throw new Error(`找不到 id 为 ${id} 的便签；先调用 sticky_note_list`);
        return { text: `已把便签 ${id} 转成任务 ${outcome.card.id}「${outcome.card.title}」，两者已互相关联。` };
      },
    },
    {
      name: 'sticky_task_to_note',
      description: '把任务板上的某张任务转成便签墙上的一张便签：标题作首行、描述按 Markdown 列表解析成条目，任务保留并与新便签互相引用。',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: '任务 id。' } },
        required: ['id'],
        additionalProperties: false,
      },
      output: OUTPUT,
      async execute(args) {
        const id = typeof args?.id === 'string' ? args.id.trim() : '';
        if (id === '') throw new Error('缺少任务 id；先调用 sticky_task_list');
        const outcome = await repository.taskToNote(id);
        if (outcome.ok !== true) throw new Error(`找不到 id 为 ${id} 的任务；先调用 sticky_task_list`);
        return { text: `已把任务 ${id} 转成便签 ${outcome.note.id}「${repository.titleOf(outcome.note)}」，两者已互相关联。` };
      },
    },
    {
      name: 'sticky_note_sync_to_task',
      description:
        '把便签的当前内容（标题 + 各行）单向同步到它关联的任务上。任务的优先级、标签、截止日期、完成状态和所在列保持不变；两边必须先有关联（sticky_note_to_task 或 sticky_task_to_note 建立）。只同步便签到任务这一个方向。',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: '便签 id，来自 sticky_note_list。' } },
        required: ['id'],
        additionalProperties: false,
      },
      output: OUTPUT,
      async execute(args) {
        const id = typeof args?.id === 'string' ? args.id.trim() : '';
        if (id === '') throw new Error('缺少便签 id；先调用 sticky_note_list');
        const snapshot = await repository.snapshot({ includeTrash: true });
        const note = snapshot.notes.find((entry) => entry.id === id);
        if (note === undefined) throw new Error(`找不到 id 为 ${id} 的便签；先调用 sticky_note_list`);
        if (note.linkedCardId === null || note.linkedCardId === undefined) {
          throw new Error('这张便签还没有关联任务；先用 sticky_note_to_task 生成，再同步');
        }
        const outcome = await repository.syncNoteToCard(note.linkedCardId);
        if (outcome.ok !== true) throw new Error(`同步失败：${outcome.reason}`);
        return {
          text: `已把便签 ${id} 的内容同步到任务 ${outcome.card.id}（标题「${outcome.card.title}」，保留原有优先级/标签/截止/列）。`,
        };
      },
    },
  ];
}
