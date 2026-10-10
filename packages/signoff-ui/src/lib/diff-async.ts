import { parseFileChange, type FileChange, type ParsedFileDiff, type ParseFileChangeOptions } from './diff';
import type { DiffWorkerRequest, DiffWorkerResponse } from './diff-worker';

/** Starts a worker that answers `DiffReview`'s diff requests: see lib/diff-worker.ts. */
export type DiffWorkerFactory = () => Worker;

/**
 * The package's own worker. Webpack 5 (and so Next.js, with webpack or Turbopack), Vite and Parcel
 * see this `new URL(…, import.meta.url)` and emit the worker with its imports. Where nothing does,
 * the request for it fails and files are diffed on the main thread instead.
 */
export const defaultDiffWorker: DiffWorkerFactory = () =>
  new Worker(new URL('./diff-worker.ts', import.meta.url), { type: 'module' });

interface Pool {
  worker: Worker;
  /** Pending requests by id; `undefined` means the worker failed and the file is diffed here. */
  jobs: Map<number, (response: DiffWorkerResponse | undefined) => void>;
  idle?: ReturnType<typeof setTimeout> | undefined;
}

/** A worker with nothing to do for this long is stopped; the next large file starts another. */
const IDLE_MS = 30_000;

/** One worker per factory, started on the first large file, or `null` once it has failed. */
const pools = new Map<DiffWorkerFactory, Pool | null>();
let nextId = 0;

function poolFor(factory: DiffWorkerFactory): Pool | null {
  const existing = pools.get(factory);
  if (existing !== undefined) return existing;
  let pool: Pool | null = null;
  if (typeof Worker !== 'undefined') {
    try {
      const worker = factory();
      const started: Pool = { worker, jobs: new Map() };
      // The script did not load (no bundler emitted it, a content security policy blocks it) or
      // the worker crashed: stop using it, and diff what it was given on the main thread.
      const fail = () => {
        pools.set(factory, null);
        worker.terminate();
        const waiting = [...started.jobs.values()];
        started.jobs.clear();
        for (const done of waiting) done(undefined);
      };
      worker.addEventListener('message', (event: MessageEvent<DiffWorkerResponse>) => {
        const done = started.jobs.get(event.data.id);
        started.jobs.delete(event.data.id);
        done?.(event.data);
        if (started.jobs.size === 0) {
          clearTimeout(started.idle);
          started.idle = setTimeout(() => {
            if (started.jobs.size > 0 || pools.get(factory) !== started) return;
            pools.delete(factory);
            worker.terminate();
          }, IDLE_MS);
        }
      });
      worker.addEventListener('error', fail);
      worker.addEventListener('messageerror', fail);
      pool = started;
    } catch {
      pool = null;
    }
  }
  pools.set(factory, pool);
  return pool;
}

/** After the browser has painted, so the review shows its files before the main thread is busy. */
function onMainThread(change: FileChange, options: ParseFileChangeOptions): Promise<ParsedFileDiff> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(parseFileChange(change, options));
      } catch (error) {
        reject(error);
      }
    }, 0);
  });
}

/**
 * `parseFileChange` off the main thread: in the worker `factory` starts, or with `false` (or no
 * `Worker`, or a worker that fails) on the main thread after the next paint.
 */
export function parseInBackground(
  change: FileChange,
  options: ParseFileChangeOptions,
  factory: DiffWorkerFactory | false = defaultDiffWorker,
): Promise<ParsedFileDiff> {
  const pool = factory ? poolFor(factory) : null;
  if (!pool) return onMainThread(change, options);
  // Only the fields the diff reads: anything else on the object might not survive a structured clone.
  const { path, oldPath, oldContent, newContent, patch, language } = change;
  const request: DiffWorkerRequest = {
    id: ++nextId,
    change: { path, oldPath, oldContent, newContent, patch, language },
    options,
  };
  clearTimeout(pool.idle);
  return new Promise((resolve, reject) => {
    pool.jobs.set(request.id, (response) => {
      if (response && 'parsed' in response) resolve(response.parsed);
      else onMainThread(change, options).then(resolve, reject);
    });
    try {
      pool.worker.postMessage(request);
    } catch {
      pool.jobs.delete(request.id);
      onMainThread(change, options).then(resolve, reject);
    }
  });
}

/** Forget started workers, for tests. @internal */
export function resetDiffWorkers() {
  for (const pool of pools.values()) {
    clearTimeout(pool?.idle);
    pool?.worker.terminate();
  }
  pools.clear();
}
