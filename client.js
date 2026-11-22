/**
 * @local/sticky-board — browser half.
 *
 * Two halves of one panel: the wallpaper (`便签墙`) and the task board
 * (`任务板`). Every change goes to the Host through `/api/sticky-board`, so the
 * page, another browser tab, and the agent tools all read the same document.
 *
 * The client never keeps authoritative state: it renders one snapshot and
 * posts one action per user gesture.
 */
window.__ModuleLoader__.load({
  id: '@local/sticky-board',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef, useMemo, useCallback } = React;

    /** Panel key, sidebar entry id, and module row id. */
    const ID = 'sticky-board';
    /** Locale namespace. */
    const NS = 'stickyBoard';
    /** Host route. */
    const API = '/api/sticky-board';
    /** Paper colours: decorative artwork, so literal values are fine here. */
    const PAPERS = {
      amber: '#f7d488',
      rose: '#f5b9bc',
      mint: '#bfe4c9',
      sky: '#b9d9f3',
      violet: '#d9c7f2',
      slate: '#d6dbe4',
      plain: '#f2f3f5',
    };
    const COLOR_ORDER = ['amber', 'rose', 'mint', 'sky', 'violet', 'slate', 'plain'];
    const PRIORITY_COLORS = { P0: 'var(--sb-danger)', P1: 'var(--sb-warn-strong)', P2: 'var(--sb-info)', P3: 'var(--sb-muted)' };
    const PRIORITIES = ['P0', 'P1', 'P2', 'P3'];

    const ZH = {
      'view.label': '便签墙 + 任务板',
      'tab.wall': '便签墙',
      'tab.board': '任务板',
      'action.newNote': '新建便签',
      'action.newCard': '新建任务',
      'action.search': '搜索便签和任务',
      'action.trash': '回收站',
      'action.tidy': '整理',
      'action.newBoard': '新建看板',
      'action.deleteBoard': '删除这块看板',
      'action.export': '导出 JSON',
      'action.import': '导入 JSON',
      'action.importMerge': '导入 JSON（合并）',
      'action.importReplace': '导入 JSON（替换）',
      'action.clearTrash': '清空回收站',
      'action.selectAll': '全选',
      'action.restoreSelected': '恢复选中',
      'action.purgeSelected': '彻底删除选中',
      'action.undo': '撤销',
      'action.redo': '重做',
      'toast.undone': '已撤销',
      'toast.redone': '已重做',
      'toast.nothingUndo': '没有可撤销的操作',
      'toast.nothingRedo': '没有可重做的操作',
      'action.syncNote': '同步便签内容',
      'toast.synced': '已从便签同步',
      'action.filter': '筛选',
      'action.clearFilters': '清除筛选',
      'label.openOnly': '只看未完成',
      'label.overdueOnly': '只看逾期',
      'placeholder.labelFilter': '按标签过滤',
      'label.blocked': '阻塞',
      'placeholder.blockReason': '阻塞原因',
      'stats.priority': 'P0+P1',
      'stats.overdue': '逾期',
      'stats.blocked': '阻塞',
      'label.color': '纸色',
      'label.pinnedOnly': '只看置顶',
      'action.density': '密度',
      'density.auto': '密度 自动',
      'density.compact': '密度 紧凑',
      'density.cozy': '密度 宽松',
      'action.menu': '更多',
      'action.renameBoard': '重命名看板',
      'confirm.importReplace': '当前全部便签、任务与看板会被这份文件覆盖。',
      'confirm.purgeSelected': '所选内容会被彻底删除。',
      'confirm.purgeOne': '这条会被彻底删除。',
      'confirm.deleteBoard': '这块看板及其所有任务会被删除。',
      'confirm.removeColumn': '列里的卡片会自动移到第一列，不会丢。',
      'confirm.undoHint': '可在操作后按 Ctrl+Z 撤销；重启 DSH 后历史清空。',
      'action.clear': '清空',
      'action.replace': '替换',
      'hint.delete': '点选后用 Delete 移入回收站，Shift+Delete 彻底删除',
      'hint.renameBoard': '双击或点 ✎ 重命名看板',
      'hint.multi': '已选多张便签：Delete 删除、Ctrl/Cmd+点击增减、Esc 取消',
      'hint.multiCards': '已选多张任务：Delete 删除、Shift 同列连选、Esc 取消',
      'action.moveTo': '移到',
      'toast.trashed': '已移入回收站',
      'toast.purged': '已彻底删除',
      'toast.restored': '已恢复',
      'toast.cleared': '回收站已清空',
      'toast.imported': '已导入',
      'toast.exported': '已导出 JSON',
      'toast.tidied': '已整理便签',
      'toast.toTask': '已转为任务',
      'toast.toNote': '已转为便签',
      'label.boards': '看板',
      'status.importFailed': '导入失败：文件不是合法的 JSON',
      'status.clearTrashDone': '回收站已清空',
      'action.back': '返回',
      'action.retry': '重试',
      'action.save': '保存',
      'action.cancel': '取消',
      'action.confirm': '确定',
      'confirm.clearTrash': '回收站里的便签与任务会被彻底删除。',
      'action.preview': '预览',
      'action.edit': '编辑',
      'action.delete': '删除',
      'action.restore': '恢复',
      'action.purge': '彻底删除',
      'action.pin': '置顶',
      'action.unpin': '取消置顶',
      'action.color': '纸色',
      'action.collapse': '折叠',
      'action.expand': '展开',
      'action.toTask': '转为任务',
      'action.toNote': '转为便签',
      'action.close': '关闭',
      'action.addCard': '添加任务',
      'action.addColumn': '添加列',
      'action.removeColumn': '删除这一列',
      'action.moveColumn': '拖动这一列可以换顺序',
      'action.linkNote': '关联便签',
      'action.unlinkNote': '取消关联',
      'action.done': '完成',
      'action.undone': '未完成',
      'status.saved': '已保存',
      'status.loading': '正在加载便签墙…',
      'status.notes': '张便签',
      'status.cards': '个任务',
      'status.pinned': '置顶',
      'status.empty.wall': '墙上还没有便签。点「新建便签」开始，双击空白处也可以。',
      'status.empty.board': '任务板还是空的。点「新建任务」加第一张卡。',
      'status.empty.trash': '回收站是空的。',
      'status.searchEmpty': '没有匹配的内容。',
      'status.path': '数据文件',
      'status.selected': '已选',
      'status.offline': '连不上宿主半（改完宿主侧代码需要重启一次 Harness 窗口）',
      'placeholder.note': '写点什么…支持多行；- [ ] 开头是待办，- 开头是列表',
      'placeholder.title': '任务标题',
      'placeholder.desc': '补充描述（Markdown 纯文本）',
      'placeholder.search': '搜索标题或正文',
      'placeholder.column': '列名称',
      'col.todo': '待办',
      'col.doing': '进行中',
      'col.review': '待评审',
      'col.blocked': '阻塞',
      'col.done': '完成',
      'template.choose': '新建看板',
      'template.three': '三列（待办 / 进行中 / 完成）',
      'template.five': '五列（加 待评审 / 阻塞）',
      'template.blank': '空白（只有一列）',
      'label.priority': '优先级',
      'label.due': '截止',
      'label.labels': '标签',
      'label.checklist': '检查项',
      'label.items': '项',
      'placeholder.checklist': '添加检查项…',
      'action.add': '添加',
      'label.title': '标题',
      'label.empty': '（空）',
      'trash.notes': '便签',
      'trash.cards': '任务',
      'linked.card': '已关联任务',
      'linked.note': '已关联便签',
      'error.generic': '操作失败',
      'error.crash': '面板渲染出错（把这一行连同下面的信息截图发我）',
      'note.untitled': '未命名便签',
    };

    const EN = {
      'view.label': 'Sticky wall and task board',
      'tab.wall': 'Wall',
      'tab.board': 'Board',
      'action.newNote': 'New note',
      'action.newCard': 'New task',
      'action.search': 'Search notes and tasks',
      'action.trash': 'Trash',
      'action.tidy': 'Tidy',
      'action.newBoard': 'New board',
      'action.deleteBoard': 'Delete this board',
      'action.export': 'Export JSON',
      'action.import': 'Import JSON',
      'action.importMerge': 'Import JSON (merge)',
      'action.importReplace': 'Import JSON (replace)',
      'action.clearTrash': 'Empty trash',
      'action.selectAll': 'Select all',
      'action.restoreSelected': 'Restore selected',
      'action.purgeSelected': 'Delete selected',
      'action.undo': 'Undo',
      'action.redo': 'Redo',
      'toast.undone': 'Undone',
      'toast.redone': 'Redone',
      'toast.nothingUndo': 'Nothing to undo',
      'toast.nothingRedo': 'Nothing to redo',
      'action.syncNote': 'Sync note content',
      'toast.synced': 'Synced from the note',
      'action.filter': 'Filter',
      'action.clearFilters': 'Clear filters',
      'label.openOnly': 'Open only',
      'label.overdueOnly': 'Overdue only',
      'placeholder.labelFilter': 'Filter by label',
      'label.blocked': 'Blocked',
      'placeholder.blockReason': 'Blocked reason',
      'stats.priority': 'P0+P1',
      'stats.overdue': 'Overdue',
      'stats.blocked': 'Blocked',
      'label.color': 'Paper colour',
      'label.pinnedOnly': 'Pinned only',
      'action.density': 'Density',
      'density.auto': 'Density auto',
      'density.compact': 'Density compact',
      'density.cozy': 'Density cozy',
      'action.menu': 'More',
      'action.renameBoard': 'Rename board',
      'confirm.importReplace': 'Every note, task and board will be replaced by this file.',
      'confirm.purgeSelected': 'The selection will be deleted permanently.',
      'confirm.purgeOne': 'This entry will be deleted permanently.',
      'confirm.deleteBoard': 'This board and all of its tasks will be deleted.',
      'confirm.removeColumn': 'Its cards move to the first column, so nothing is lost.',
      'confirm.undoHint': 'Undo with Ctrl+Z after the action; the history clears when DSH restarts.',
      'action.clear': 'Clear',
      'action.replace': 'Replace',
      'hint.delete': 'Click to select, then Delete moves it to the trash; Shift+Delete erases it',
      'hint.renameBoard': 'Double-click or click ✎ to rename the board',
      'hint.multi': 'Multiple notes selected: Delete removes them, Ctrl/Cmd+click toggles, Esc clears',
      'hint.multiCards': 'Multiple tasks selected: Delete removes them, Shift extends inside a column, Esc clears',
      'action.moveTo': 'Move to',
      'toast.trashed': 'Moved to trash',
      'toast.purged': 'Deleted permanently',
      'toast.restored': 'Restored',
      'toast.cleared': 'Trash emptied',
      'toast.imported': 'Imported',
      'toast.exported': 'Exported JSON',
      'toast.tidied': 'Notes tidied',
      'toast.toTask': 'Turned into a task',
      'toast.toNote': 'Turned into a note',
      'label.boards': 'Board',
      'status.importFailed': 'Import failed: the file is not valid JSON',
      'status.clearTrashDone': 'Trash emptied',
      'action.back': 'Back',
      'action.retry': 'Retry',
      'action.save': 'Save',
      'action.cancel': 'Cancel',
      'action.confirm': 'Confirm',
      'confirm.clearTrash': 'Everything in the trash will be deleted permanently.',
      'action.preview': 'Preview',
      'action.edit': 'Edit',
      'action.delete': 'Delete',
      'action.restore': 'Restore',
      'action.purge': 'Delete forever',
      'action.pin': 'Pin',
      'action.unpin': 'Unpin',
      'action.color': 'Paper colour',
      'action.collapse': 'Collapse',
      'action.expand': 'Expand',
      'action.toTask': 'Turn into task',
      'action.toNote': 'Turn into note',
      'action.close': 'Close',
      'action.addCard': 'Add task',
      'action.addColumn': 'Add column',
      'action.removeColumn': 'Delete column',
      'action.moveColumn': 'Drag to reorder columns',
      'action.linkNote': 'Link a note',
      'action.unlinkNote': 'Unlink note',
      'action.done': 'Done',
      'action.undone': 'Open',
      'status.saved': 'Saved',
      'status.loading': 'Loading the sticky wall…',
      'status.notes': 'notes',
      'status.cards': 'tasks',
      'status.pinned': 'pinned',
      'status.empty.wall': 'The wall is empty. Press “New note”, or double-click an empty spot.',
      'status.empty.board': 'The board is empty. Press “New task” to add the first card.',
      'status.empty.trash': 'The trash is empty.',
      'status.searchEmpty': 'Nothing matches.',
      'status.path': 'Data file',
      'status.selected': 'Selected',
      'status.offline': 'The Host half is unreachable; restart the Harness window after host-side edits',
      'placeholder.note': 'Write something… multiple lines; “- [ ]” starts a todo, “-” a list item',
      'placeholder.title': 'Task title',
      'placeholder.desc': 'Description (plain Markdown)',
      'placeholder.search': 'Search titles and text',
      'placeholder.column': 'Column name',
      'col.todo': 'To do',
      'col.doing': 'In progress',
      'col.review': 'In review',
      'col.blocked': 'Blocked',
      'col.done': 'Done',
      'template.choose': 'New board',
      'template.three': 'Three columns (to do / doing / done)',
      'template.five': 'Five columns (+ review / blocked)',
      'template.blank': 'Blank (one column)',
      'label.priority': 'Priority',
      'label.due': 'Due',
      'label.labels': 'Labels',
      'label.checklist': 'Checklist',
      'label.items': 'item(s)',
      'placeholder.checklist': 'Add a checklist item…',
      'action.add': 'Add',
      'label.title': 'Title',
      'label.empty': '(empty)',
      'trash.notes': 'Notes',
      'trash.cards': 'Tasks',
      'linked.card': 'Linked task',
      'linked.note': 'Linked note',
      'error.generic': 'That did not work',
      'error.crash': 'The panel crashed while rendering (send me a screenshot of this line and the detail below)',
      'note.untitled': 'Untitled note',
    };

    const CSS = `
.sb-root{--sb-accent:#3b82f6;--sb-accent-strong:#2f6fed;--sb-success:#34a853;--sb-danger:#e05252;--sb-danger-soft:#e05252;--sb-warn:#d99b3d;--sb-warn-strong:#e08c3c;--sb-info:#5b8fd6;--sb-muted:#8a93a6;--sb-soft-blue:#60a5fa}
.sb-root[data-sb-scheme="light"]{--sb-accent:#1d4ed8;--sb-accent-strong:#1e40af;--sb-success:#157347;--sb-danger:#b42318;--sb-danger-soft:#b42318;--sb-warn:#9a6700;--sb-warn-strong:#8a5a00;--sb-info:#1d4ed8;--sb-muted:#5b6472;--sb-soft-blue:#1d4ed8}
.sb-root{display:flex;flex-direction:column;height:100%;min-height:0;position:relative;background:var(--dsw-alias-bg-base,#0f1218);color:var(--dsw-alias-label-primary,#e6edf7);font-size:12px;outline:none}
.sb-bar{flex:none;display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px;min-height:38px;padding:4px 10px;border-bottom:1px solid var(--dsw-alias-border-l2,#232a36);background:var(--dsw-alias-bg-layer-1,#151a22)}
.sb-tabs{display:flex;gap:2px;padding:2px;border-radius:7px;background:var(--dsw-alias-bg-layer-2,#1b212b)}
.sb-tab{cursor:pointer;border:0;border-radius:5px;padding:3px 12px;font:inherit;font-size:12px;background:transparent;color:var(--dsw-alias-label-secondary,#93a1bb)}
.sb-tab[data-active="true"]{background:var(--dsw-alias-bg-overlay,#242c3a);color:var(--dsw-alias-label-primary,#e6edf7)}
.sb-btn{cursor:pointer;border:1px solid var(--dsw-alias-border-l2,#232a36);background:transparent;color:var(--dsw-alias-label-secondary,#93a1bb);border-radius:6px;padding:3px 9px;font:inherit;font-size:11px;line-height:18px;white-space:nowrap}
.sb-btn:hover{background:var(--dsw-alias-bg-layer-2,#1b212b);color:var(--dsw-alias-label-primary,#e6edf7)}
.sb-btn[data-primary="true"]{border-color:var(--dsw-alias-brand-primary,#4f8cff);color:var(--dsw-alias-brand-primary,#4f8cff)}
.sb-btn[data-danger="true"]{color:var(--dsw-alias-state-error-primary,var(--sb-danger-soft));border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,var(--sb-danger-soft)) 45%,transparent)}
.sb-btn:disabled{opacity:.5;cursor:default}
.sb-ico{cursor:pointer;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#93a1bb);border-radius:4px;padding:0 4px;font:inherit;font-size:11px;line-height:20px}
.sb-ico:hover{background:var(--dsw-alias-bg-layer-2,#1b212b);color:var(--dsw-alias-label-primary,#e6edf7)}
.sb-ico[data-active="true"]{color:var(--dsw-alias-brand-primary,#4f8cff)}
.sb-search{width:150px;min-width:104px;flex:0 1 150px;border:1px solid var(--dsw-alias-border-l2,#232a36);background:var(--dsw-alias-bg-base,#0f1218);color:var(--dsw-alias-label-primary,#e6edf7);border-radius:6px;padding:3px 8px;font:inherit;font-size:11px;line-height:18px}
.sb-spacer{flex:1}
.sb-status{color:var(--dsw-alias-label-secondary,#93a1bb);white-space:nowrap;font-size:11px}
.sb-status.sb-path{min-width:0;max-width:46%;overflow:hidden;text-overflow:ellipsis}
.sb-body{flex:1;min-height:0;position:relative;overflow:auto}
.sb-wall{position:relative;min-height:100%;padding:14px;box-sizing:border-box}
.sb-wall-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary,#93a1bb);pointer-events:none;text-align:center;padding:24px}
.sb-note{position:absolute;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.28);color:#22262e;display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(0,0,0,.10)}
.sb-note[data-pinned="true"]{box-shadow:0 4px 16px rgba(0,0,0,.38)}
.sb-note-head{flex:none;display:flex;align-items:center;gap:2px;height:24px;padding:0 5px 0 7px;cursor:grab;background:rgba(255,255,255,.28);user-select:none}
.sb-note-head:active{cursor:grabbing}
.sb-note-title{flex:1;min-width:0;font-size:11px;font-weight:600;opacity:.75;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sb-note-body{flex:1;min-height:0;padding:2px 9px 8px;overflow:auto;line-height:1.55;font-size:12px}
.sb-note-body textarea{width:100%;box-sizing:border-box;min-height:86px;resize:vertical;border:0;background:rgba(255,255,255,.55);border-radius:5px;padding:5px 6px;font:inherit;font-size:12px;line-height:1.55;color:#22262e;outline:none}
.sb-line{margin:1px 0;white-space:pre-wrap;word-break:break-word}
.sb-line[data-kind="ul"]{padding-left:14px;position:relative}
.sb-line[data-kind="ul"]:before{content:"•";position:absolute;left:4px;opacity:.6}
.sb-line[data-kind="ol"]{padding-left:18px;position:relative;counter-increment:sb-ol}
.sb-line[data-kind="ol"]:before{content:counter(sb-ol) ".";position:absolute;left:3px;opacity:.6}
.sb-todo{display:flex;align-items:flex-start;gap:5px;margin:1px 0;cursor:pointer}
.sb-todo input{margin:2px 0 0;accent-color:#3f7f5a}
.sb-todo span{flex:1;white-space:pre-wrap;word-break:break-word}
.sb-todo[data-done="true"] span{text-decoration:line-through;opacity:.55}
.sb-resize{position:absolute;right:0;bottom:0;width:12px;height:12px;cursor:nwse-resize;background:linear-gradient(135deg,transparent 50%,rgba(0,0,0,.22) 50%)}
.sb-palette{position:absolute;z-index:60;display:flex;gap:4px;padding:5px;border-radius:7px;background:var(--dsw-alias-bg-overlay,#242c3a);border:1px solid var(--dsw-alias-border-l2,#232a36);box-shadow:0 6px 18px rgba(0,0,0,.4)}
.sb-dot{width:15px;height:15px;border-radius:50%;border:1px solid rgba(0,0,0,.18);cursor:pointer}
.sb-dot[data-active="true"]{outline:2px solid var(--dsw-alias-brand-primary,#4f8cff);outline-offset:1px}
.sb-board{display:flex;gap:10px;height:100%;padding:12px;box-sizing:border-box;overflow-x:auto;align-items:flex-start}
.sb-col{flex:none;width:min(250px,78vw);max-height:100%;display:flex;flex-direction:column;border-radius:9px;background:var(--dsw-alias-bg-layer-1,#151a22);border:1px solid var(--dsw-alias-border-l2,#232a36);min-height:120px}
.sb-col-head{flex:none;display:flex;align-items:center;gap:5px;padding:7px 8px;border-bottom:1px solid var(--dsw-alias-border-l2,#232a36)}
.sb-col-title{flex:1;min-width:0;font-weight:600;font-size:12px;background:transparent;border:0;color:var(--dsw-alias-label-primary,#e6edf7);font-family:inherit;padding:1px 3px;border-radius:4px}
.sb-col-title:focus{outline:1px solid var(--dsw-alias-brand-primary,#4f8cff);background:var(--dsw-alias-bg-base,#0f1218)}
.sb-col-count{color:var(--dsw-alias-label-secondary,#93a1bb);font-size:11px}
.sb-col-body{flex:1;min-height:36px;overflow-y:auto;padding:6px;display:flex;flex-direction:column;gap:6px}
.sb-col-body[data-over="true"]{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4f8cff) 8%,transparent);border-radius:7px}
.sb-card{border-radius:7px;background:var(--dsw-alias-bg-layer-2,#1b212b);border:1px solid var(--dsw-alias-border-l2,#232a36);padding:6px 8px 6px 7px;cursor:grab;display:flex;gap:6px;align-items:flex-start}
.sb-card:hover{border-color:var(--dsw-alias-border-l1,#333d4d)}
.sb-card[data-dragging="true"]{opacity:.45}
.sb-card[data-over="true"]{position:relative}
.sb-card[data-over="true"]::before{content:"";position:absolute;left:-2px;right:-2px;top:-4px;height:2px;border-radius:2px;background:var(--sb-accent);box-shadow:0 0 6px rgba(59,130,246,.75);pointer-events:none}
.sb-drop-line{height:2px;border-radius:2px;background:var(--sb-accent);box-shadow:0 0 6px rgba(59,130,246,.7);margin:2px 0 6px;flex:none}
.sb-bar-pri{flex:none;width:3px;border-radius:2px;align-self:stretch;min-height:18px}
.sb-card-main{flex:1;min-width:0}
.sb-card-title{font-size:12px;line-height:1.45;word-break:break-word}
.sb-card-meta{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
.sb-chip{font-size:10px;line-height:15px;padding:0 5px;border-radius:4px;background:var(--dsw-alias-bg-base,#0f1218);color:var(--dsw-alias-label-secondary,#93a1bb);border:1px solid var(--dsw-alias-border-l2,#232a36);white-space:nowrap}
.sb-chip[data-kind="danger"]{color:var(--sb-danger);border-color:color-mix(in srgb,var(--sb-danger) 55%,transparent);background:color-mix(in srgb,var(--sb-danger) 14%,transparent);font-weight:600}
.sb-stats{flex:none;display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:6px 12px 0}
.sb-stat{cursor:pointer;border:1px solid var(--dsw-alias-border-l2,#232a36);background:transparent;border-radius:6px;padding:1px 8px;font:inherit;font-family:inherit;font-size:11px;color:var(--dsw-alias-label-secondary,#93a1bb)}
.sb-stat:hover{color:var(--dsw-alias-label-primary,#e6edf7)}
.sb-stat[data-on="true"]{border-color:var(--sb-accent);color:var(--sb-accent);background:color-mix(in srgb,var(--sb-accent) 14%,transparent)}
.sb-swatch{width:18px;height:18px;border-radius:4px;border:1px solid rgba(0,0,0,.25);cursor:pointer;padding:0}
.sb-swatch[data-on="true"]{outline:2px solid var(--sb-accent);outline-offset:1px}
.sb-root[data-sb-density="compact"] .sb-note-body{font-size:11px;line-height:1.4;padding:1px 7px 6px}
.sb-root[data-sb-density="cozy"] .sb-note-body{font-size:13px;line-height:1.7;padding:4px 12px 10px}
.sb-chip[data-kind="warn"]{color:var(--dsw-alias-state-warn-primary,var(--sb-warn));border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,var(--sb-warn)) 40%,transparent)}
.sb-chip[data-kind="brand"]{color:var(--dsw-alias-brand-primary,#4f8cff);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#4f8cff) 40%,transparent)}
.sb-check{flex:none;margin:2px 0 0;accent-color:var(--dsw-alias-state-success-primary,#3f9f6f)}
.sb-col-add{cursor:pointer;border:1px dashed var(--dsw-alias-border-l2,#232a36);background:transparent;color:var(--dsw-alias-label-secondary,#93a1bb);border-radius:6px;padding:4px;font:inherit;font-size:11px;width:100%;margin-top:2px}
.sb-col-add:hover{color:var(--dsw-alias-label-primary,#e6edf7);border-color:var(--dsw-alias-border-l1,#333d4d)}
.sb-drawer{position:absolute;top:0;right:0;bottom:0;width:min(330px,92%);z-index:50;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1,#151a22);border-left:1px solid var(--dsw-alias-border-l2,#232a36);box-shadow:-8px 0 24px rgba(0,0,0,.28)}
.sb-drawer-head{flex:none;display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l2,#232a36);font-weight:600}
.sb-drawer-body{flex:1;min-height:0;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:9px}
.sb-field{display:flex;flex-direction:column;gap:3px}
.sb-field-row{display:flex;align-items:center;justify-content:space-between;gap:6px}
.sb-mini{cursor:pointer;border:0;background:transparent;color:var(--sb-accent);font:inherit;font-family:inherit;font-size:11px;padding:1px 5px;border-radius:4px}
.sb-mini:hover{background:var(--dsw-alias-bg-layer-2,#1b212b)}
.sb-saved{font-size:10px;font-weight:400;color:var(--dsw-alias-label-secondary,#93a1bb);white-space:nowrap}
.sb-md{min-height:110px;max-height:320px;overflow:auto;border:1px solid var(--dsw-alias-border-l2,#232a36);background:var(--dsw-alias-bg-base,#0f1218);border-radius:6px;padding:6px 8px;line-height:1.6;cursor:text;font-size:12px}
.sb-md-p{margin:0 0 4px;white-space:pre-wrap;word-break:break-word}
.sb-md-p:last-child{margin-bottom:0}
.sb-md-gap{height:6px}
.sb-md-h{font-weight:600;margin:2px 0 4px}
.sb-md-list{margin:2px 0 4px;padding-left:16px}
.sb-md-code{background:var(--dsw-alias-bg-layer-2,#1b212b);border-radius:3px;padding:0 3px;font-family:ui-monospace,Consolas,monospace;font-size:11px}
.sb-md a{color:var(--sb-accent);text-decoration:none}
.sb-md a:hover{text-decoration:underline}
.sb-field-label{font-size:11px;color:var(--dsw-alias-label-secondary,#93a1bb)}
.sb-input,.sb-textarea,.sb-select{width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,#232a36);background:var(--dsw-alias-bg-base,#0f1218);color:var(--dsw-alias-label-primary,#e6edf7);border-radius:6px;padding:4px 7px;font:inherit;font-size:12px}
.sb-textarea{min-height:110px;resize:vertical;line-height:1.55}
.sb-input:focus,.sb-textarea:focus,.sb-select:focus{outline:1px solid var(--dsw-alias-brand-primary,#4f8cff)}
.sb-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.sb-drawer-actions{display:flex;gap:6px;margin-top:auto;padding-top:4px}
.sb-act{flex:1;min-width:0;cursor:pointer;background:transparent;border:1px solid var(--dsw-alias-border-l2,#232a36);border-radius:7px;padding:6px 4px;font:inherit;font-family:inherit;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-secondary,#93a1bb);transition:background .12s ease,color .12s ease,border-color .12s ease}
.sb-act:hover{background:var(--dsw-alias-bg-layer-2,#1b212b);color:var(--dsw-alias-label-primary,#e6edf7)}
.sb-act[data-kind="primary"]{border-color:color-mix(in srgb,var(--sb-accent) 55%,transparent);color:var(--sb-accent)}
.sb-act[data-kind="primary"]:hover{background:color-mix(in srgb,var(--sb-accent) 14%,transparent);color:var(--sb-accent)}
.sb-act[data-kind="success"]{border-color:color-mix(in srgb,var(--sb-success) 55%,transparent);color:var(--sb-success)}
.sb-act[data-kind="success"]:hover{background:color-mix(in srgb,var(--sb-success) 14%,transparent);color:var(--sb-success)}
.sb-act[data-kind="success"][data-on="true"]{background:color-mix(in srgb,var(--sb-success) 18%,transparent);border-color:var(--sb-success);font-weight:600}
.sb-act[data-kind="danger"]{border-color:color-mix(in srgb,var(--sb-danger) 55%,transparent);color:var(--sb-danger)}
.sb-act[data-kind="danger"]:hover{background:color-mix(in srgb,var(--sb-danger) 14%,transparent);color:var(--sb-danger)}
.sb-trash{display:flex;flex-direction:column;gap:6px;padding:12px;max-width:640px;margin:0 auto}
.sb-trash-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:2px 0 8px;border-bottom:1px solid var(--dsw-alias-border-l2,#232a36)}
.sb-trash-checkall{display:flex;align-items:center;gap:5px;cursor:pointer;color:var(--dsw-alias-label-secondary,#93a1bb);font-size:11px;white-space:nowrap}
.sb-trash-row{display:flex;align-items:center;gap:8px;padding:6px 9px;border-radius:7px;background:var(--dsw-alias-bg-layer-1,#151a22);border:1px solid var(--dsw-alias-border-l2,#232a36)}
.sb-trash-row .sb-check{flex:none;margin:0}
.sb-trash-row span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sb-section{font-size:11px;color:var(--dsw-alias-label-secondary,#93a1bb);margin:6px 0 2px}
.sb-mask{position:fixed;inset:0;background:rgba(4,8,16,.55);display:flex;align-items:center;justify-content:center;z-index:120;padding:16px}
.sb-modal{min-width:272px;max-width:360px;background:var(--dsw-alias-bg-layer-1,#151a22);border:1px solid var(--dsw-alias-border-l2,#232a36);border-radius:10px;box-shadow:0 18px 48px rgba(0,0,0,.45);padding:14px 16px 12px;display:flex;flex-direction:column;gap:10px;outline:none}
.sb-modal-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#e6edf7)}
.sb-modal-subject{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary,#e6edf7);word-break:break-word}
.sb-modal-text{font-size:12px;line-height:1.55;color:var(--dsw-alias-label-secondary,#93a1bb);word-break:break-word}
.sb-modal-hint{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary,#93a1bb);opacity:.85;border-top:1px dashed var(--dsw-alias-border-l2,#232a36);padding-top:6px}
.sb-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:2px}
.sb-error{flex:none;display:flex;align-items:center;gap:8px;padding:4px 10px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary,var(--sb-danger-soft)) 14%,transparent);color:var(--dsw-alias-state-error-primary,var(--sb-danger-soft));font-size:11px}
.sb-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;height:100%;color:var(--dsw-alias-label-secondary,#93a1bb);text-align:center;padding:30px}
.sb-toast{position:absolute;left:50%;bottom:38px;transform:translateX(-50%);z-index:130;display:flex;align-items:center;gap:10px;max-width:min(560px,92%);padding:7px 12px;border-radius:8px;background:var(--dsw-alias-bg-overlay,#242c3a);border:1px solid var(--dsw-alias-border-l1,#333d4d);box-shadow:0 8px 22px rgba(0,0,0,.45);font-size:12px}
.sb-toast-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sb-toast-action{cursor:pointer;border:0;background:transparent;color:var(--sb-accent);font:inherit;font-size:12px;padding:2px 5px;border-radius:4px;white-space:nowrap}
.sb-toast-action:hover{background:var(--dsw-alias-bg-layer-2,#1b212b)}
.sb-toast-close{cursor:pointer;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#93a1bb);font:inherit;font-size:11px;padding:0 3px}
.sb-toast-close:hover{color:var(--dsw-alias-label-primary,#e6edf7)}
.sb-menu-wrap{position:relative;z-index:90}
.sb-menu{position:absolute;right:0;top:26px;z-index:95;min-width:158px;display:flex;flex-direction:column;padding:4px;border-radius:7px;background:var(--dsw-alias-bg-overlay,#242c3a);border:1px solid var(--dsw-alias-border-l2,#232a36);box-shadow:0 8px 22px rgba(0,0,0,.42)}
.sb-menu-item{cursor:pointer;border:0;background:transparent;color:var(--dsw-alias-label-primary,#e6edf7);text-align:left;border-radius:5px;padding:5px 9px;font:inherit;font-size:11px;white-space:nowrap}
.sb-menu-item:hover{background:var(--dsw-alias-bg-layer-2,#1b212b)}
.sb-menu-item:disabled{opacity:.45;cursor:default}
.sb-filter{min-width:210px;padding:8px;gap:8px}
.sb-filter-title{font-size:11px;color:var(--dsw-alias-label-secondary,#93a1bb)}
.sb-filter-row{display:flex;gap:4px;flex-wrap:wrap}
.sb-pill{cursor:pointer;border:1px solid var(--dsw-alias-border-l2,#232a36);background:transparent;color:var(--dsw-alias-label-secondary,#93a1bb);border-radius:5px;padding:1px 7px;font:inherit;font-family:inherit;font-size:11px;line-height:18px}
.sb-pill[data-on="true"]{border-color:var(--pill,var(--sb-accent));color:var(--pill,var(--sb-accent));background:color-mix(in srgb,var(--pill,var(--sb-accent)) 16%,transparent)}
.sb-filter-check{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-primary,#e6edf7);cursor:pointer}
.sb-filter-check .sb-check{margin:0}
.sb-checklist{display:flex;flex-direction:column;gap:4px}
.sb-check-row{display:flex;align-items:center;gap:6px}
.sb-check-row .sb-check{flex:none;margin:0}
.sb-check-text{flex:1;min-width:0;border:1px solid transparent;background:transparent;border-radius:5px;padding:2px 4px;font:inherit;font-family:inherit;font-size:12px;color:var(--dsw-alias-label-primary,#e6edf7)}
.sb-check-text:hover{border-color:var(--dsw-alias-border-l2,#232a36)}
.sb-check-text:focus{outline:none;border-color:var(--dsw-alias-border-l2,#232a36);background:var(--dsw-alias-bg-base,#0f1218)}
.sb-check-add{display:flex;gap:5px;align-items:center;margin-top:2px}
.sb-selbar{display:flex;align-items:center;gap:6px;padding:2px 7px 2px 8px;border-radius:7px;background:color-mix(in srgb,var(--sb-accent) 13%,transparent);border:1px solid color-mix(in srgb,var(--sb-accent) 38%,transparent)}
.sb-selcount{font-size:11px;color:var(--sb-soft-blue);white-space:nowrap}
.sb-pri-row{display:flex;gap:4px}
.sb-pri{cursor:pointer;flex:1;border:1px solid var(--dsw-alias-border-l2,#232a36);background:transparent;color:var(--dsw-alias-label-secondary,#93a1bb);border-radius:6px;padding:3px 0;font:inherit;font-size:11px;font-family:inherit}
.sb-pri:hover{color:var(--dsw-alias-label-primary,#e6edf7)}
.sb-pri[data-active="true"]{border-color:var(--pri,var(--sb-accent));color:var(--pri,var(--sb-accent));background:color-mix(in srgb,var(--pri,var(--sb-accent)) 14%,transparent);font-weight:600}
.sb-boardwrap{height:100%;min-height:0;display:flex;flex-direction:column}
.sb-boardtabs{flex:none;display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:8px 12px 0;row-gap:4px;overflow:visible}
.sb-boardtabs .sb-menu-wrap{display:flex;align-items:center}
.sb-boardtab{display:flex;align-items:center;gap:6px;padding:3px 10px;border-radius:7px 7px 0 0;border:1px solid transparent;border-bottom:0;color:var(--dsw-alias-label-secondary,#93a1bb);cursor:pointer;white-space:nowrap;font-size:12px;background:transparent;font-family:inherit}
.sb-boardtab[data-active="true"]{background:var(--dsw-alias-bg-layer-1,#151a22);border-color:var(--dsw-alias-border-l2,#232a36);color:var(--dsw-alias-label-primary,#e6edf7)}
.sb-boardtab[data-over="true"]{outline:2px dashed var(--dsw-alias-brand-primary,#4f8cff);outline-offset:-2px}
.sb-boardtab[data-dragging="true"]{opacity:.45}
.sb-boardtab-count{font-size:10px;opacity:.72}
.sb-boardtab-edit{cursor:pointer;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#93a1bb);font:inherit;font-family:inherit;font-size:11px;line-height:1;padding:0 2px;border-radius:4px}
.sb-boardtab-edit:hover{color:var(--dsw-alias-label-primary,#e6edf7);background:var(--dsw-alias-bg-layer-2,#1b212b)}
.sb-boardtab-input{width:120px;border:1px solid var(--sb-accent);border-radius:5px;background:var(--dsw-alias-bg-base,#0f1218);color:var(--dsw-alias-label-primary,#e6edf7);font:inherit;font-family:inherit;font-size:12px;padding:1px 5px}
.sb-boardtab-add{border:1px dashed var(--dsw-alias-border-l2,#232a36);border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary,#93a1bb);cursor:pointer;font:inherit;font-size:11px;padding:2px 8px;line-height:16px}
.sb-boardtab-add:hover{color:var(--dsw-alias-label-primary,#e6edf7)}
.sb-boardtab-close{border:0;background:transparent;color:var(--dsw-alias-label-secondary,#93a1bb);cursor:pointer;font:inherit;font-size:11px;line-height:1;padding:0 3px;border-radius:4px;opacity:.65}
.sb-boardtab-close:hover{color:var(--sb-danger);background:color-mix(in srgb,var(--sb-danger) 16%,transparent);opacity:1}
.sb-boardwrap .sb-board{flex:1;min-height:0;height:auto}
.sb-col-grip{flex:none;cursor:grab;color:var(--dsw-alias-label-secondary,#93a1bb);font-size:12px;line-height:1;padding:0 1px;user-select:none}
.sb-col-grip:active{cursor:grabbing}
.sb-note[data-selected="true"]{outline:2px solid var(--sb-accent-strong);outline-offset:2px;box-shadow:0 0 0 4px rgba(47,111,237,.22),0 2px 10px rgba(0,0,0,.28)}
.sb-card[data-selected="true"]{box-shadow:0 0 0 2px var(--sb-accent-strong),0 0 0 4px rgba(47,111,237,.18)}
@keyframes sb-flash{0%{box-shadow:0 0 0 2px rgba(90,150,255,0)}25%{box-shadow:0 0 0 3px #5a96ff,0 0 0 10px rgba(90,150,255,.38)}55%{box-shadow:0 0 0 2px #5a96ff,0 0 0 6px rgba(90,150,255,.24)}100%{box-shadow:0 0 0 2px rgba(90,150,255,0)}}
.sb-card[data-flash="true"]{animation:sb-flash 1s ease-out 1}
.sb-note[data-flash="true"]{animation:sb-flash 1s ease-out 1}
.sb-col-head[data-over="true"]{outline:2px dashed var(--dsw-alias-brand-primary,#4f8cff);outline-offset:-2px}
`;

    /** Inject the panel stylesheet once per page. */
    /** Marker attribute for the panel stylesheet. */
    const CSS_MARKER = 'sticky-board/panel.css';

    /**
     * Inject the panel stylesheet, or refresh it when it is already there.
     *
     * The old implementation returned early whenever the tag existed, so a
     * hot-reloaded Client half kept the previous stylesheet: new markup (the
     * selection bar, the self-drawn popovers) rendered unstyled and wrapped
     * into stray rows. Always replacing the text keeps JS and CSS in step.
     */
    function ensureCss() {
      let style = document.querySelector(`style[data-plugin-css="${CSS_MARKER}"]`);
      if (style === null) {
        style = document.createElement('style');
        style.setAttribute('data-plugin-css', CSS_MARKER);
        document.head.appendChild(style);
      }
      if (style.textContent !== CSS) style.textContent = CSS;
    }

    /** Sidebar icon; follows `currentColor` and the host's size. */
    function SidebarIcon(props) {
      const size = props?.size ?? 16;
      const active = props?.active === true;
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          'aria-hidden': 'true',
          style: { opacity: active ? 1 : 0.82 },
        },
        h('rect', { x: 1.6, y: 2.4, width: 12.8, height: 11.2, rx: 2, stroke: 'currentColor', strokeWidth: 1.1 }),
        h('rect', { x: 3.2, y: 4, width: 3.2, height: 3, rx: 0.6, fill: 'currentColor', opacity: 0.85 }),
        h('rect', { x: 7.6, y: 4, width: 3.2, height: 2, rx: 0.6, fill: 'currentColor', opacity: 0.45 }),
        h('rect', { x: 3.2, y: 8.6, width: 3.2, height: 1.6, rx: 0.6, fill: 'currentColor', opacity: 0.45 }),
        h('path', { d: 'M7.9 9.9l1.5 1.5 2.9-2.9', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      );
    }

    // ------------------------------------------------------------------
    // Pure helpers
    // ------------------------------------------------------------------

    /** Render note lines into the plain text the editor shows. */
    function linesToText(note) {
      const lines = Array.isArray(note?.lines) ? note.lines : [];
      return lines
        .map((line) => {
          if (line.kind === 'todo') return `${line.done === true ? '- [x] ' : '- [ ] '}${line.text}`;
          if (line.kind === 'ul') return `- ${line.text}`;
          if (line.kind === 'ol') return `1. ${line.text}`;
          return line.text;
        })
        .join('\n');
    }

    /** Parse the editor string back into note lines, Markdown-ish. */
    function textToLines(text) {
      const raw = typeof text === 'string' ? text.split(/\r?\n/) : [''];
      const lines = raw.map((line) => {
        const todo = /^\s*-\s*\[( |x|X)\]\s?(.*)$/.exec(line);
        if (todo !== null) return { kind: 'todo', text: todo[2], done: todo[1].toLowerCase() === 'x' };
        const ul = /^\s*[-*]\s+(.*)$/.exec(line);
        if (ul !== null) return { kind: 'ul', text: ul[1] };
        const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
        if (ol !== null) return { kind: 'ol', text: ol[1] };
        return { kind: 'text', text: line };
      });
      return lines.length === 0 ? [{ kind: 'text', text: '' }] : lines;
    }

    /** A short human title for a note. */
    function titleOf(note) {
      const lines = Array.isArray(note?.lines) ? note.lines : [];
      for (const line of lines) {
        const text = String(line?.text ?? '').trim();
        if (text !== '') return text.length > 60 ? `${text.slice(0, 60)}…` : text;
      }
      return '';
    }

    /** Format a timestamp as HH:MM:SS. */
    function clock(at) {
      if (typeof at !== 'number' || at <= 0) return '';
      const date = new Date(at);
      const pad = (value) => String(value).padStart(2, '0');
      return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }

    /** Today as YYYY-MM-DD. */
    function today() {
      const date = new Date();
      const pad = (value) => String(value).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    /** Whether a due date is in the past. */
    function isOverdue(dueDate) {
      return typeof dueDate === 'string' && dueDate !== '' && dueDate < today();
    }

    /** Whether a due date is today. */
    function isToday(dueDate) {
      return dueDate === today();
    }

    /** Minimal inline Markdown → React nodes (bold, italic, code, links). */
    function renderInline(text, keyPrefix) {
      const nodes = [];
      const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*]+\*)/g;
      let last = 0;
      let match;
      let index = 0;
      while ((match = pattern.exec(text)) !== null) {
        if (match.index > last) nodes.push(text.slice(last, match.index));
        const token = match[0];
        const key = `${keyPrefix}-${index}`;
        index += 1;
        if (token.startsWith('**')) nodes.push(h('strong', { key }, token.slice(2, -2)));
        else if (token.startsWith('`')) nodes.push(h('code', { className: 'sb-md-code', key }, token.slice(1, -1)));
        else if (token.startsWith('[')) {
          const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
          nodes.push(link === null ? token : h('a', { key, href: link[2], target: '_blank', rel: 'noreferrer' }, link[1]));
        } else nodes.push(h('em', { key }, token.slice(1, -1)));
        last = match.index + token.length;
      }
      if (last < text.length) nodes.push(text.slice(last));
      return nodes;
    }

    /** Render the small Markdown subset used by note descriptions. */
    function renderMarkdown(text) {
      const lines = String(text ?? '').split(/\r?\n/);
      const blocks = [];
      let bullets = [];
      const flush = (key) => {
        if (bullets.length === 0) return;
        blocks.push(h('ul', { key: `ul-${key}`, className: 'sb-md-list' }, bullets));
        bullets = [];
      };
      lines.forEach((line, index) => {
        const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
        if (bullet !== null) {
          bullets.push(h('li', { key: `li-${index}` }, renderInline(bullet[1], `li-${index}`)));
          return;
        }
        flush(index);
        if (line.trim() === '') {
          blocks.push(h('div', { key: `gap-${index}`, className: 'sb-md-gap' }));
          return;
        }
        const heading = /^(#{1,3})\s+(.*)$/.exec(line);
        if (heading !== null) {
          blocks.push(h('div', { key: `h-${index}`, className: 'sb-md-h' }, renderInline(heading[2], `h-${index}`)));
          return;
        }
        blocks.push(h('div', { key: `p-${index}`, className: 'sb-md-p' }, renderInline(line, `p-${index}`)));
      });
      flush('end');
      if (blocks.length === 0) blocks.push(h('div', { key: 'empty', className: 'sb-md-p', style: { opacity: 0.45 } }, '—'));
      return blocks;
    }

    /**
     * Build the panel component tree. `t` is bound once to this plugin's locale
     * namespace; defining the components here keeps them stable across renders.
     */
    /** Optional Host theme service (absent in tests or older hosts). */
    function themeServiceOf(themeCtx) {
      try {
        if (typeof themeCtx?.get === 'function') {
          const service = themeCtx.get('theme');
          if (service !== undefined && service !== null) return service;
        }
        if (themeCtx?.theme !== undefined && themeCtx?.theme !== null) return themeCtx.theme;
      } catch {
        // treat the service as absent
      }
      return null;
    }

    /** Current Host colour scheme; the decorative palette switches on it. */
    function readScheme(themeCtx) {
      const service = themeServiceOf(themeCtx);
      try {
        const scheme = service?.getTheme?.()?.active?.colorScheme;
        if (scheme === 'light' || scheme === 'dark') return scheme;
      } catch {
        // fall through to the media query
      }
      try {
        if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)').matches) {
          return 'light';
        }
      } catch {
        // fall through to dark
      }
      return 'dark';
    }

    function createApp(t, themeCtx) {
      /** A button with the shared class and optional primary/danger look. */
      function Btn({ children, onClick, primary, danger, disabled, title }) {
        return h(
          'button',
          {
            type: 'button',
            className: 'sb-btn',
            'data-primary': primary === true ? 'true' : undefined,
            'data-danger': danger === true ? 'true' : undefined,
            disabled,
            title,
            onClick,
          },
          children,
        );
      }

      /** One small icon-ish button. */
      function Ico({ children, onClick, title, active }) {
        return h(
          'button',
          {
            type: 'button',
            className: 'sb-ico',
            title,
            'aria-label': title,
            'data-active': active === true ? 'true' : undefined,
            // The note header starts a drag on pointerdown; a header button
            // must not turn its click into a drag.
            onPointerDown: (event) => event.stopPropagation(),
            onClick: (event) => {
              event.stopPropagation();
              onClick?.(event);
            },
          },
          children,
        );
      }

      /** Paper colour popover. */
      function Palette({ current, onPick, onClose }) {
        return h(
          'div',
          {
            className: 'sb-palette',
            style: { right: 0, top: 22 },
            onPointerDown: (event) => event.stopPropagation(),
          },
          COLOR_ORDER.map((color) =>
            h('span', {
              key: color,
              className: 'sb-dot',
              title: color,
              'data-active': color === current ? 'true' : undefined,
              style: { background: PAPERS[color] },
              onClick: () => {
                onPick(color);
                onClose();
              },
            }),
          ),
        );
      }

      /** One note on the wall. */
      function NoteCard({ note, wallRef, call, editing, setEditing, onConvert, dragDisabled, selected, flashing, onSelect, onJump }) {
        const [draft, setDraft] = useState(() => linesToText(note));
        const [palette, setPalette] = useState(false);
        const [local, setLocal] = useState(null);
        const [pending, setPending] = useState(null);
        const [pendingSize, setPendingSize] = useState(null);
        const localRef = useRef(null);
        const rootElRef = useRef(null);
        const [resizing, setResizing] = useState(false);

        useEffect(() => {
          setDraft(linesToText(note));
        }, [note.id, note.rev]);

        // Drop the optimistic position once the Host echoed the same coordinates.
        useEffect(() => {
          if (pending !== null && note.x === pending.x && note.y === pending.y) setPending(null);
        }, [note.x, note.y, pending]);

        // Same for a resize: hold the preview until the snapshot echoes it back.
        useEffect(() => {
          if (pendingSize === null) return;
          if (note.w === pendingSize.w && (note.h ?? null) === pendingSize.h) setPendingSize(null);
        }, [note.w, note.h, pendingSize]);

        // A 🔗 jump scrolls the target into view before flashing it.
        useEffect(() => {
          if (flashing !== true) return;
          rootElRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        }, [flashing]);

        const position = pending ?? { x: note.x, y: note.y };
        const width = pendingSize?.w ?? local?.w ?? note.w;
        const height = pendingSize !== null ? pendingSize.h : local?.h !== undefined ? local.h : (note.h ?? null);

        /** Commit a resized size to the Host and hold the preview until it echoes. */
        function commitResize(next) {
          setLocal(null);
          localRef.current = null;
          setPendingSize({ w: next.w, h: next.h });
          void call('note.update', { id: note.id, patch: { x: next.x, y: next.y, w: next.w, h: next.h } });
        }

        /**
         * Drag the note by its header.
         *
         * Movement is applied straight to the element's `transform` (no React
         * state per frame): a state update per pointermove re-rendered the whole
         * note and made it flicker / leave a ghost. The final position is
         * committed once on pointerup and previewed with `pending` until the
         * snapshot echoes it back.
         */
        function startDrag(event) {
          if (dragDisabled === true) return;
          if (event.button !== 0) return;
          const wall = wallRef.current;
          const el = rootElRef.current;
          if (wall === null || el === null) return;
          event.preventDefault();
          event.stopPropagation();
          const rect = wall.getBoundingClientRect();
          const startX = event.clientX;
          const startY = event.clientY;
          const origin = { x: note.x, y: note.y };
          let dx = 0;
          let dy = 0;
          const previousZ = el.style.zIndex;
          const move = (moveEvent) => {
            dx = moveEvent.clientX - startX;
            dy = moveEvent.clientY - startY;
            el.style.zIndex = '80';
            el.style.willChange = 'transform';
            el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
          };
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            el.style.transform = '';
            el.style.willChange = '';
            el.style.zIndex = previousZ;
            if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
            const nextX = Math.min(0.94, Math.max(0, origin.x + dx / Math.max(1, rect.width)));
            const nextY = Math.min(0.94, Math.max(0, origin.y + dy / Math.max(1, rect.height)));
            setPending({ x: nextX, y: nextY });
            void call('note.update', { id: note.id, patch: { x: nextX, y: nextY, w: note.w } });
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
          window.addEventListener('pointercancel', up);
        }

        /** Resize the note from its bottom-right corner (both width and height). */
        function startResize(event) {
          event.preventDefault();
          event.stopPropagation();
          const el = rootElRef.current;
          const startX = event.clientX;
          const startY = event.clientY;
          const origin = {
            x: note.x,
            y: note.y,
            w: note.w,
            // 高度自适应时用当前渲染高度作为起点，第一次拖动把它固定下来。
            h: note.h ?? (el !== null ? el.offsetHeight : 160),
          };
          setResizing(true);
          const move = (moveEvent) => {
            const next = {
              ...origin,
              w: Math.round(Math.min(520, Math.max(180, origin.w + (moveEvent.clientX - startX)))),
              h: Math.round(Math.min(900, Math.max(80, origin.h + (moveEvent.clientY - startY)))),
            };
            localRef.current = next;
            setLocal(next);
          };
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            setResizing(false);
            const final = localRef.current ?? origin;
            if (final.w !== origin.w || final.h !== origin.h) commitResize(final);
            else setLocal(null);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
          window.addEventListener('pointercancel', up);
        }

        /** Save the editor body. */
        function saveDraft() {
          const next = textToLines(draft);
          const previous = linesToText(note);
          setEditing(null);
          if (draft === previous) return;
          void call('note.update', { id: note.id, patch: { lines: next } });
        }

        /** Toggle one todo line. */
        function toggleLine(index) {
          const lines = (note.lines ?? []).map((line, position) =>
            position === index ? { ...line, done: line.done !== true } : line,
          );
          void call('note.update', { id: note.id, patch: { lines } });
        }

        const isEditing = editing === note.id;
        const paper = PAPERS[note.color] ?? PAPERS.amber;
        const lines = Array.isArray(note.lines) ? note.lines : [];
        let olIndex = 0;

        return h(
          'div',
          {
            className: 'sb-note',
            ref: rootElRef,
            'data-pinned': note.pinned === true ? 'true' : undefined,
            'data-selected': selected === true ? 'true' : undefined,
            'data-flash': flashing === true ? 'true' : undefined,
            'data-note-id': note.id,
            onClick: (event) => onSelect?.(note.id, event),
            style: {
              left: `${position.x * 100}%`,
              top: `${position.y * 100}%`,
              width: `${width}px`,
              // 拖过右下角后是固定高度；没拖过则跟随内容（minHeight 兜底）。
              height: note.collapsed === true ? undefined : height === null ? undefined : `${height}px`,
              minHeight: note.collapsed === true ? undefined : height === null ? '96px' : `${height}px`,
              background: paper,
              zIndex: note.pinned === true ? 30 : 2,
            },
          },
          h(
            'div',
            { className: 'sb-note-head', onPointerDown: startDrag, title: t('action.expand') },
            h('span', { className: 'sb-note-title' }, titleOf(note) || t('note.untitled')),
            note.pinned === true ? h('span', { className: 'sb-chip', style: { background: 'rgba(255,255,255,.5)', border: 0, color: '#5a4a12' } }, '★') : null,
            h(Ico, { title: note.pinned === true ? t('action.unpin') : t('action.pin'), onClick: () => void call('note.update', { id: note.id, patch: { pinned: note.pinned !== true } }) }, note.pinned === true ? '★' : '☆'),
            h(Ico, { title: t('action.color'), onClick: () => setPalette((open) => !open) }, '●●'),
            h(Ico, { title: t('action.toTask'), onClick: () => onConvert(note) }, '→'),
            note.linkedCardId !== null && note.linkedCardId !== undefined
              ? h(Ico, { title: t('linked.card'), onClick: () => onJump?.('card', note.linkedCardId) }, '🔗')
              : null,
            h(Ico, {
              title: note.collapsed === true ? t('action.expand') : t('action.collapse'),
              onClick: () => void call('note.update', { id: note.id, patch: { collapsed: note.collapsed !== true } }),
            }, note.collapsed === true ? '▸' : '▾'),
            h(Ico, { title: t('action.delete'), onClick: () => void call('note.remove', { id: note.id }) }, '✕'),
            palette
              ? h(Palette, {
                  current: note.color,
                  onPick: (color) => void call('note.update', { id: note.id, patch: { color } }),
                  onClose: () => setPalette(false),
                })
              : null,
          ),
          note.collapsed === true
            ? null
            : h(
                'div',
                { className: 'sb-note-body' },
                isEditing
                  ? h('textarea', {
                      value: draft,
                      autoFocus: true,
                      placeholder: t('placeholder.note'),
                      onChange: (event) => setDraft(event.target.value),
                      onBlur: saveDraft,
                      onKeyDown: (event) => {
                        if (event.key === 'Escape') {
                          event.stopPropagation();
                          setDraft(linesToText(note));
                          setEditing(null);
                        }
                        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                          event.preventDefault();
                          saveDraft();
                        }
                      },
                    })
                  : h(
                      'div',
                      {
                        style: { cursor: 'text', minHeight: '60px' },
                        onDoubleClick: () => setEditing(note.id),
                        title: t('placeholder.note'),
                      },
                      lines.length === 0
                        ? h('div', { className: 'sb-line', style: { opacity: 0.4 } }, t('placeholder.note'))
                        : lines.map((line, index) => {
                            if (line.kind === 'todo') {
                              return h(
                                'label',
                                { key: `l${index}`, className: 'sb-todo', 'data-done': line.done === true ? 'true' : undefined },
                                h('input', {
                                  type: 'checkbox',
                                  checked: line.done === true,
                                  onChange: () => toggleLine(index),
                                  onDoubleClick: (event) => event.stopPropagation(),
                                }),
                                h('span', null, line.text === '' ? ' ' : line.text),
                              );
                            }
                            let content = line.text;
                            if (line.kind === 'ol') {
                              olIndex += 1;
                              content = line.text;
                              return h(
                                'div',
                                { key: `l${index}`, className: 'sb-line', 'data-kind': 'ol', style: { counterReset: 'none' } },
                                `${olIndex}. ${content}`,
                              );
                            }
                            return h(
                              'div',
                              { key: `l${index}`, className: 'sb-line', 'data-kind': line.kind },
                              content === '' ? ' ' : content,
                            );
                          }),
                    ),
              ),
          note.collapsed === true ? null : h('div', { className: 'sb-resize', onPointerDown: startResize, title: 'resize' }),
        );
      }

      /** The freely arranged wall. */
      function WallView({ notes, wallRef, call, editingId, setEditingId, onConvert, onNewNote, dragDisabled, selectedNotes, onSelectNote, onClearNote, onJump, flash }) {
        return h(
          'div',
          {
            className: 'sb-wall',
            ref: wallRef,
            onClick: (event) => {
              if (event.target === event.currentTarget) onClearNote?.();
            },
            onDoubleClick: (event) => {
              if (event.target === event.currentTarget) onNewNote();
            },
          },
          notes.length === 0
            ? h('div', { className: 'sb-wall-empty' }, t('status.empty.wall'))
            : notes.map((note) =>
                h(NoteCard, {
                  key: note.id,
                  note,
                  wallRef,
                  call,
                  editing: editingId,
                  setEditing: setEditingId,
                  onConvert,
                  dragDisabled,
                  selected: selectedNotes?.has(note.id) === true,
                  flashing: flash?.kind === 'note' && flash.id === note.id,
                  onSelect: onSelectNote,
                  onJump,
                }),
              ),
        );
      }

      /** One card on the board. */
      function BoardCard({ card, dragging, dropBefore, dragDisabled, selected, flashing, onSelect, onJump, onDragStart, onDragEnd, onDragOver, onDrop, onOpen, call }) {
        const linked = card.noteId !== null && card.noteId !== undefined;
        const elRef = useRef(null);

        // A 🔗 jump scrolls the target into view before flashing it.
        useEffect(() => {
          if (flashing !== true) return;
          elRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        }, [flashing]);

        return h(
          'div',
          {
            className: 'sb-card',
            ref: elRef,
            draggable: dragDisabled !== true,
            'data-dragging': dragging === card.id ? 'true' : undefined,
            'data-over': dropBefore === card.id ? 'true' : undefined,
            'data-selected': selected === true ? 'true' : undefined,
            'data-flash': flashing === true ? 'true' : undefined,
            'data-card-id': card.id,
            onClick: (event) => {
              const modified = event.metaKey === true || event.ctrlKey === true || event.shiftKey === true;
              onSelect?.(card.id, event);
              // 单击直接打开右侧详情；按住修饰键时只做多选，不弹抽屉。
              if (!modified) onOpen(card.id);
            },
            onDragStart: (event) => {
              event.dataTransfer.setData('text/plain', `card:${card.id}`);
              event.dataTransfer.effectAllowed = 'move';
              onDragStart(card.id);
            },
            onDragEnd: onDragEnd,
            onDragOver: (event) => {
              event.preventDefault();
              event.stopPropagation();
              onDragOver(card.columnId, card.id);
            },
            onDrop: (event) => {
              event.preventDefault();
              event.stopPropagation();
              onDrop(card.columnId, card.id);
            },
          },
          h('span', { className: 'sb-bar-pri', style: { background: PRIORITY_COLORS[card.priority] ?? PRIORITY_COLORS.P2 } }),
          h('input', {
            className: 'sb-check',
            type: 'checkbox',
            checked: card.done === true,
            title: t('action.done'),
            onPointerDown: (event) => event.stopPropagation(),
            onClick: (event) => event.stopPropagation(),
            onChange: () => void call('card.update', { id: card.id, patch: { done: card.done !== true } }),
          }),
          h(
            'div',
            { className: 'sb-card-main' },
            h('div', { className: 'sb-card-title' }, card.title === '' ? t('placeholder.title') : card.title),
            h(
              'div',
              { className: 'sb-card-meta' },
              card.priority !== 'P2' ? h('span', { className: 'sb-chip' }, card.priority) : null,
              card.blocked === true
                ? h('span', { className: 'sb-chip', 'data-kind': 'danger', title: card.blockedReason ?? t('label.blocked') }, t('label.blocked'))
                : null,
              card.dueDate !== null && card.dueDate !== undefined
                ? h(
                    'span',
                    { className: 'sb-chip', 'data-kind': isOverdue(card.dueDate) ? 'warn' : undefined },
                    `${t('label.due')} ${card.dueDate}`,
                  )
                : null,
              (card.labels ?? []).map((label) => h('span', { key: label, className: 'sb-chip' }, label)),
              (card.checklist ?? []).length > 0
                ? h(
                    'span',
                    { className: 'sb-chip', 'data-kind': 'brand' },
                    `☑ ${(card.checklist ?? []).filter((item) => item.done === true).length}/${(card.checklist ?? []).length}`,
                  )
                : null,
              linked
                ? h('span', {
                    className: 'sb-chip',
                    'data-kind': 'brand',
                    title: t('linked.note'),
                    style: { cursor: 'pointer' },
                    onClick: (event) => {
                      event.stopPropagation();
                      onJump?.('note', card.noteId);
                    },
                  }, '🔗')
                : null,
            ),
          ),
        );
      }

      /** One column with its cards; the grip reorders columns. */
      function Column({
        column,
        cards,
        call,
        drag,
        dropColumn,
        dropCard,
        dropColumnTarget,
        dragDisabled,
        onCardStart,
        onColumnStart,
        onDragEnd,
        onCardOver,
        onCardDrop,
        onColumnOver,
        onColumnDrop,
        onOpen,
        selectedCards,
        onSelectCard,
        onJump,
        flash,
        askConfirm,
      }) {
        const [title, setTitle] = useState(column.title);
        useEffect(() => setTitle(column.title), [column.title]);

        /** Persist a renamed column, or restore the old title. */
        function saveTitle() {
          if (title.trim() === '' || title === column.title) {
            setTitle(column.title);
            return;
          }
          void call('column.update', { id: column.id, patch: { title } });
        }

        return h(
          'div',
          { className: 'sb-col' },
          h(
            'div',
            {
              className: 'sb-col-head',
              'data-over': dropColumnTarget === column.id ? 'true' : undefined,
              onDragOver: (event) => {
                if (drag?.kind !== 'column') return;
                event.preventDefault();
                event.stopPropagation();
                onColumnOver(column.id);
              },
              onDrop: (event) => {
                if (drag?.kind !== 'column') return;
                event.preventDefault();
                event.stopPropagation();
                onColumnDrop(column.id);
              },
            },
            h('span', {
              className: 'sb-col-grip',
              title: t('action.moveColumn'),
              draggable: dragDisabled !== true,
              onDragStart: (event) => {
                event.dataTransfer.setData('text/plain', `col:${column.id}`);
                event.dataTransfer.effectAllowed = 'move';
                onColumnStart(column.id);
              },
              onDragEnd,
            }, '⠿'),
            h('input', {
              className: 'sb-col-title',
              value: title,
              title: column.id,
              onChange: (event) => setTitle(event.target.value),
              onBlur: saveTitle,
              onKeyDown: (event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') {
                  setTitle(column.title);
                  event.currentTarget.blur();
                }
              },
            }),
            h('span', { className: 'sb-col-count' }, String(cards.length)),
            h(Ico, {
              title: t('action.removeColumn'),
              onClick: () => {
                askConfirm({
                  title: t('action.removeColumn'),
                  subject: `${column.title} · ${cards.length} ${t('status.cards')}`,
                  message: t('confirm.removeColumn'),
                  confirmText: t('action.delete'),
                  danger: true,
                  onConfirm: () => void call('column.remove', { id: column.id }),
                });
              },
            }, '✕'),
          ),
          h(
            'div',
            {
              className: 'sb-col-body',
              'data-over': dropColumn === column.id && dropCard === null && drag?.kind === 'card' ? 'true' : undefined,
              onDragOver: (event) => {
                if (drag?.kind !== 'card') return;
                event.preventDefault();
                if (event.target === event.currentTarget) onCardOver(column.id, null);
              },
              onDrop: (event) => {
                if (drag?.kind !== 'card') return;
                event.preventDefault();
                onCardDrop(column.id, dropCard);
              },
            },
            cards.map((card) =>
              h(BoardCard, {
                key: card.id,
                card,
                dragging: drag?.kind === 'card' ? drag.id : null,
                dropBefore: dropColumn === column.id ? dropCard : null,
                dragDisabled,
                selected: selectedCards?.has(card.id) === true,
                flashing: flash?.kind === 'card' && flash.id === card.id,
                onSelect: onSelectCard,
                onJump,
                onDragStart: onCardStart,
                onDragEnd,
                onDragOver: onCardOver,
                onDrop: onCardDrop,
                onOpen,
                call,
              }),
            ),
            drag?.kind === 'card' && dropColumn === column.id && dropCard === null
              ? h('div', { className: 'sb-drop-line' })
              : null,
            h('button', {
              type: 'button',
              className: 'sb-col-add',
              onClick: () => void call('card.create', { card: { title: t('action.addCard'), columnId: column.id } }),
            }, `＋ ${t('action.addCard')}`),
          ),
        );
      }

      /** The board tab strip: switch, rename (pencil or double click) and reorder. */
      function BoardTabs({ boards, activeId, call, dragDisabled, onDelete }) {
        const [drag, setDrag] = useState(null);
        const [over, setOver] = useState(null);
        const [editingId, setEditingId] = useState(null);
        const [draft, setDraft] = useState('');
        const [tplOpen, setTplOpen] = useState(false);
        const tplRef = useRef(null);

        // Close the template menu when the pointer goes anywhere outside it.
        useEffect(() => {
          if (!tplOpen) return undefined;
          const close = (event) => {
            if (tplRef.current !== null && tplRef.current.contains(event.target)) return;
            setTplOpen(false);
          };
          window.addEventListener('pointerdown', close);
          return () => window.removeEventListener('pointerdown', close);
        }, [tplOpen]);

        /** Delete one board from its tab, after confirmation. */
        function deleteBoard(board) {
          if (boards.length <= 1) return;
          onDelete?.(board);
        }

        /** Drop `drag` before `targetId`, or at the end when `targetId` is null. */
        function dropAt(targetId) {
          const id = drag;
          setDrag(null);
          setOver(null);
          if (id === null || id === targetId) return;
          const from = boards.findIndex((board) => board.id === id);
          if (from === -1) return;
          if (targetId === null) {
            void call('board.move', { id, toIndex: boards.length - 1 });
            return;
          }
          const target = boards.findIndex((board) => board.id === targetId);
          if (target === -1 || target === from) return;
          // The dragged tab takes the target tab's slot: dropping on the tab two
          // places to the right moves it two places, not one.
          void call('board.move', { id, toIndex: target });
        }

        /** Enter inline rename mode (Electron has no window.prompt). */
        function startRename(board) {
          setDrag(null);
          setOver(null);
          setEditingId(board.id);
          setDraft(board.title);
        }

        /** Commit the inline rename when the input loses focus or Enter is pressed. */
        function commitRename() {
          const id = editingId;
          const title = draft.trim();
          setEditingId(null);
          if (id === null || title === '') return;
          const board = boards.find((entry) => entry.id === id);
          if (board === undefined || board.title === title) return;
          void call('board.update', { id, patch: { title } });
        }

        return h(
          'div',
          { className: 'sb-boardtabs' },
          boards.map((board) =>
            h(
              'div',
              {
                key: board.id,
                className: 'sb-boardtab',
                'data-active': board.id === activeId ? 'true' : undefined,
                'data-over': over === board.id ? 'true' : undefined,
                'data-dragging': drag === board.id ? 'true' : undefined,
                draggable: dragDisabled !== true && editingId !== board.id,
                title: editingId === board.id ? undefined : t('hint.renameBoard'),
                onClick: () => {
                  if (editingId !== null) return;
                  if (board.id !== activeId) void call('board.select', { id: board.id });
                },
                onDoubleClick: (event) => {
                  event.stopPropagation();
                  startRename(board);
                },
                onDragStart: (event) => {
                  if (editingId === board.id) {
                    event.preventDefault();
                    return;
                  }
                  event.dataTransfer.setData('text/plain', `board:${board.id}`);
                  event.dataTransfer.effectAllowed = 'move';
                  setDrag(board.id);
                },
                onDragEnd: () => {
                  setDrag(null);
                  setOver(null);
                },
                onDragOver: (event) => {
                  if (drag === null) return;
                  event.preventDefault();
                  event.stopPropagation();
                  setOver(board.id);
                },
                onDrop: (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  dropAt(board.id);
                },
              },
              editingId === board.id
                ? h('input', {
                    className: 'sb-boardtab-input',
                    value: draft,
                    autoFocus: true,
                    onChange: (event) => setDraft(event.target.value),
                    onBlur: commitRename,
                    onClick: (event) => event.stopPropagation(),
                    onPointerDown: (event) => event.stopPropagation(),
                    onKeyDown: (event) => {
                      event.stopPropagation();
                      if (event.key === 'Enter') event.currentTarget.blur();
                      if (event.key === 'Escape') setEditingId(null);
                    },
                  })
                : [
                    h('span', { key: 'title', className: 'sb-boardtab-title' }, board.title),
                    h('span', { key: 'count', className: 'sb-boardtab-count' }, String(board.cards)),
                    board.id === activeId
                      ? h('button', {
                          key: 'edit',
                          type: 'button',
                          className: 'sb-boardtab-edit',
                          title: t('action.renameBoard'),
                          onClick: (event) => {
                            event.stopPropagation();
                            startRename(board);
                          },
                          onPointerDown: (event) => event.stopPropagation(),
                        }, '✎')
                      : null,
                    boards.length > 1
                      ? h('button', {
                          key: 'close',
                          type: 'button',
                          className: 'sb-boardtab-close',
                          title: t('action.deleteBoard'),
                          onClick: (event) => {
                            event.stopPropagation();
                            deleteBoard(board);
                          },
                          onPointerDown: (event) => event.stopPropagation(),
                        }, '✕')
                      : null,
                  ],
            ),
          ),
          h(
            'div',
            { className: 'sb-menu-wrap', ref: tplRef },
            h('button', {
              type: 'button',
              className: 'sb-boardtab-add',
              title: t('action.newBoard'),
              onClick: () => setTplOpen((on) => !on),
              onDragOver: (event) => {
                if (drag === null) return;
                event.preventDefault();
                setOver('__end__');
              },
              onDrop: (event) => {
                event.preventDefault();
                dropAt(null);
              },
            }, '＋'),
            tplOpen
              ? h(
                  'div',
                  { className: 'sb-menu', style: { minWidth: '190px' } },
                  h('span', { className: 'sb-filter-title' }, t('template.choose')),
                  h('button', {
                    type: 'button',
                    className: 'sb-menu-item',
                    onClick: () => {
                      setTplOpen(false);
                      void call('board.add', {
                        title: t('action.newBoard'),
                        columns: [t('col.todo'), t('col.doing'), t('col.done')],
                      });
                    },
                  }, t('template.three')),
                  h('button', {
                    type: 'button',
                    className: 'sb-menu-item',
                    onClick: () => {
                      setTplOpen(false);
                      void call('board.add', {
                        title: t('action.newBoard'),
                        columns: [t('col.todo'), t('col.doing'), t('col.review'), t('col.blocked'), t('col.done')],
                      });
                    },
                  }, t('template.five')),
                  h('button', {
                    type: 'button',
                    className: 'sb-menu-item',
                    onClick: () => {
                      setTplOpen(false);
                      void call('board.add', { title: t('action.newBoard'), columns: [t('col.todo')] });
                    },
                  }, t('template.blank')),
                )
              : null,
          ),
        );
      }

      /** The task board. */
      function BoardView({ board, cards, call, onOpen, dragDisabled, selectedCards, onSelectCard, onJump, flash, askConfirm }) {
        const [drag, setDrag] = useState(null);
        const [dropColumn, setDropColumn] = useState(null);
        const [dropCard, setDropCard] = useState(null);
        const [dropColumnTarget, setDropColumnTarget] = useState(null);
        const boardRef = useRef(null);

        const columns = board?.columns ?? [];
        const byColumn = useMemo(() => {
          const map = new Map();
          for (const column of columns) map.set(column.id, []);
          for (const card of cards) {
            if (map.has(card.columnId)) map.get(card.columnId).push(card);
          }
          for (const list of map.values()) list.sort((a, b) => a.order - b.order);
          return map;
        }, [cards, columns]);

        // While something is dragged near an edge, scroll the board horizontally
        // and the column body under the pointer vertically. Capture phase:
        // the card handlers stop propagation, a bubbling listener would miss it.
        useEffect(() => {
          if (drag === null) return undefined;
          const EDGE = 52;
          const SPEED = 16;
          let point = null;
          let frame = 0;
          const onDragOver = (event) => {
            point = { x: event.clientX, y: event.clientY };
          };
          const step = () => {
            frame = window.requestAnimationFrame(step);
            const shell = boardRef.current;
            if (point === null || shell === null) return;
            const rect = shell.getBoundingClientRect();
            if (point.y < rect.top || point.y > rect.bottom) return;
            if (point.x < rect.left + EDGE) shell.scrollLeft -= SPEED;
            else if (point.x > rect.right - EDGE) shell.scrollLeft += SPEED;
            for (const column of shell.querySelectorAll('.sb-col')) {
              const columnRect = column.getBoundingClientRect();
              if (point.x < columnRect.left || point.x > columnRect.right) continue;
              const body = column.querySelector('.sb-col-body');
              if (body === null) break;
              const bodyRect = body.getBoundingClientRect();
              if (point.y < bodyRect.top + EDGE) body.scrollTop -= SPEED;
              else if (point.y > bodyRect.bottom - EDGE) body.scrollTop += SPEED;
              break;
            }
          };
          document.addEventListener('dragover', onDragOver, true);
          frame = window.requestAnimationFrame(step);
          return () => {
            document.removeEventListener('dragover', onDragOver, true);
            window.cancelAnimationFrame(frame);
          };
        }, [drag]);

        /** Clear every drag marker. */
        function reset() {
          setDrag(null);
          setDropColumn(null);
          setDropCard(null);
          setDropColumnTarget(null);
        }

        /** Drop a dragged card before `beforeId` (or at the end when null). */
        function dropCardAt(columnId, beforeId) {
          const id = drag?.kind === 'card' ? drag.id : null;
          reset();
          if (id === null) return;
          const list = byColumn.get(columnId) ?? [];
          const without = list.filter((card) => card.id !== id);
          const toIndex = beforeId === null ? without.length : Math.max(0, without.findIndex((card) => card.id === beforeId));
          void call('card.move', { id, columnId, toIndex });
        }

        /** Drop a dragged column onto `targetId`; it takes that column's slot. */
        function dropColumnAt(targetId) {
          const id = drag?.kind === 'column' ? drag.id : null;
          reset();
          if (id === null) return;
          const from = columns.findIndex((column) => column.id === id);
          const target = columns.findIndex((column) => column.id === targetId);
          if (from === -1 || target === -1 || from === target) return;
          void call('column.move', { id, toIndex: target });
        }

        /** Drop a dragged column at the end (the add-column button). */
        function dropColumnEnd() {
          const id = drag?.kind === 'column' ? drag.id : null;
          reset();
          if (id === null) return;
          const from = columns.findIndex((column) => column.id === id);
          if (from === -1 || from === columns.length - 1) return;
          void call('column.move', { id, toIndex: columns.length - 1 });
        }

        return h(
          'div',
          { className: 'sb-board', ref: boardRef },
          columns.map((column) =>
            h(Column, {
              key: column.id,
              column,
              cards: byColumn.get(column.id) ?? [],
              call,
              drag,
              dropColumn,
              dropCard,
              dropColumnTarget,
              dragDisabled,
              onCardStart: (id) => setDrag({ kind: 'card', id }),
              onColumnStart: (id) => setDrag({ kind: 'column', id }),
              onDragEnd: reset,
              onCardOver: (columnId, cardId) => {
                setDropColumn(columnId);
                setDropCard(cardId);
              },
              onCardDrop: dropCardAt,
              onColumnOver: (columnId) => setDropColumnTarget(columnId),
              onColumnDrop: dropColumnAt,
              onOpen,
              selectedCards,
              onSelectCard,
              onJump,
              flash,
              askConfirm,
            }),
          ),
          h('button', {
            type: 'button',
            className: 'sb-col-add',
            style: { width: '110px', flex: 'none' },
            onClick: () => void call('column.add', { title: t('placeholder.column') }),
            onDragOver: (event) => {
              if (drag?.kind !== 'column') return;
              event.preventDefault();
            },
            onDrop: (event) => {
              if (drag?.kind !== 'column') return;
              event.preventDefault();
              dropColumnEnd();
            },
          }, `＋ ${t('action.addColumn')}`),
        );
      }

      /** Right-hand detail drawer for one card. */
      function CardDrawer({ card, notes, call, onClose, onConvert, onJump, onSync }) {
        const [title, setTitle] = useState(card.title);
        const [body, setBody] = useState(card.note ?? '');
        const [labels, setLabels] = useState((card.labels ?? []).join(', '));
        const [preview, setPreview] = useState(false);
        const [savedAt, setSavedAt] = useState(null);
        const [newItem, setNewItem] = useState('');
        const [blockReason, setBlockReason] = useState(card.blockedReason ?? '');

        useEffect(() => {
          setTitle(card.title);
          setBody(card.note ?? '');
          setLabels((card.labels ?? []).join(', '));
          setBlockReason(card.blockedReason ?? '');
        }, [card.id, card.rev]);

        /** Save one field; the head shows when the Host acknowledged it. */
        async function save(patch) {
          const answer = await call('card.update', { id: card.id, patch });
          if (answer !== null) setSavedAt(Date.now());
        }

        const items = Array.isArray(card.checklist) ? card.checklist : [];
        const doneItems = items.filter((item) => item.done === true).length;

        /** Replace the checklist (schema v2: one array, whole-set updates). */
        function saveChecklist(next) {
          void save({ checklist: next });
        }

        /** Toggle one checklist item. */
        function toggleItem(id) {
          saveChecklist(items.map((item) => (item.id === id ? { ...item, done: item.done !== true } : item)));
        }

        /** Commit an edited item text. */
        function editItem(id, text) {
          saveChecklist(items.map((item) => (item.id === id ? { ...item, text } : item)));
        }

        /** Drop one item. */
        function removeItem(id) {
          saveChecklist(items.filter((item) => item.id !== id));
        }

        /** Append the draft item. */
        function addItem() {
          const text = newItem.trim();
          if (text === '') return;
          setNewItem('');
          saveChecklist([...items, { text, done: false }]);
        }

        const linkedNote = (notes ?? []).find((note) => note.id === card.noteId);

        return h(
          'div',
          { className: 'sb-drawer' },
          h(
            'div',
            { className: 'sb-drawer-head' },
            h('span', { style: { flex: 1 } }, t('tab.board')),
            savedAt !== null ? h('span', { className: 'sb-saved' }, `${t('status.saved')} ${clock(savedAt)}`) : null,
            h(Ico, { title: t('action.close'), onClick: onClose }, '✕'),
          ),
          h(
            'div',
            { className: 'sb-drawer-body' },
            h(
              'label',
              { className: 'sb-field' },
              h('span', { className: 'sb-field-label' }, t('label.title')),
              h('input', {
                className: 'sb-input',
                value: title,
                placeholder: t('placeholder.title'),
                onChange: (event) => setTitle(event.target.value),
                onBlur: () => {
                  if (title.trim() !== '' && title !== card.title) save({ title });
                },
              }),
            ),
            h(
              'div',
              { className: 'sb-field' },
              h(
                'div',
                { className: 'sb-field-row' },
                h('span', { className: 'sb-field-label' }, t('placeholder.desc')),
                h('button', {
                  type: 'button',
                  className: 'sb-mini',
                  onClick: () => setPreview((on) => !on),
                }, preview ? t('action.edit') : t('action.preview')),
              ),
              preview
                ? h('div', { className: 'sb-md', title: t('action.edit'), onClick: () => setPreview(false) }, renderMarkdown(body))
                : h('textarea', {
                    className: 'sb-textarea',
                    value: body,
                    placeholder: t('placeholder.desc'),
                    onChange: (event) => setBody(event.target.value),
                    onBlur: () => {
                      if (body !== (card.note ?? '')) void save({ note: body });
                    },
                  }),
            ),
            h(
              'div',
              { className: 'sb-field' },
              h('span', { className: 'sb-field-label' }, t('label.priority')),
              h(
                'div',
                { className: 'sb-pri-row' },
                PRIORITIES.map((priority) =>
                  h('button', {
                    key: priority,
                    type: 'button',
                    className: 'sb-pri',
                    'data-active': card.priority === priority ? 'true' : undefined,
                    style: { '--pri': PRIORITY_COLORS[priority] ?? PRIORITY_COLORS.P2 },
                    onClick: () => save({ priority }),
                  }, priority),
                ),
              ),
            ),
            h(
              'label',
              { className: 'sb-field' },
              h('span', { className: 'sb-field-label' }, t('label.due')),
              h('input', {
                className: 'sb-input',
                type: 'date',
                value: card.dueDate ?? '',
                onChange: (event) => save({ dueDate: event.target.value }),
              }),
            ),
            h(
              'label',
              { className: 'sb-field' },
              h('span', { className: 'sb-field-label' }, t('label.labels')),
              h('input', {
                className: 'sb-input',
                value: labels,
                placeholder: 'bug, 文档',
                onChange: (event) => setLabels(event.target.value),
                onBlur: () => {
                  const next = labels.split(',').map((label) => label.trim()).filter((label) => label !== '');
                  if (next.join(',') !== (card.labels ?? []).join(',')) save({ labels: next });
                },
              }),
            ),
            h(
              'div',
              { className: 'sb-field' },
              h(
                'div',
                { className: 'sb-field-row' },
                h(
                  'span',
                  { className: 'sb-field-label' },
                  items.length === 0 ? t('label.checklist') : `${t('label.checklist')} ${doneItems}/${items.length}`,
                ),
              ),
              h(
                'div',
                { className: 'sb-checklist' },
                items.map((item) =>
                  h(
                    'div',
                    { key: item.id, className: 'sb-check-row' },
                    h('input', {
                      type: 'checkbox',
                      className: 'sb-check',
                      checked: item.done === true,
                      title: item.done === true ? t('action.undone') : t('action.done'),
                      onChange: () => toggleItem(item.id),
                    }),
                    h('input', {
                      key: `${item.id}-${card.rev}`,
                      className: 'sb-check-text',
                      defaultValue: item.text,
                      style: item.done === true ? { textDecoration: 'line-through', opacity: 0.6 } : undefined,
                      onBlur: (event) => {
                        if (event.target.value !== item.text) editItem(item.id, event.target.value);
                      },
                      onKeyDown: (event) => {
                        if (event.key === 'Enter') event.currentTarget.blur();
                      },
                    }),
                    h(Ico, { title: t('action.delete'), onClick: () => removeItem(item.id) }, '✕'),
                  ),
                ),
                h(
                  'div',
                  { className: 'sb-check-add' },
                  h('input', {
                    className: 'sb-check-text',
                    value: newItem,
                    placeholder: t('placeholder.checklist'),
                    onChange: (event) => setNewItem(event.target.value),
                    onKeyDown: (event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addItem();
                      }
                    },
                  }),
                  h(Btn, { onClick: addItem, disabled: newItem.trim() === '' }, t('action.add')),
                ),
              ),
            ),
            h(
              'div',
              { className: 'sb-field' },
              h(
                'div',
                { className: 'sb-field-row' },
                h('span', { className: 'sb-field-label' }, t('label.blocked')),
                h('input', {
                  type: 'checkbox',
                  className: 'sb-check',
                  checked: card.blocked === true,
                  onChange: (event) => {
                    const next = event.target.checked === true;
                    const reason = next && blockReason.trim() !== '' ? blockReason.trim() : null;
                    void save({ blocked: next, blockedReason: next ? reason : null });
                  },
                }),
              ),
              card.blocked === true
                ? h('input', {
                    className: 'sb-input',
                    value: blockReason,
                    placeholder: t('placeholder.blockReason'),
                    onChange: (event) => setBlockReason(event.target.value),
                    onBlur: () => {
                      const reason = blockReason.trim();
                      void save({ blocked: true, blockedReason: reason === '' ? null : reason });
                    },
                  })
                : null,
            ),
            linkedNote !== undefined
              ? h(
                  'div',
                  { className: 'sb-row' },
                  h('span', {
                    className: 'sb-chip',
                    'data-kind': 'brand',
                    title: t('linked.note'),
                    style: { cursor: 'pointer' },
                    onClick: () => onJump?.('note', linkedNote.id),
                  }, `${t('linked.note')}: ${titleOf(linkedNote) || linkedNote.id}`),
                  h(Btn, { onClick: () => onSync?.(card), title: t('action.syncNote') }, t('action.syncNote')),
                  h(Btn, { onClick: () => save({ noteId: null }) }, t('action.unlinkNote')),
                )
              : null,
            h(
              'div',
              { className: 'sb-drawer-actions' },
              h('button', {
                type: 'button',
                className: 'sb-act',
                'data-kind': 'success',
                'data-on': card.done === true ? 'true' : undefined,
                title: card.done === true ? t('action.undone') : t('action.done'),
                onClick: () => save({ done: card.done !== true }),
              }, card.done === true ? `✓ ${t('action.done')}` : t('action.done')),
              h('button', {
                type: 'button',
                className: 'sb-act',
                'data-kind': 'primary',
                title: t('action.toNote'),
                onClick: () => onConvert(card),
              }, t('action.toNote')),
              h('button', {
                type: 'button',
                className: 'sb-act',
                'data-kind': 'danger',
                title: t('action.delete'),
                onClick: () => void call('card.remove', { id: card.id }),
              }, t('action.delete')),
            ),
          ),
        );
      }

      /** The trash view: multi-select, batch restore/purge, empty all. */
      function TrashView({ notes, cards, call, onToast, askConfirm }) {
        const [checked, setChecked] = useState(() => new Set());
        const trashedNotes = notes.filter((note) => note.trashed === true);
        const trashedCards = cards.filter((card) => card.trashed === true);
        const total = trashedNotes.length + trashedCards.length;
        const selectedCount = checked.size;

        const keyOf = (kind, id) => `${kind}\u0000${id}`;
        const isOn = (kind, id) => checked.has(keyOf(kind, id));

        /** Toggle one row. */
        function toggle(kind, id) {
          const key = keyOf(kind, id);
          setChecked((previous) => {
            const next = new Set(previous);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
          });
        }

        /** Select every trashed entry, or clear the selection. */
        function toggleAll() {
          setChecked((previous) => {
            if (previous.size >= total) return new Set();
            return new Set([
              ...trashedNotes.map((note) => keyOf('note', note.id)),
              ...trashedCards.map((card) => keyOf('card', card.id)),
            ]);
          });
        }

        /** Split the checked keys back into the two id lists. */
        function ids() {
          const noteIds = [];
          const cardIds = [];
          for (const key of checked) {
            const cut = key.indexOf('\u0000');
            const kind = key.slice(0, cut);
            const id = key.slice(cut + 1);
            if (kind === 'note') noteIds.push(id);
            else cardIds.push(id);
          }
          return { noteIds, cardIds };
        }

        /** Restore every checked entry. */
        function restoreChecked() {
          const { noteIds, cardIds } = ids();
          const count = noteIds.length + cardIds.length;
          if (count === 0) return;
          setChecked(new Set());
          void call('trash.restoreMany', { noteIds, cardIds });
          onToast?.(`${t('toast.restored')} · ${count}`);
        }

        /** Erase every checked entry, after one confirmation. */
        function purgeChecked() {
          const { noteIds, cardIds } = ids();
          const count = noteIds.length + cardIds.length;
          if (count === 0) return;
          askConfirm({
            title: t('action.purgeSelected'),
            subject: `${count} ${t('label.items')}`,
            message: t('confirm.purgeSelected'),
            confirmText: t('action.purge'),
            danger: true,
            onConfirm: () => {
              setChecked(new Set());
              void call('trash.purgeMany', { noteIds, cardIds });
              onToast?.(`${t('toast.purged')} · ${count}`);
            },
          });
        }

        /** Empty the whole trash. */
        function purgeAll() {
          if (total === 0) return;
          askConfirm({
            title: t('action.clearTrash'),
            subject: `${total} ${t('label.items')}`,
            message: t('confirm.clearTrash'),
            confirmText: t('action.clear'),
            danger: true,
            onConfirm: () => {
              setChecked(new Set());
              void call('trash.clear');
              onToast?.(t('toast.cleared'));
            },
          });
        }

        /** One row with its checkbox and the two single-item actions. */
        function row(kind, id, label) {
          return h(
            'div',
            { key: keyOf(kind, id), className: 'sb-trash-row' },
            h('input', {
              type: 'checkbox',
              className: 'sb-check',
              checked: isOn(kind, id),
              onChange: () => toggle(kind, id),
            }),
            h('span', null, label),
            h(Btn, {
              onClick: () => {
                void call(kind === 'note' ? 'note.restore' : 'card.restore', { id });
                onToast?.(t('toast.restored'));
              },
            }, t('action.restore')),
            h(Btn, {
              danger: true,
              onClick: () => {
                askConfirm({
                  title: t('action.purge'),
                  message: t('confirm.purgeOne'),
                  confirmText: t('action.purge'),
                  danger: true,
                  onConfirm: () => {
                    void call(kind === 'note' ? 'note.remove' : 'card.remove', { id, permanent: true });
                    onToast?.(t('toast.purged'));
                  },
                });
              },
            }, t('action.purge')),
          );
        }

        return h(
          'div',
          { className: 'sb-trash' },
          h(
            'div',
            { className: 'sb-trash-actions' },
            h(
              'label',
              { className: 'sb-trash-checkall' },
              h('input', {
                type: 'checkbox',
                className: 'sb-check',
                checked: total > 0 && selectedCount >= total,
                disabled: total === 0,
                onChange: toggleAll,
              }),
              h('span', null, `${t('action.selectAll')} (${total})`),
            ),
            h('span', { className: 'sb-spacer' }),
            h(Btn, { disabled: selectedCount === 0, onClick: restoreChecked }, `${t('action.restoreSelected')} ${selectedCount}`),
            h(Btn, { danger: true, disabled: selectedCount === 0, onClick: purgeChecked }, `${t('action.purgeSelected')} ${selectedCount}`),
            h(Btn, { danger: true, disabled: total === 0, onClick: purgeAll }, t('action.clearTrash')),
          ),
          total === 0 ? h('div', { className: 'sb-empty' }, t('status.empty.trash')) : null,
          trashedNotes.length > 0 ? h('div', { className: 'sb-section' }, `${t('trash.notes')} (${trashedNotes.length})`) : null,
          trashedNotes.map((note) => row('note', note.id, titleOf(note) || note.id)),
          trashedCards.length > 0 ? h('div', { className: 'sb-section' }, `${t('trash.cards')} (${trashedCards.length})`) : null,
          trashedCards.map((card) => row('card', card.id, `${card.title} · ${card.columnId}`)),
        );
      }

      /**
       * Error boundary: a throw while rendering must show a readable message,
       * not a blank main area (the host blanks the whole slot entry on throw).
       */
      class PanelBoundary extends React.Component {
        constructor(props) {
          super(props);
          this.state = { error: null };
        }

        static getDerivedStateFromError(error) {
          return { error };
        }

        componentDidCatch(error) {
          console.error('sticky-board: panel render error', error);
        }

        render() {
          if (this.state.error !== null) {
            return h(
              'div',
              { className: 'sb-root' },
              h(
                'div',
                { className: 'sb-empty' },
                h('div', { className: 'sb-empty-title' }, t('error.crash')),
                h(
                  'div',
                  { className: 'sb-error', style: { whiteSpace: 'pre-wrap', textAlign: 'left', maxHeight: '60vh', overflow: 'auto' } },
                  String(this.state.error?.stack ?? this.state.error?.message ?? this.state.error),
                ),
              ),
            );
          }
          return this.props.children;
        }
      }

      /** In-panel confirmation dialog: native window.confirm looks foreign here. */
      function ConfirmDialog({ request, onResolve }) {
        const cardRef = useRef(null);
        useEffect(() => {
          cardRef.current?.focus?.();
        }, []);
        return h(
          'div',
          { className: 'sb-mask', onPointerDown: () => onResolve(false) },
          h(
            'div',
            {
              className: 'sb-modal',
              ref: cardRef,
              tabIndex: -1,
              onPointerDown: (event) => event.stopPropagation(),
              onKeyDown: (event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.stopPropagation();
                  onResolve(true);
                }
              },
            },
            h('div', { className: 'sb-modal-title' }, request.title),
            request.subject !== undefined && request.subject !== ''
              ? h('div', { className: 'sb-modal-subject' }, request.subject)
              : null,
            request.message !== undefined && request.message !== ''
              ? h('div', { className: 'sb-modal-text' }, request.message)
              : null,
            request.danger === true ? h('div', { className: 'sb-modal-hint' }, t('confirm.undoHint')) : null,
            h(
              'div',
              { className: 'sb-modal-actions' },
              h(Btn, { onClick: () => onResolve(false) }, t('action.cancel')),
              h(
                Btn,
                {
                  danger: request.danger === true,
                  primary: request.danger !== true,
                  onClick: () => onResolve(true),
                },
                request.confirmText ?? t('action.confirm'),
              ),
            ),
          ),
        );
      }

      /** Root panel. */
      function App() {
        const [data, setData] = useState(null);
        const [view, setView] = useState('wall');
        const [scheme, setScheme] = useState(() => readScheme(themeCtx));
        const [confirmRequest, setConfirmRequest] = useState(null);
        const [trashMode, setTrashMode] = useState(false);
        const [query, setQuery] = useState('');
        const [error, setError] = useState(null);
        const [savedAt, setSavedAt] = useState(null);
        const [editingId, setEditingId] = useState(null);
        const [drawerId, setDrawerId] = useState(null);
        const [offline, setOffline] = useState(false);
        const [cardSelection, setCardSelection] = useState(() => new Set());
        const [noteSelection, setNoteSelection] = useState(() => new Set());
        const [flash, setFlash] = useState(null);
        const [toast, setToast] = useState(null);
        const [menuOpen, setMenuOpen] = useState(false);
        const [moveMenuOpen, setMoveMenuOpen] = useState(false);
        const [notePaletteOpen, setNotePaletteOpen] = useState(false);
        const [filterOpen, setFilterOpen] = useState(false);
        const [filters, setFilters] = useState({ priorities: [], openOnly: false, overdueOnly: false, blockedOnly: false, label: '' });
        const [wallFilterOpen, setWallFilterOpen] = useState(false);
        const [noteColors, setNoteColors] = useState([]);
        const [pinnedOnly, setPinnedOnly] = useState(false);
        const rootRef = useRef(null);
        const wallRef = useRef(null);
        const searchRef = useRef(null);
        const menuRef = useRef(null);
        const moveMenuRef = useRef(null);
        const notePaletteRef = useRef(null);
        // Follow the Host theme (light/dark) so the decorative palette stays legible.
        useEffect(() => {
          const service = themeServiceOf(themeCtx);
          const sync = () => setScheme(readScheme(themeCtx));
          const disposers = [];
          const target = typeof themeCtx?.on === 'function' ? themeCtx : service;
          if (typeof target?.on === 'function') disposers.push(target.on('theme/change', sync));
          const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: light)') : null;
          if (media !== null) {
            media.addEventListener?.('change', sync);
            disposers.push(() => media.removeEventListener?.('change', sync));
          }
          return () => {
            for (const dispose of disposers) {
              try {
                dispose();
              } catch {
                // disposal must not break unmount
              }
            }
          };
        }, []);
        const filterRef = useRef(null);
        const wallFilterRef = useRef(null);
        const fileRef = useRef(null);
        const queryRef = useRef('');
        const importModeRef = useRef('merge');
        /** Last rendered document revision + query, so a no-op poll skips a re-render. */
        const lastRevRef = useRef(null);
        const lastQueryRef = useRef('');
        /** True while a pointer is down anywhere: polling would re-render mid-drag. */
        const pointerActiveRef = useRef(false);
        const toastTimerRef = useRef(0);
        const noteAnchorRef = useRef(null);
        const cardAnchorRef = useRef(null);
        queryRef.current = query;

        /** Load one snapshot; the Host filters notes and cards by `q`. */
        const load = useCallback(async () => {
          try {
            const term = queryRef.current.trim();
            const suffix = term === '' ? '?trash=1' : `?trash=1&q=${encodeURIComponent(term)}`;
            const response = await fetch(`${API}${suffix}`, { headers: { Accept: 'application/json' } });
            const payload = await response.json();
            if (payload?.ok !== true) {
              setError(payload?.error ?? t('error.generic'));
              setOffline(false);
              return;
            }
            setOffline(false);
            setError(null);
            const rev = typeof payload.rev === 'number' ? payload.rev : -1;
            // A late answer for an older document must not roll the view back.
            if (rev !== -1 && lastRevRef.current !== null && rev < lastRevRef.current) return;
            // Same document and same filter: nothing to re-render.
            if (rev !== -1 && rev === lastRevRef.current && lastQueryRef.current === term) return;
            lastRevRef.current = lastRevRef.current === null ? rev : Math.max(rev, lastRevRef.current);
            lastQueryRef.current = term;
            setData(payload);
          } catch (_error) {
            setOffline(true);
          }
        }, []);

        /** Run one action; every answer carries a fresh snapshot. */
        const call = useCallback(async (action, payload = {}) => {
          try {
            const response = await fetch(API, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({ action, ...payload }),
            });
            const answer = await response.json();
            if (answer?.ok !== true) {
              setError(answer?.error ?? t('error.generic'));
              return null;
            }
            setError(null);
            if (Array.isArray(answer.notes) && answer.board !== undefined) {
              lastRevRef.current = typeof answer.rev === 'number' ? answer.rev : lastRevRef.current;
              lastQueryRef.current = queryRef.current.trim();
              setData(answer);
              setSavedAt(answer.updatedAt ?? Date.now());
            } else {
              void load();
            }
            return answer;
          } catch (_error) {
            setOffline(true);
            return null;
          }
        }, [load]);

        useEffect(() => {
          void load();
          const timer = window.setInterval(() => {
            // Skip the refresh while the user is dragging: a mid-drag snapshot
            // re-render is what left a ghost image behind the pointer.
            if (!pointerActiveRef.current) void load();
          }, 6000);
          return () => window.clearInterval(timer);
        }, [load]);

        // Track pointer-down globally so the poll above can stand down.
        useEffect(() => {
          const down = () => {
            pointerActiveRef.current = true;
          };
          const up = () => {
            pointerActiveRef.current = false;
          };
          window.addEventListener('pointerdown', down, true);
          window.addEventListener('pointerup', up, true);
          window.addEventListener('pointercancel', up, true);
          return () => {
            window.removeEventListener('pointerdown', down, true);
            window.removeEventListener('pointerup', up, true);
            window.removeEventListener('pointercancel', up, true);
          };
        }, []);

        // Server-side search: debounce the term, then refetch a filtered snapshot.
        useEffect(() => {
          const timer = window.setTimeout(() => {
            void load();
          }, 220);
          return () => window.clearTimeout(timer);
        }, [query, load]);

        useEffect(() => {
          rootRef.current?.focus?.();
        }, []);

        // Close the "more" menu when the pointer goes anywhere outside it.
        useEffect(() => {
          if (!menuOpen) return undefined;
          const close = (event) => {
            if (menuRef.current !== null && menuRef.current.contains(event.target)) return;
            setMenuOpen(false);
          };
          window.addEventListener('pointerdown', close);
          return () => window.removeEventListener('pointerdown', close);
        }, [menuOpen]);

        // Close the "move to" popover the same way.
        useEffect(() => {
          if (!moveMenuOpen) return undefined;
          const close = (event) => {
            if (moveMenuRef.current !== null && moveMenuRef.current.contains(event.target)) return;
            setMoveMenuOpen(false);
          };
          window.addEventListener('pointerdown', close);
          return () => window.removeEventListener('pointerdown', close);
        }, [moveMenuOpen]);

        // Close the note colour palette the same way.
        useEffect(() => {
          if (!notePaletteOpen) return undefined;
          const close = (event) => {
            if (notePaletteRef.current !== null && notePaletteRef.current.contains(event.target)) return;
            setNotePaletteOpen(false);
          };
          window.addEventListener('pointerdown', close);
          return () => window.removeEventListener('pointerdown', close);
        }, [notePaletteOpen]);

        // Close the board filter popover the same way.
        useEffect(() => {
          if (!filterOpen) return undefined;
          const close = (event) => {
            if (filterRef.current !== null && filterRef.current.contains(event.target)) return;
            setFilterOpen(false);
          };
          window.addEventListener('pointerdown', close);
          return () => window.removeEventListener('pointerdown', close);
        }, [filterOpen]);

        // Close the wall colour filter the same way.
        useEffect(() => {
          if (!wallFilterOpen) return undefined;
          const close = (event) => {
            if (wallFilterRef.current !== null && wallFilterRef.current.contains(event.target)) return;
            setWallFilterOpen(false);
          };
          window.addEventListener('pointerdown', close);
          return () => window.removeEventListener('pointerdown', close);
        }, [wallFilterOpen]);

        const notes = data?.notes ?? [];
        const board = data?.board ?? null;
        const boards = data?.boards ?? [];
        const activeBoardId = data?.activeBoardId ?? board?.id ?? '';
        const allCards = board?.cards ?? [];
        const counts = data?.counts ?? { notes: 0, cards: 0, pinned: 0, notesTrash: 0, cardsTrash: 0 };
        const densityValue = data?.settings?.wallDensity ?? 'auto';
        const needle = query.trim().toLowerCase();

        const match = useCallback((title, text) => {
          if (needle === '') return true;
          return String(title ?? '').toLowerCase().includes(needle) || String(text ?? '').toLowerCase().includes(needle);
        }, [needle]);

        const colorFilterActive = noteColors.length > 0 || pinnedOnly === true;
        const wallFilterCount = noteColors.length + (pinnedOnly === true ? 1 : 0);
        const visibleNotes = notes.filter((note) => {
          if (trashMode ? note.trashed !== true : note.trashed === true) return false;
          if (!match(titleOf(note), note.text ?? linesToText(note))) return false;
          if (noteColors.length > 0 && !noteColors.includes(note.color)) return false;
          if (pinnedOnly === true && note.pinned !== true) return false;
          return true;
        });
        const visibleCards = allCards.filter((card) =>
          trashMode ? card.trashed === true : card.trashed !== true && match(card.title, card.note),
        );

        /** Active board filters (client-side; the snapshot already holds the board). */
        const filterCount =
          filters.priorities.length +
          (filters.openOnly === true ? 1 : 0) +
          (filters.overdueOnly === true ? 1 : 0) +
          (filters.blockedOnly === true ? 1 : 0) +
          (filters.label.trim() !== '' ? 1 : 0);
        const filtersActive = filterCount > 0;
        const labelNeedle = filters.label.trim().toLowerCase();
        const shownCards = !filtersActive
          ? visibleCards
          : visibleCards.filter((card) => {
              if (filters.priorities.length > 0 && !filters.priorities.includes(card.priority)) return false;
              if (filters.openOnly === true && card.done === true) return false;
              if (filters.overdueOnly === true && !isOverdue(card.dueDate)) return false;
              if (filters.blockedOnly === true && card.blocked !== true) return false;
              if (labelNeedle !== '' && !(card.labels ?? []).some((label) => label.toLowerCase().includes(labelNeedle))) {
                return false;
              }
              return true;
            });
        const statPriority = allCards.filter((card) => card.trashed !== true && (card.priority === 'P0' || card.priority === 'P1')).length;
        const statOverdue = allCards.filter((card) => card.trashed !== true && isOverdue(card.dueDate)).length;
        const statBlocked = allCards.filter((card) => card.trashed !== true && card.blocked === true).length;

        /** Toggle one paper colour in the wall filter. */
        function toggleNoteColor(color) {
          setNoteColors((current) => (current.includes(color) ? current.filter((entry) => entry !== color) : [...current, color]));
        }

        /** Clear the wall filter. */
        function resetWallFilter() {
          setNoteColors([]);
          setPinnedOnly(false);
        }

        /** Toggle one priority in the filter popover. */
        function togglePriorityFilter(priority) {
          setFilters((current) => ({
            ...current,
            priorities: current.priorities.includes(priority)
              ? current.priorities.filter((entry) => entry !== priority)
              : [...current.priorities, priority],
          }));
        }

        /** Clear every board filter. */
        function resetFilters() {
          setFilters({ priorities: [], openOnly: false, overdueOnly: false, label: '' });
        }

        const drawerCard = drawerId === null ? undefined : allCards.find((card) => card.id === drawerId);

        // A view, board or trash switch starts with nothing selected. These two
        // effects must stay below the derived locals above: a deps array is
        // evaluated during render, so referencing `activeBoardId` before its
        // declaration threw a TDZ error and blanked the whole panel.
        useEffect(() => {
          setCardSelection(new Set());
          cardAnchorRef.current = null;
          setNoteSelection(new Set());
          noteAnchorRef.current = null;
        }, [view, trashMode, activeBoardId]);

        // Drop a stale card selection when the card disappeared (tool, other window).
        useEffect(() => {
          if (cardSelection.size === 0) return;
          const ids = new Set((data?.board?.cards ?? []).map((card) => card.id));
          for (const id of cardSelection) {
            if (!ids.has(id)) {
              setCardSelection(new Set());
              return;
            }
          }
        }, [cardSelection, data]);

        // Same for the wall's multi-selection.
        useEffect(() => {
          if (noteSelection.size === 0) return;
          const ids = new Set((data?.notes ?? []).map((note) => note.id));
          for (const id of noteSelection) {
            if (!ids.has(id)) {
              setNoteSelection(new Set());
              return;
            }
          }
        }, [noteSelection, data]);

        // One-shot highlight after a 🔗 jump; the CSS animation plays once.
        useEffect(() => {
          if (flash === null) return undefined;
          const timer = window.setTimeout(() => setFlash(null), 1100);
          return () => window.clearTimeout(timer);
        }, [flash]);

        // Never leave a timer firing after the panel unmounts.
        useEffect(() => () => window.clearTimeout(toastTimerRef.current), []);

        /** Show one bottom toast; `undo` restores trashed entries. */
        function showToast(next, ttl = 5000) {
          window.clearTimeout(toastTimerRef.current);
          setToast({ ...next, nonce: Date.now() });
          toastTimerRef.current = window.setTimeout(() => setToast(null), ttl);
        }

        /** Card ids of one column, in visual order. */
        const cardIdsByColumn = (() => {
          const map = new Map();
          for (const column of board?.columns ?? []) map.set(column.id, []);
          for (const card of visibleCards) {
            const list = map.get(card.columnId);
            if (list !== undefined) list.push(card);
          }
          for (const list of map.values()) list.sort((a, b) => a.order - b.order);
          for (const [columnId, list] of map) map.set(columnId, list.map((card) => card.id));
          return map;
        })();

        /** Column a card belongs to, or null when it is not on the board. */
        function columnOfCard(cardId) {
          const card = allCards.find((entry) => entry.id === cardId);
          return card === undefined ? null : card.columnId;
        }

        /**
         * Select or toggle one card.
         * Shift extends only inside the anchor's column: a range that would cross
         * columns falls back to a plain single selection.
         */
        function selectCard(id, event) {
          const additive = event !== undefined && (event.metaKey === true || event.ctrlKey === true);
          const range = event !== undefined && event.shiftKey === true;
          clearNoteSelection();
          // 多选点击不弹抽屉；单击才由卡片自己 onOpen。
          if (additive || range) {
            setDrawerId(null);
            setMoveMenuOpen(false);
          }
          setCardSelection((previous) => {
            const next = new Set(previous);
            if (range && cardAnchorRef.current !== null) {
              const anchorColumn = columnOfCard(cardAnchorRef.current);
              const targetColumn = columnOfCard(id);
              if (anchorColumn !== null && anchorColumn === targetColumn) {
                const order = cardIdsByColumn.get(anchorColumn) ?? [];
                const from = order.indexOf(cardAnchorRef.current);
                const to = order.indexOf(id);
                if (from !== -1 && to !== -1) {
                  for (let index = Math.min(from, to); index <= Math.max(from, to); index += 1) next.add(order[index]);
                  return next;
                }
              }
            }
            if (additive) {
              if (next.has(id)) next.delete(id);
              else next.add(id);
            } else {
              next.clear();
              next.add(id);
            }
            cardAnchorRef.current = id;
            return next;
          });
        }

        /** Clear the board multi-selection. */
        function clearCardSelection() {
          cardAnchorRef.current = null;
          setMoveMenuOpen(false);
          setCardSelection(new Set());
        }

        /** Select or toggle one note; Shift extends from the last anchor. */
        function selectNote(id, event) {
          const additive = event !== undefined && (event.metaKey === true || event.ctrlKey === true);
          const range = event !== undefined && event.shiftKey === true;
          clearCardSelection();
          setNoteSelection((previous) => {
            const next = new Set(previous);
            if (range && noteAnchorRef.current !== null) {
              const order = visibleNotes.map((note) => note.id);
              const from = order.indexOf(noteAnchorRef.current);
              const to = order.indexOf(id);
              if (from !== -1 && to !== -1) {
                for (let index = Math.min(from, to); index <= Math.max(from, to); index += 1) next.add(order[index]);
                return next;
              }
            }
            if (additive) {
              if (next.has(id)) next.delete(id);
              else next.add(id);
            } else {
              next.clear();
              next.add(id);
            }
            noteAnchorRef.current = id;
            return next;
          });
        }

        /** Clear the wall multi-selection. */
        function clearNoteSelection() {
          noteAnchorRef.current = null;
          setNoteSelection(new Set());
        }

        /** Restore whatever the last toast trashed. */
        async function undoToast() {
          const current = toast;
          window.clearTimeout(toastTimerRef.current);
          setToast(null);
          if (current?.undo === undefined) return;
          const answer = await call('trash.restoreMany', current.undo);
          if (answer !== null) showToast({ text: t('toast.restored') });
        }

        /** Create a note and open its editor. */
        async function newNote() {
          const answer = await call('note.create', { note: { lines: [{ kind: 'text', text: '' }], color: 'amber' } });
          if (answer?.note !== undefined) {
            clearNoteSelection();
            setView('wall');
            setTrashMode(false);
            setEditingId(answer.note.id);
          }
        }

        /** Create a card and open its drawer. */
        async function newCard() {
          const firstColumn = board?.columns?.[0]?.id ?? 'todo';
          const answer = await call('card.create', { card: { title: '', columnId: firstColumn } });
          if (answer?.card !== undefined) {
            setView('board');
            setTrashMode(false);
            setDrawerId(answer.card.id);
          }
        }

        /** Turn one note into a task. */
        async function convertNote(note) {
          const answer = await call('note.toTask', { id: note.id });
          if (answer !== null) showToast({ text: t('toast.toTask') });
        }

        /** Turn one card into a note. */
        async function convertCard(card) {
          const answer = await call('card.toNote', { id: card.id });
          setDrawerId(null);
          if (answer !== null) showToast({ text: t('toast.toNote') });
        }

        /** D1: pull the linked note's title + content onto its card (one-way). */
        async function syncLinked(card) {
          const answer = await call('link.sync', { cardId: card.id });
          if (answer !== null) showToast({ text: t('toast.synced') });
        }

        /** Undo the last write (the Host keeps an in-memory history). */
        async function undoHistory() {
          const answer = await call('history.undo');
          if (answer === null) return;
          showToast({ text: answer.undone === true ? t('toast.undone') : t('toast.nothingUndo') });
        }

        /** Redo the most recently undone write. */
        async function redoHistory() {
          const answer = await call('history.redo');
          if (answer === null) return;
          showToast({ text: answer.undone === true ? t('toast.redone') : t('toast.nothingRedo') });
        }

        /** Follow a wall↔board link to the other side, switching board if needed. */
        async function jumpTo(kind, id) {
          if (kind === 'note') {
            setTrashMode(false);
            setView('wall');
            setDrawerId(null);
            clearCardSelection();
            noteAnchorRef.current = id;
            setNoteSelection(new Set([id]));
            setFlash({ kind: 'note', id, nonce: Date.now() });
            return;
          }
          setTrashMode(false);
          setView('board');
          if (!allCards.some((card) => card.id === id)) {
            const answer = await call('locate', { id });
            const boardId = answer?.found?.boardId;
            if (typeof boardId === 'string' && boardId !== activeBoardId) {
              await call('board.select', { id: boardId });
            }
          }
          clearNoteSelection();
          cardAnchorRef.current = id;
          setCardSelection(new Set([id]));
          setDrawerId(id);
          setFlash({ kind: 'card', id, nonce: Date.now() });
        }

        /** Close drawer state when a board is removed from its tab. */
        function boardRemoved(id) {
          if (id === activeBoardId) setDrawerId(null);
        }

        /** Lay the wall out on a grid. */
        async function tidyWall() {
          const answer = await call('note.tidy');
          if (answer !== null) showToast({ text: `${t('toast.tidied')} · ${answer.count}` });
        }

        /** Download the whole document as JSON. */
        async function exportJson() {
          setMenuOpen(false);
          try {
            const response = await fetch(API, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({ action: 'export' }),
            });
            const answer = await response.json();
            if (answer?.ok !== true || answer?.document === undefined) {
              setError(answer?.error ?? t('error.generic'));
              return;
            }
            const blob = new Blob([JSON.stringify(answer.document, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `sticky-board-${today()}.json`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 3000);
            showToast({ text: t('toast.exported') });
          } catch (_error) {
            setOffline(true);
          }
        }

        /** Open the file picker; `mode` decides merge or replace. */
        function pickImport(mode) {
          importModeRef.current = mode;
          setMenuOpen(false);
          fileRef.current?.click?.();
        }

        /** Merge or replace from one picked JSON file. */
        async function importFile(event) {
          const file = event.target.files?.[0];
          event.target.value = '';
          setMenuOpen(false);
          if (file === undefined) return;
          const mode = importModeRef.current === 'replace' ? 'replace' : 'merge';
          let parsed;
          try {
            parsed = JSON.parse(await file.text());
          } catch (_error) {
            setError(t('status.importFailed'));
            return;
          }
          const runImport = async () => {
            const answer = await call('import', { document: parsed, mode });
            if (answer !== null) showToast({ text: t('toast.imported') });
          };
          if (mode === 'replace') {
            askConfirm({
              title: t('action.importReplace'),
              subject: file.name,
              message: t('confirm.importReplace'),
              confirmText: t('action.replace'),
              danger: true,
              onConfirm: () => void runImport(),
            });
            return;
          }
          await runImport();
        }

        /** Empty the trash after a confirmation. */
        function clearTrash() {
          setMenuOpen(false);
          if (counts.notesTrash + counts.cardsTrash === 0) return;
          askConfirm({
            title: t('action.clearTrash'),
            message: t('confirm.clearTrash'),
            confirmText: t('action.clearTrash'),
            danger: true,
            onConfirm: () => {
              void call('trash.clear');
              showToast({ text: t('toast.cleared') });
            },
          });
        }

        /** Ask for confirmation in the panel's own dialog. */
        function askConfirm(request) {
          setConfirmRequest(request);
        }

        /** Resolve the open confirmation request. */
        function resolveConfirm(accepted) {
          const pending = confirmRequest;
          setConfirmRequest(null);
          if (accepted === true && pending !== null && typeof pending.onConfirm === 'function') pending.onConfirm();
        }

        /** Delete one board from its tab, after confirmation. */
        function requestBoardDelete(board) {
          if (boards.length <= 1) return;
          askConfirm({
            title: t('action.deleteBoard'),
            subject: `「${board.title}」· ${board.cards ?? 0} ${t('status.cards')}`,
            message: t('confirm.deleteBoard'),
            confirmText: t('action.delete'),
            danger: true,
            onConfirm: () => {
              if (board.id === activeBoardId) setDrawerId(null);
              void call('board.remove', { id: board.id });
            },
          });
        }

        /** Fallback target for `Delete`: the card open in the drawer. */
        function deleteTarget() {
          if (drawerId !== null && drawerCard !== undefined) return { kind: 'card', id: drawerId };
          return null;
        }

        /** Move the selection (wall or board multi-selection) to the trash. */
        function deleteSelected() {
          if (noteSelection.size > 0) {
            const noteIds = [...noteSelection];
            clearNoteSelection();
            void call('note.trashMany', { noteIds });
            showToast({ text: `${t('toast.trashed')} · ${noteIds.length}`, undo: { noteIds, cardIds: [] } });
            return true;
          }
          if (cardSelection.size > 0) {
            const cardIds = [...cardSelection];
            clearCardSelection();
            void call('card.trashMany', { cardIds });
            showToast({ text: `${t('toast.trashed')} · ${cardIds.length}`, undo: { noteIds: [], cardIds } });
            return true;
          }
          const target = deleteTarget();
          if (target === null) return false;
          void call('card.remove', { id: target.id });
          if (drawerId === target.id) setDrawerId(null);
          showToast({ text: t('toast.trashed'), undo: { noteIds: [], cardIds: [target.id] } });
          return true;
        }

        /** Pin every selected note. */
        async function pinSelected() {
          const ids = [...noteSelection];
          if (ids.length === 0) return;
          for (const id of ids) await call('note.update', { id, patch: { pinned: true } });
          showToast({ text: `${t('action.pin')} · ${ids.length}` });
        }

        /** Turn every selected note into a task. */
        async function taskSelected() {
          const ids = [...noteSelection];
          if (ids.length === 0) return;
          clearNoteSelection();
          for (const id of ids) await call('note.toTask', { id });
          showToast({ text: `${t('toast.toTask')} · ${ids.length}` });
        }

        /** Toggle done on every selected card. */
        async function toggleDoneSelected() {
          const ids = [...cardSelection];
          if (ids.length === 0) return;
          const allDone = ids.every((id) => (allCards.find((card) => card.id === id)?.done ?? false) === true);
          for (const id of ids) await call('card.update', { id, patch: { done: !allDone } });
          showToast({ text: `${allDone ? t('action.undone') : t('action.done')} · ${ids.length}` });
        }

        /** Move every selected card to one column. */
        async function moveSelectedTo(onColumnId) {
          const ids = [...cardSelection];
          if (ids.length === 0 || onColumnId === '') return;
          clearCardSelection();
          for (const id of ids) await call('card.move', { id, columnId: onColumnId, toIndex: 9999 });
          showToast({ text: `${t('action.moveTo')} · ${ids.length}` });
        }

        /** Erase the selection for good, after a confirmation. */
        function purgeSelected() {
          if (noteSelection.size > 0) {
            const noteIds = [...noteSelection];
            askConfirm({
              title: t('action.purgeSelected'),
              subject: `${noteIds.length} ${t('label.items')}`,
              message: t('confirm.purgeSelected'),
              confirmText: t('action.purge'),
              danger: true,
              onConfirm: () => {
                clearNoteSelection();
                void (async () => {
                  for (const id of noteIds) await call('note.remove', { id, permanent: true });
                  showToast({ text: `${t('toast.purged')} · ${noteIds.length}` });
                })();
              },
            });
            return true;
          }
          if (cardSelection.size > 0) {
            const cardIds = [...cardSelection];
            askConfirm({
              title: t('action.purgeSelected'),
              subject: `${cardIds.length} ${t('label.items')}`,
              message: t('confirm.purgeSelected'),
              confirmText: t('action.purge'),
              danger: true,
              onConfirm: () => {
                clearCardSelection();
                void (async () => {
                  for (const id of cardIds) await call('card.remove', { id, permanent: true });
                  showToast({ text: `${t('toast.purged')} · ${cardIds.length}` });
                })();
              },
            });
            return true;
          }
          const target = deleteTarget();
          if (target === null) return false;
          askConfirm({
            title: t('action.purgeSelected'),
            subject: drawerCard === undefined ? '' : drawerCard.title,
            message: t('confirm.purgeSelected'),
            confirmText: t('action.purge'),
            danger: true,
            onConfirm: () => {
              if (drawerId === target.id) setDrawerId(null);
              void (async () => {
                await call('card.remove', { id: target.id, permanent: true });
                showToast({ text: t('toast.purged') });
              })();
            },
          });
          return true;
        }

        /** Recolor every selected note. */
        async function colorSelectedNotes(color) {
          const ids = [...noteSelection];
          if (ids.length === 0) return;
          setNotePaletteOpen(false);
          for (const id of ids) await call('note.update', { id, patch: { color } });
          showToast({ text: `${t('action.color')} · ${ids.length}` });
        }

        /** Scroll one rendered item into view (keyboard navigation). */
        function revealItem(selector) {
          rootRef.current?.querySelector(selector)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        }

        /** Arrow keys: move the selection inside the current view. */
        function moveSelectionBy(key) {
          if (view === 'wall') {
            const order = visibleNotes.map((note) => note.id);
            if (order.length === 0) return;
            const current = noteAnchorRef.current ?? [...noteSelection][0] ?? null;
            const at = current === null ? -1 : order.indexOf(current);
            const forward = key === 'ArrowRight' || key === 'ArrowDown';
            const next = at === -1 ? 0 : forward ? Math.min(order.length - 1, at + 1) : Math.max(0, at - 1);
            selectNote(order[next], undefined);
            revealItem(`[data-note-id="${order[next]}"]`);
            return;
          }
          const order = [...cardIdsByColumn.values()].flat();
          if (order.length === 0) return;
          const current = cardAnchorRef.current ?? [...cardSelection][0] ?? null;
          if (current === null) {
            selectCard(order[0]);
            revealItem(`[data-card-id="${order[0]}"]`);
            return;
          }
          const columnId = columnOfCard(current);
          if (columnId === null) return;
          const ids = cardIdsByColumn.get(columnId) ?? [];
          const at = ids.indexOf(current);
          if (key === 'ArrowUp' || key === 'ArrowDown') {
            const next = key === 'ArrowDown' ? Math.min(ids.length - 1, at + 1) : Math.max(0, at - 1);
            if (next === at) return;
            selectCard(ids[next]);
            revealItem(`[data-card-id="${ids[next]}"]`);
            return;
          }
          const columnIds = (board?.columns ?? []).map((column) => column.id);
          const position = columnIds.indexOf(columnId);
          const targetColumn = key === 'ArrowRight' ? columnIds[position + 1] : columnIds[position - 1];
          if (targetColumn === undefined) return;
          const targetIds = cardIdsByColumn.get(targetColumn) ?? [];
          if (targetIds.length === 0) return;
          const next = targetIds[Math.min(Math.max(at, 0), targetIds.length - 1)];
          selectCard(next);
          revealItem(`[data-card-id="${next}"]`);
        }

        /** Ctrl/Cmd+A: select every visible note, or every card of one column. */
        function selectAllVisible() {
          if (view === 'wall') {
            if (visibleNotes.length === 0) return;
            noteAnchorRef.current = visibleNotes[0].id;
            setNoteSelection(new Set(visibleNotes.map((note) => note.id)));
            return;
          }
          const current = cardAnchorRef.current ?? [...cardSelection][0] ?? null;
          const columnId = current === null ? null : columnOfCard(current);
          const ids = columnId === null ? [...cardIdsByColumn.values()].flat() : (cardIdsByColumn.get(columnId) ?? []);
          if (ids.length === 0) return;
          cardAnchorRef.current = ids[0];
          setCardSelection(new Set(ids));
        }

        /** Keyboard: Ctrl/Cmd+N, Ctrl/Cmd+F, arrows, Enter/Space, Delete, Escape. */
        function onKeyDown(event) {
          const mod = event.metaKey || event.ctrlKey;
          if (mod && event.key.toLowerCase() === 'n') {
            event.preventDefault();
            if (view === 'board') void newCard();
            else void newNote();
            return;
          }
          if (mod && event.key.toLowerCase() === 'f') {
            event.preventDefault();
            searchRef.current?.focus?.();
            return;
          }
          // Delete must never fire while the caret is inside a field.
          const target = event.target;
          const tag = typeof target?.tagName === 'string' ? target.tagName.toLowerCase() : '';
          const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable === true;
          if (mod && !typing && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            if (event.shiftKey) void redoHistory();
            else void undoHistory();
            return;
          }
          if (mod && !typing && event.key.toLowerCase() === 'y') {
            event.preventDefault();
            void redoHistory();
            return;
          }
          if (!typing && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
            event.preventDefault();
            moveSelectionBy(event.key);
            return;
          }
          if (!typing && event.key === 'Enter' && view === 'board' && cardSelection.size > 0) {
            event.preventDefault();
            setDrawerId(cardAnchorRef.current ?? [...cardSelection][0]);
            return;
          }
          if (!typing && (event.key === ' ' || event.key === 'Spacebar') && view === 'board' && cardSelection.size > 0) {
            event.preventDefault();
            void toggleDoneSelected();
            return;
          }
          if (mod && !typing && event.key.toLowerCase() === 'a') {
            event.preventDefault();
            selectAllVisible();
            return;
          }
          if (!typing && event.key === 'Delete' && (noteSelection.size > 0 || cardSelection.size > 0 || deleteTarget() !== null)) {
            event.preventDefault();
            if (event.shiftKey) void purgeSelected();
            else deleteSelected();
            return;
          }
          if (event.key === 'Escape') {
            if (confirmRequest !== null) {
              resolveConfirm(false);
              return;
            }
            if (menuOpen) {
              setMenuOpen(false);
              return;
            }
            if (moveMenuOpen) {
              setMoveMenuOpen(false);
              return;
            }
            if (notePaletteOpen) {
              setNotePaletteOpen(false);
              return;
            }
            if (filterOpen) {
              setFilterOpen(false);
              return;
            }
            if (noteSelection.size > 0) {
              clearNoteSelection();
              return;
            }
            if (cardSelection.size > 0) {
              clearCardSelection();
              return;
            }
            if (drawerId !== null) {
              setDrawerId(null);
              return;
            }
            if (editingId !== null) {
              setEditingId(null);
              return;
            }
            if (query !== '') setQuery('');
          }
        }

        if (data === null) {
          return h(
            'div',
            { className: 'sb-root', 'data-sb-scheme': scheme },
            offline
              ? h('div', { className: 'sb-error' }, t('status.offline'), h(Btn, { onClick: () => void load() }, t('action.retry')))
              : h('div', { className: 'sb-empty' }, t('status.loading')),
          );
        }

        const header = h(
          'div',
          { className: 'sb-bar' },
          h(
            'div',
            { className: 'sb-tabs' },
            h(
              'button',
              {
                type: 'button',
                className: 'sb-tab',
                'data-active': view === 'wall' && !trashMode ? 'true' : undefined,
                onClick: () => {
                  setView('wall');
                  setTrashMode(false);
                },
              },
              `${t('tab.wall')} ${counts.notes}`,
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'sb-tab',
                'data-active': view === 'board' && !trashMode ? 'true' : undefined,
                onClick: () => {
                  setView('board');
                  setTrashMode(false);
                },
              },
              `${t('tab.board')} ${counts.cards}`,
            ),
          ),
          h(Btn, { primary: true, onClick: () => void (view === 'board' ? newCard() : newNote()), disabled: trashMode }, `＋ ${view === 'board' ? t('action.newCard') : t('action.newNote')}`),
          view === 'wall' && !trashMode
            ? h(Btn, { onClick: tidyWall, title: t('action.tidy') }, t('action.tidy'))
            : null,
          view === 'wall' && !trashMode
            ? h(
                Btn,
                {
                  onClick: () => {
                    const order = ['auto', 'compact', 'cozy'];
                    const current = densityValue;
                    const next = order[(order.indexOf(current) + 1) % order.length];
                    void call('settings.update', { patch: { wallDensity: next } });
                  },
                  title: t('action.density'),
                },
                (densityValue === 'compact' ? t('density.compact') : densityValue === 'cozy' ? t('density.cozy') : t('density.auto')),
              )
            : null,
          view === 'wall' && !trashMode
            ? h(
                'div',
                { className: 'sb-menu-wrap', ref: wallFilterRef },
                h(
                  Btn,
                  { onClick: () => setWallFilterOpen((on) => !on), primary: colorFilterActive || wallFilterOpen, title: t('action.filter') },
                  wallFilterCount > 0 ? `${t('action.filter')} ${wallFilterCount}` : t('action.filter'),
                ),
                wallFilterOpen
                  ? h(
                      'div',
                      { className: 'sb-menu sb-filter' },
                      h('span', { className: 'sb-filter-title' }, t('label.color')),
                      h(
                        'div',
                        { className: 'sb-filter-row' },
                        COLOR_ORDER.map((color) =>
                          h('button', {
                            key: color,
                            type: 'button',
                            className: 'sb-swatch',
                            'data-on': noteColors.includes(color) ? 'true' : undefined,
                            style: { background: PAPERS[color] },
                            title: color,
                            onClick: () => toggleNoteColor(color),
                          }),
                        ),
                      ),
                      h(
                        'label',
                        { className: 'sb-filter-check' },
                        h('input', {
                          type: 'checkbox',
                          className: 'sb-check',
                          checked: pinnedOnly,
                          onChange: () => setPinnedOnly((on) => !on),
                        }),
                        h('span', null, t('label.pinnedOnly')),
                      ),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'sb-menu-item',
                          disabled: !colorFilterActive,
                          onClick: () => {
                            resetWallFilter();
                            setWallFilterOpen(false);
                          },
                        },
                        t('action.clearFilters'),
                      ),
                    )
                  : null,
              )
            : null,
          view === 'wall' && !trashMode && noteSelection.size > 0
            ? h(
                'div',
                { className: 'sb-selbar' },
                h('span', { className: 'sb-selcount' }, `${t('status.selected')} ${noteSelection.size}`),
                h(
                  'div',
                  { className: 'sb-menu-wrap', ref: notePaletteRef },
                  h(Btn, { onClick: () => setNotePaletteOpen((on) => !on), title: t('action.color') }, '●●'),
                  notePaletteOpen
                    ? h(Palette, {
                        current: '',
                        onPick: (color) => void colorSelectedNotes(color),
                        onClose: () => setNotePaletteOpen(false),
                      })
                    : null,
                ),
                h(Btn, { onClick: () => void pinSelected() }, t('action.pin')),
                h(Btn, { onClick: () => void taskSelected() }, t('action.toTask')),
                h(Btn, { danger: true, onClick: () => deleteSelected() }, t('action.delete')),
              )
            : null,
          view === 'board' && !trashMode && cardSelection.size > 0
            ? h(
                'div',
                { className: 'sb-selbar' },
                h('span', { className: 'sb-selcount' }, `${t('status.selected')} ${cardSelection.size}`),
                h(Btn, { onClick: () => void toggleDoneSelected() }, t('action.done')),
                h(
                  'div',
                  { className: 'sb-menu-wrap', ref: moveMenuRef },
                  h(Btn, { onClick: () => setMoveMenuOpen((on) => !on), title: t('action.moveTo') }, `${t('action.moveTo')} ▾`),
                  moveMenuOpen
                    ? h(
                        'div',
                        { className: 'sb-menu', style: { minWidth: '120px' } },
                        (board?.columns ?? []).map((column) =>
                          h('button', {
                            key: column.id,
                            type: 'button',
                            className: 'sb-menu-item',
                            onClick: () => {
                              setMoveMenuOpen(false);
                              void moveSelectedTo(column.id);
                            },
                          }, column.title),
                        ),
                      )
                    : null,
                ),
                h(Btn, { danger: true, onClick: () => deleteSelected() }, t('action.delete')),
              )
            : null,
          view === 'board' && !trashMode
            ? h(
                'div',
                { className: 'sb-menu-wrap', ref: filterRef },
                h(
                  Btn,
                  {
                    onClick: () => setFilterOpen((on) => !on),
                    primary: filtersActive || filterOpen,
                    title: t('action.filter'),
                  },
                  filtersActive ? `${t('action.filter')} ${filterCount}` : t('action.filter'),
                ),
                filterOpen
                  ? h(
                      'div',
                      { className: 'sb-menu sb-filter' },
                      h('span', { className: 'sb-filter-title' }, t('label.priority')),
                      h(
                        'div',
                        { className: 'sb-filter-row' },
                        PRIORITIES.map((priority) =>
                          h('button', {
                            key: priority,
                            type: 'button',
                            className: 'sb-pill',
                            'data-on': filters.priorities.includes(priority) ? 'true' : undefined,
                            style: { '--pill': PRIORITY_COLORS[priority] ?? PRIORITY_COLORS.P2 },
                            onClick: () => togglePriorityFilter(priority),
                          }, priority),
                        ),
                      ),
                      h(
                        'label',
                        { className: 'sb-filter-check' },
                        h('input', {
                          type: 'checkbox',
                          className: 'sb-check',
                          checked: filters.openOnly,
                          onChange: () => setFilters((current) => ({ ...current, openOnly: current.openOnly !== true })),
                        }),
                        h('span', null, t('label.openOnly')),
                      ),
                      h(
                        'label',
                        { className: 'sb-filter-check' },
                        h('input', {
                          type: 'checkbox',
                          className: 'sb-check',
                          checked: filters.overdueOnly,
                          onChange: () => setFilters((current) => ({ ...current, overdueOnly: current.overdueOnly !== true })),
                        }),
                        h('span', null, t('label.overdueOnly')),
                      ),
                      h(
                        'label',
                        { className: 'sb-filter-check' },
                        h('input', {
                          type: 'checkbox',
                          className: 'sb-check',
                          checked: filters.blockedOnly,
                          onChange: () => setFilters((current) => ({ ...current, blockedOnly: current.blockedOnly !== true })),
                        }),
                        h('span', null, t('label.blocked')),
                      ),
                      h('input', {
                        className: 'sb-input',
                        style: { fontSize: '11px', padding: '3px 7px' },
                        value: filters.label,
                        placeholder: t('placeholder.labelFilter'),
                        onChange: (event) => setFilters((current) => ({ ...current, label: event.target.value })),
                      }),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'sb-menu-item',
                          disabled: !filtersActive,
                          onClick: () => {
                            resetFilters();
                            setFilterOpen(false);
                          },
                        },
                        t('action.clearFilters'),
                      ),
                    )
                  : null,
              )
            : null,
          h('input', {
            ref: searchRef,
            className: 'sb-search',
            value: query,
            placeholder: t('placeholder.search'),
            onChange: (event) => setQuery(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Escape') setQuery('');
            },
          }),
          h(Btn, {
            onClick: () => setTrashMode((on) => !on),
            primary: trashMode,
          }, `${t('action.trash')} ${counts.notesTrash + counts.cardsTrash}`),
          h('span', { className: 'sb-spacer' }),
          h(
            'span',
            { className: 'sb-status' },
            offline
              ? t('status.offline')
              : `${t('status.saved')} ${clock(savedAt ?? data.updatedAt)} · ${counts.notes} ${t('status.notes')} / ${counts.cards} ${t('status.cards')}`,
          ),
          h(
            'div',
            { className: 'sb-menu-wrap', ref: menuRef },
            h(Btn, { onClick: () => setMenuOpen((on) => !on), title: t('action.menu') }, '⋯'),
            menuOpen
              ? h(
                  'div',
                  { className: 'sb-menu' },
                  h('button', {
                    type: 'button',
                    className: 'sb-menu-item',
                    onClick: () => {
                      setMenuOpen(false);
                      void undoHistory();
                    },
                  }, `${t('action.undo')}  Ctrl+Z`),
                  h('button', {
                    type: 'button',
                    className: 'sb-menu-item',
                    onClick: () => {
                      setMenuOpen(false);
                      void redoHistory();
                    },
                  }, `${t('action.redo')}  Ctrl+Shift+Z`),
                  h('button', { type: 'button', className: 'sb-menu-item', onClick: exportJson }, t('action.export')),
                  h('button', { type: 'button', className: 'sb-menu-item', onClick: () => pickImport('merge') }, t('action.importMerge')),
                  h('button', { type: 'button', className: 'sb-menu-item', onClick: () => pickImport('replace') }, t('action.importReplace')),
                  h('button', {
                    type: 'button',
                    className: 'sb-menu-item',
                    disabled: counts.notesTrash + counts.cardsTrash === 0,
                    onClick: clearTrash,
                  }, t('action.clearTrash')),
                )
              : null,
          ),
        );

        let body;
        if (trashMode) {
          body = h(TrashView, {
            notes,
            cards: allCards,
            call,
            askConfirm,
            onToast: (text) => showToast({ text }),
          });
        } else if (view === 'wall') {
          body = h(WallView, {
            notes: visibleNotes,
            wallRef,
            call,
            editingId,
            setEditingId,
            onConvert: convertNote,
            onNewNote: () => void newNote(),
            dragDisabled: needle !== '',
            selectedNotes: noteSelection,
            onSelectNote: selectNote,
            onClearNote: clearNoteSelection,
            onJump: jumpTo,
            flash,
          });
        } else {
          body = h(
            'div',
            { className: 'sb-boardwrap' },
            h(BoardTabs, { boards, activeId: activeBoardId, call, dragDisabled: needle !== '', onDelete: requestBoardDelete }),
            h(
              'div',
              { className: 'sb-stats' },
              (board?.columns ?? []).map((column) =>
                h('span', { key: column.id, className: 'sb-stat' }, `${column.title} ${counts.byColumn?.[column.id] ?? 0}`),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'sb-stat',
                  'data-on': filters.priorities.length > 0 ? 'true' : undefined,
                  onClick: () => setFilters((current) => ({ ...current, priorities: current.priorities.length > 0 ? [] : ['P0', 'P1'] })),
                },
                `${t('stats.priority')} ${statPriority}`,
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'sb-stat',
                  'data-on': filters.overdueOnly === true ? 'true' : undefined,
                  onClick: () => setFilters((current) => ({ ...current, overdueOnly: current.overdueOnly !== true })),
                },
                `${t('stats.overdue')} ${statOverdue}`,
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'sb-stat',
                  'data-on': filters.blockedOnly === true ? 'true' : undefined,
                  onClick: () => setFilters((current) => ({ ...current, blockedOnly: current.blockedOnly !== true })),
                },
                `${t('stats.blocked')} ${statBlocked}`,
              ),
            ),
            h(BoardView, {
              board,
              cards: shownCards,
              call,
              onOpen: setDrawerId,
              dragDisabled: needle !== '' || filtersActive,
              selectedCards: cardSelection,
              onSelectCard: selectCard,
              onJump: jumpTo,
              flash,
              askConfirm,
            }),
          );
        }

        const emptySearch = !trashMode && needle !== '' && visibleNotes.length === 0 && visibleCards.length === 0;

        return h(
          'div',
          { className: 'sb-root', ref: rootRef, tabIndex: -1, onKeyDown, 'data-sb-scheme': scheme, 'data-sb-density': densityValue },
          h('input', {
            ref: fileRef,
            type: 'file',
            accept: '.json,application/json',
            style: { display: 'none' },
            onChange: importFile,
          }),
          header,
          error !== null ? h('div', { className: 'sb-error' }, `${t('error.generic')}: ${error}`) : null,
          h(
            'div',
            { className: 'sb-body' },
            emptySearch ? h('div', { className: 'sb-empty' }, t('status.searchEmpty')) : body,
            drawerCard !== undefined ? h(CardDrawer, {
              card: drawerCard,
              notes,
              call,
              onClose: () => setDrawerId(null),
              onConvert: convertCard,
              onJump: jumpTo,
              onSync: syncLinked,
            }) : null,
          ),
          confirmRequest !== null ? h(ConfirmDialog, { request: confirmRequest, onResolve: resolveConfirm }) : null,
          toast !== null
            ? h(
                'div',
                { className: 'sb-toast', key: toast.nonce },
                h('span', { className: 'sb-toast-text' }, toast.text),
                toast.undo !== undefined
                  ? h('button', { type: 'button', className: 'sb-toast-action', onClick: () => void undoToast() }, t('action.undo'))
                  : null,
                h('button', {
                  type: 'button',
                  className: 'sb-toast-close',
                  title: t('action.close'),
                  onClick: () => {
                    window.clearTimeout(toastTimerRef.current);
                    setToast(null);
                  },
                }, '✕'),
              )
            : null,
          h(
            'div',
            { className: 'sb-bar', style: { borderTop: '1px solid var(--dsw-alias-border-l2,#232a36)', borderBottom: 0, height: 26 } },
            h('span', { className: 'sb-status sb-path', title: data.storePath }, `${t('status.path')}: ${data.storePath}`),
            noteSelection.size > 0
              ? h('span', { className: 'sb-status', style: { color: 'var(--sb-accent)' } }, noteSelection.size > 1 ? t('hint.multi') : t('hint.delete'))
              : cardSelection.size > 0
                ? h('span', { className: 'sb-status', style: { color: 'var(--sb-accent)' } }, cardSelection.size > 1 ? t('hint.multiCards') : t('hint.delete'))
                : null,
            h('span', { className: 'sb-spacer' }),
            h('span', { className: 'sb-status' }, `${counts.pinned} ${t('status.pinned')}`),
          ),
        );
      }

      /** The panel registered into the `main` slot: the app plus its boundary. */
      function Root() {
        return h(PanelBoundary, null, h(App));
      }

      return Root;
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ensureCss();

        const t = ctx.locale.bind(NS);
        ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'sticky-board: dictionaries');

        ctx.effect(
          () => ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: ID, locale: NS }, createApp(t, ctx))),
          'sticky-board: main panel',
        );

        ctx.effect(
          () =>
            ctx.slots.inject('sidebar.panellist', () =>
              ctx.slots.register(
                {
                  name: 'sidebar.panellist',
                  id: ID,
                  order: 16,
                  label: () => t('view.label'),
                  locale: NS,
                },
                SidebarIcon,
              ),
            ),
          'sticky-board: sidebar entry',
        );
      },
    };
  },
});
