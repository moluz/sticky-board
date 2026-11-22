// 便签墙 + 任务板：单 JSON 文档持久化。
// 职责：懒加载、串行写入、内容未变跳过、原子写（tmp + rename）、损坏文件备份重建、
// 内存内的多步撤销/重做栈（上限 historyLimit，重启即失效）。
// 只依赖 node:fs/promises、node:path 与 lib/model.js。

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { emptyDocument, normalizeDocument } from './model.js';

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 是否像一个文档（供 mutate 识别「返回新 doc」与「返回任意业务值」）。 */
function isDocumentLike(value) {
  return isPlainObject(value) && Array.isArray(value.notes) && Array.isArray(value.boards);
}

function serializeDocument(doc) {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/** 深拷贝一份文档，用于历史栈（文档本身是纯 JSON）。 */
function cloneDocument(doc) {
  return JSON.parse(JSON.stringify(doc));
}

/**
 * 创建文档 store。
 *
 * @param {object} options
 * @param {string} options.filePath 数据文件路径（支持相对路径，内部 resolve）
 * @param {{ warn?: (message: string) => void }} [options.logger] 可选日志器
 * @param {number} [options.historyLimit] 撤销栈深度，默认 30（0 关闭历史）
 * @returns {{
 *   path: string,
 *   ready: Promise<object>,
 *   snapshot: () => object,
 *   mutate: (fn: (doc: object) => any) => Promise<{ doc: object, changed: boolean, value: any }>,
 *   undo: () => Promise<{ doc: object, changed: boolean, value: any }>,
 *   redo: () => Promise<{ doc: object, changed: boolean, value: any }>,
 *   historyDepth: () => { past: number, future: number, limit: number },
 *   flush: () => Promise<void>,
 *   backupPath: () => string | null,
 *   revision: () => number,
 * }}
 */
export function createStore({ filePath, logger = undefined, historyLimit = 30 } = {}) {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new TypeError('createStore: filePath 必须是非空字符串');
  }

  const target = path.resolve(filePath);
  let doc = emptyDocument();
  let lastSerialized = null; // 上一次落盘（或加载时归一化后）的序列化文本
  let loading = null;
  let corruptPath = null;
  let tmpCounter = 0;
  let writeQueue = Promise.resolve();
  const limit = Number.isFinite(historyLimit) ? Math.max(0, Math.floor(historyLimit)) : 30;
  let past = [];
  let future = [];

  const warn = (message) => {
    try {
      logger?.warn?.(message);
    } catch {
      // 日志器抛错不应影响数据层
    }
  };

  async function fileExists(file) {
    try {
      await fs.access(file);
      return true;
    } catch {
      return false;
    }
  }

  /** 把损坏文件改名备份，返回备份路径。 */
  async function quarantineCorrupt() {
    const stamp = new Date().toISOString().replace(/:/g, '');
    let candidate = `${target}.corrupt-${stamp}`;
    let attempt = 1;
    while (await fileExists(candidate)) {
      candidate = `${target}.corrupt-${stamp}-${attempt}`;
      attempt += 1;
    }
    await fs.rename(target, candidate);
    corruptPath = candidate;
    return candidate;
  }

  async function loadDocument() {
    let text;
    try {
      text = await fs.readFile(target, 'utf8');
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        // 文件不存在：内存里用空文档初始化，但不立即写盘
        doc = emptyDocument();
        lastSerialized = serializeDocument(doc);
        return doc;
      }
      throw error;
    }

    let parsed;
    let parseFailed = false;
    try {
      parsed = JSON.parse(text);
    } catch {
      parseFailed = true;
    }

    if (parseFailed || !isPlainObject(parsed)) {
      const backup = await quarantineCorrupt();
      doc = emptyDocument();
      lastSerialized = serializeDocument(doc);
      warn(`[sticky-board] 数据文件解析失败，已备份到 ${backup}，使用空文档重建`);
      return doc;
    }

    doc = normalizeDocument(parsed);
    lastSerialized = serializeDocument(doc);
    return doc;
  }

  function ensureReady() {
    if (loading === null) {
      loading = loadDocument().catch((error) => {
        loading = null; // 允许后续重试
        throw error;
      });
    }
    return loading;
  }

  /** rename 覆盖目标；Windows 下 EPERM/EEXIST 时先删除目标再重试一次。 */
  async function renameOverwrite(from, to) {
    try {
      await fs.rename(from, to);
    } catch (error) {
      if (error && (error.code === 'EPERM' || error.code === 'EEXIST')) {
        await fs.rm(to, { force: true }).catch(() => {});
        await fs.rename(from, to);
        return;
      }
      throw error;
    }
  }

  /** 原子写：mkdir -p → 写 tmp → rename；失败清理 tmp 并抛出。 */
  async function writeDocument(text) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    tmpCounter += 1;
    const tmpPath = `${target}.tmp-${process.pid}-${tmpCounter}`;
    try {
      await fs.writeFile(tmpPath, text, 'utf8');
      await renameOverwrite(tmpPath, target);
    } catch (error) {
      await fs.rm(tmpPath, { force: true }).catch(() => {});
      throw error;
    }
  }

  /** 本地日历日的键，用来保证「每天最多一份快照」。 */
  function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  const BACKUP_KEEP = 7;

  /** 某一天的快照路径。 */
  function backupFileFor(day) {
    return target + '.bak-' + day;
  }

  /**
   * 写盘前做「每日快照」：当天还没有备份时复制当前文件，并只保留最近 7 份。
   * 数据文件不存在（首次运行）时跳过复制。
   */
  async function backupBeforeWrite(day) {
    const backupPath = backupFileFor(day);
    let hasToday = true;
    try {
      await fs.access(backupPath);
    } catch {
      hasToday = false;
    }
    if (!hasToday && (await fileExists(target))) {
      try {
        await fs.copyFile(target, backupPath);
      } catch (error) {
        warn('[sticky-board] 每日备份失败：' + error.message);
      }
    }

    let entries;
    try {
      entries = await fs.readdir(path.dirname(target));
    } catch {
      return;
    }
    const prefix = path.basename(target) + '.bak-';
    const snapshots = entries
      .filter((name) => name.startsWith(prefix) && /^\d{4}-\d{2}-\d{2}$/.test(name.slice(prefix.length)))
      .sort();
    while (snapshots.length > BACKUP_KEEP) {
      const oldest = snapshots.shift();
      await fs.rm(path.join(path.dirname(target), oldest), { force: true }).catch(() => {});
    }
  }

  /** 串到写队列上；前一个任务失败不阻断后续写入。 */
  function enqueue(task) {    const run = writeQueue.then(task);
    writeQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /**
   * 把一份历史文档落盘：归一化后 rev 在当前基础上 +1（保证轮询能识别变化），
   * 不触碰历史栈（由调用者决定 push/pop）。
   */
  async function persistHistory(next) {
    const normalized = normalizeDocument(next);
    const rev = (Number.isFinite(doc.rev) ? Math.floor(doc.rev) : 0) + 1;
    const updated = { ...normalized, rev, updatedAt: Date.now() };
    const text = serializeDocument(updated);
    await writeDocument(text);
    doc = updated;
    lastSerialized = text;
    return updated;
  }

  /**
   * 串行修改文档。fn 可原地修改 doc 并返回任意值，也可返回新的文档对象。
   * 内容与上次落盘一致时不写盘（changed=false）；否则 rev+1、updatedAt=now 后原子写，
   * 并把修改前的文档压入撤销栈（同时清空重做栈）。
   */
  function mutate(fn) {
    if (typeof fn !== 'function') {
      return Promise.reject(new TypeError('mutate: 需要一个函数'));
    }

    return enqueue(async () => {
      await ensureReady();
      const current = doc;
      // 历史快照必须在 fn 之前取：fn 常原地改 current，之后再克隆会拿到改后的内容。
      const before = limit > 0 ? cloneDocument(current) : null;
      const value = await fn(current);

      let next = current;
      if (value !== current && isDocumentLike(value)) {
        // fn 返回了新的文档对象：归一化后再落盘，保证文档不变量
        next = normalizeDocument(value);
      }

      // schema v3：每天首次写入前留一份快照，并把日期写进 settings。
      const day = localDateKey();
      const settings = isPlainObject(next.settings) ? next.settings : {};
      if (settings.lastBackupAt !== day) {
        await backupBeforeWrite(day);
        next.settings = { ...settings, lastBackupAt: day };
      }

      const previousText = lastSerialized;
      const candidateText = serializeDocument(next);
      if (previousText !== null && candidateText === previousText) {
        doc = next;
        return { doc: next, changed: false, value };
      }

      const rev = (Number.isFinite(next.rev) ? Math.floor(next.rev) : 0) + 1;
      const updated = { ...next, rev, updatedAt: Date.now() };
      const text = serializeDocument(updated);
      await writeDocument(text);
      doc = updated;
      lastSerialized = text;
      if (before !== null) {
        past.push(before);
        if (past.length > limit) past.shift();
      }
      future = [];
      return { doc: updated, changed: true, value };
    });
  }

  /** 撤销上一步写入：恢复上一版文档（rev 继续前进），并把当前版本压入重做栈。 */
  function undo() {
    return enqueue(async () => {
      await ensureReady();
      if (past.length === 0) return { doc, changed: false, value: null };
      const previous = past.pop();
      future.push(cloneDocument(doc));
      if (future.length > limit) future.shift();
      const updated = await persistHistory(previous);
      return { doc: updated, changed: true, value: updated };
    });
  }

  /** 重做最近一次撤销。 */
  function redo() {
    return enqueue(async () => {
      await ensureReady();
      if (future.length === 0) return { doc, changed: false, value: null };
      const next = future.pop();
      past.push(cloneDocument(doc));
      if (past.length > limit) past.shift();
      const updated = await persistHistory(next);
      return { doc: updated, changed: true, value: updated };
    });
  }

  async function flush() {
    await ensureReady();
    await writeQueue;
  }

  return {
    path: target,
    get ready() {
      return ensureReady();
    },
    snapshot() {
      ensureReady();
      return doc;
    },
    mutate,
    undo,
    redo,
    historyDepth() {
      return { past: past.length, future: future.length, limit };
    },
    flush,
    backupPath() {
      ensureReady();
      return corruptPath;
    },
    revision() {
      ensureReady();
      return Number.isFinite(doc.rev) ? doc.rev : 0;
    },
  };
}
