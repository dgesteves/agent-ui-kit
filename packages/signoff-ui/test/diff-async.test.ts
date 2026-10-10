import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseFileChange } from '../src/lib/diff';
import { defaultDiffWorker, parseInBackground, resetDiffWorkers } from '../src/lib/diff-async';
import { answerDiffRequest, type DiffWorkerRequest } from '../src/lib/diff-worker';

type Mode = 'answer' | 'fail-to-load' | 'refuse-message';

/** A Worker that runs the diff worker's handler in this thread, or fails the way real ones do. */
class FakeWorker extends EventTarget {
  static mode: Mode = 'answer';
  static started: FakeWorker[] = [];
  readonly url: string;
  received: DiffWorkerRequest[] = [];
  terminated = false;
  constructor(
    url: URL | string,
    readonly options?: WorkerOptions,
  ) {
    super();
    this.url = String(url);
    FakeWorker.started.push(this);
    if (FakeWorker.mode === 'fail-to-load') setTimeout(() => this.dispatchEvent(new Event('error')), 0);
  }
  postMessage(request: DiffWorkerRequest) {
    if (FakeWorker.mode === 'refuse-message') throw new DOMException('could not be cloned', 'DataCloneError');
    this.received.push(request);
    if (FakeWorker.mode !== 'answer') return;
    setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: answerDiffRequest(request) })), 0);
  }
  terminate() {
    this.terminated = true;
  }
}

const change = { path: 'a.ts', oldContent: 'a\nb\n', newContent: 'a\nB\n' };
const factory = () => new FakeWorker('test-worker') as unknown as Worker;

describe('parseInBackground', () => {
  beforeEach(() => {
    FakeWorker.mode = 'answer';
    FakeWorker.started = [];
    vi.stubGlobal('Worker', FakeWorker);
  });
  afterEach(() => {
    resetDiffWorkers();
    vi.unstubAllGlobals();
  });

  it('diffs in the worker and resolves with what parseFileChange returns', async () => {
    const parsed = await parseInBackground(change, { id: 'x', context: 1 }, factory);
    expect(parsed).toEqual(parseFileChange(change, { id: 'x', context: 1 }));
    expect(FakeWorker.started).toHaveLength(1);
    expect(FakeWorker.started[0]!.received[0]).toMatchObject({ change, options: { id: 'x', context: 1 } });
  });

  it('starts one worker per factory and reuses it', async () => {
    await Promise.all([parseInBackground(change, {}, factory), parseInBackground(change, {}, factory)]);
    await parseInBackground(change, {}, factory);
    expect(FakeWorker.started).toHaveLength(1);
    expect(FakeWorker.started[0]!.received).toHaveLength(3);
  });

  it('sends only the fields the diff reads, so extra ones cannot break the structured clone', async () => {
    await parseInBackground({ ...change, onOpen: () => {} } as typeof change, {}, factory);
    expect(Object.keys(FakeWorker.started[0]!.received[0]!.change).sort()).toEqual(
      ['language', 'newContent', 'oldContent', 'oldPath', 'patch', 'path'].sort(),
    );
  });

  it('diffs on the main thread when the worker fails to load, then stops using it', async () => {
    FakeWorker.mode = 'fail-to-load';
    const pending = parseInBackground(change, {}, factory);
    expect(await pending).toEqual(parseFileChange(change));
    expect(FakeWorker.started[0]!.terminated).toBe(true);
    FakeWorker.mode = 'answer';
    expect(await parseInBackground(change, {}, factory)).toEqual(parseFileChange(change));
    expect(FakeWorker.started).toHaveLength(1);
  });

  it('diffs on the main thread when a request cannot be sent', async () => {
    FakeWorker.mode = 'refuse-message';
    expect(await parseInBackground(change, {}, factory)).toEqual(parseFileChange(change));
  });

  it('diffs on the main thread when the worker reports an error', async () => {
    const answering = vi.spyOn(FakeWorker.prototype, 'postMessage').mockImplementation(function (
      this: FakeWorker,
      request: DiffWorkerRequest,
    ) {
      setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: { id: request.id, error: 'boom' } })));
    });
    expect(await parseInBackground(change, {}, factory)).toEqual(parseFileChange(change));
    answering.mockRestore();
  });

  it('diffs on the main thread, after a paint, with `false` or without Worker', async () => {
    const timers = vi.spyOn(globalThis, 'setTimeout');
    expect(await parseInBackground(change, {}, false)).toEqual(parseFileChange(change));
    expect(timers).toHaveBeenCalled();
    vi.unstubAllGlobals();
    expect(await parseInBackground(change, {}, factory)).toEqual(parseFileChange(change));
    expect(FakeWorker.started).toHaveLength(0);
    timers.mockRestore();
  });

  it('starts the package worker as a module, from a URL next to this one', () => {
    defaultDiffWorker();
    const [worker] = FakeWorker.started;
    // Vite, which runs these tests, already rewrites it into a worker of its own.
    expect(worker!.url).toContain('/lib/diff-worker.ts');
    expect(worker!.options).toEqual({ type: 'module' });
  });

  it('stops a worker left idle for 30 seconds, and starts another for the next file', async () => {
    vi.useFakeTimers();
    try {
      const first = parseInBackground(change, {}, factory);
      await vi.advanceTimersByTimeAsync(1);
      await first;
      await vi.advanceTimersByTimeAsync(29_000);
      expect(FakeWorker.started[0]!.terminated).toBe(false);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(FakeWorker.started[0]!.terminated).toBe(true);
      const second = parseInBackground(change, {}, factory);
      await vi.advanceTimersByTimeAsync(1);
      await second;
    } finally {
      vi.useRealTimers();
    }
    expect(FakeWorker.started).toHaveLength(2);
  });

  it('keeps a worker that gets more work before it goes idle', async () => {
    vi.useFakeTimers();
    try {
      const first = parseInBackground(change, {}, factory);
      await vi.advanceTimersByTimeAsync(1);
      await first;
      await vi.advanceTimersByTimeAsync(20_000);
      const next = parseInBackground(change, {}, factory);
      await vi.advanceTimersByTimeAsync(1);
      await next;
      await vi.advanceTimersByTimeAsync(20_000);
      expect(FakeWorker.started[0]!.terminated).toBe(false);
    } finally {
      vi.useRealTimers();
    }
    expect(FakeWorker.started).toHaveLength(1);
  });

  it('rejects when the main thread cannot parse either', async () => {
    const bad = { path: 'x.ts', patch: '@@ -1 +1 @@\n?nonsense\n' };
    await expect(parseInBackground(bad, {}, false)).rejects.toThrow();
  });
});

describe('answerDiffRequest', () => {
  it('answers with the parsed file, or with the error', () => {
    expect(answerDiffRequest({ id: 1, change, options: {} })).toEqual({ id: 1, parsed: parseFileChange(change) });
    const bad = { path: 'x.ts', patch: '@@ -1 +1 @@\n?nonsense\n' };
    expect(answerDiffRequest({ id: 2, change: bad, options: {} })).toMatchObject({ id: 2, error: expect.any(String) });
  });
});
