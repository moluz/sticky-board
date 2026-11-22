/**
 * @local/sticky-board — host half.
 *
 * Owns the single source of truth for the wall and the board: one JSON
 * document under `$DSH_HOME/sticky-board/board.json`, exposed to the browser
 * through one authenticated Fetch route and to the model through the
 * `sticky_*` tools. Both callers share `lib/repository.js`.
 *
 * @module @local/sticky-board
 */

import os from 'node:os';
import path from 'node:path';

import { createRepository } from './lib/repository.js';
import { createRoute } from './lib/route.js';
import { createStore } from './lib/store.js';
import { createToolSpecs } from './lib/tools.js';

/** Bundle row id, also the panel key and the Client module id. */
export const name = 'sticky-board';

/** Host services this plugin reads. */
export const inject = ['tools', 'connection'];

/** Resolve the document path: `config.storePath` wins, else `$DSH_HOME/sticky-board/board.json`. */
function resolveStorePath(config) {
  if (typeof config?.storePath === 'string' && config.storePath.trim() !== '') {
    return path.resolve(config.storePath.trim());
  }
  const home = typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME !== ''
    ? process.env.DSH_HOME
    : path.join(os.homedir(), '.dsh');
  return path.join(home, 'sticky-board', 'board.json');
}

/**
 * Wire the store, the repository, the route and the tools.
 * @param ctx - Host plugin context.
 * @param config - the row's config (`storePath`).
 */
export function apply(ctx, config = {}) {
  const storePath = resolveStorePath(config);
  const store = createStore({ filePath: storePath, logger: ctx.logger });
  const repository = createRepository({ store });

  // Load once, eagerly, so the first panel request and the first tool call
  // both hit a warm document. A failure here is logged and retried by the
  // next call; it must not reject the plugin's activation.
  void store.ready.catch((error) => {
    ctx.logger?.warn?.(`sticky-board: 数据文件加载失败（${storePath}）：${String(error?.message ?? error)}`);
  });

  ctx.effect(
    () => ctx.connection.fetch.register(createRoute(repository)),
    'sticky-board: route',
  );

  ctx.effect(
    () => {
      const disposers = createToolSpecs(repository).map((spec) => ctx.tools.register(spec));
      return () => {
        for (const dispose of disposers) dispose();
      };
    },
    'sticky-board: tools',
  );

  ctx.logger?.info?.(`sticky-board: 便签墙 + 任务板已就绪，数据文件 ${storePath}`);
}
