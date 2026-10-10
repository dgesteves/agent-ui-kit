/**
 * The diff worker. `DiffReview` diffs a small file while it renders and sends a larger one here, so
 * the page keeps responding while it is compared. It is started from
 * `new URL('./diff-worker.ts', import.meta.url)`, which bundlers with worker support emit as a
 * worker of its own (lib/diff-async.ts).
 */
import { parseFileChange, type FileChange, type ParsedFileDiff, type ParseFileChangeOptions } from './diff';

export interface DiffWorkerRequest {
  id: number;
  change: FileChange;
  options: ParseFileChangeOptions;
}

export type DiffWorkerResponse = { id: number; parsed: ParsedFileDiff } | { id: number; error: string };

/** What the worker answers a request with. */
export function answerDiffRequest(request: DiffWorkerRequest): DiffWorkerResponse {
  try {
    return { id: request.id, parsed: parseFileChange(request.change, request.options) };
  } catch (error) {
    return { id: request.id, error: error instanceof Error ? error.message : String(error) };
  }
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<DiffWorkerRequest>) => void) | null;
  postMessage(message: DiffWorkerResponse): void;
}

// Answer requests when running as a worker; imported anywhere else, as in tests, do nothing.
const scope = globalThis as unknown as WorkerScope & { WorkerGlobalScope?: new () => unknown };
if (typeof scope.WorkerGlobalScope === 'function' && scope instanceof scope.WorkerGlobalScope) {
  scope.onmessage = (event) => scope.postMessage(answerDiffRequest(event.data));
}
