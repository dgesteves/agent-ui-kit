// How scripts/perf.mjs runs its cases so that a stuck browser fails the check in minutes, naming the
// case, instead of hanging until the CI job's clock runs out. Playwright bounds `waitForFunction`
// and navigation, but not `page.evaluate`, `page.close`, `browser.newPage` or `browser.close`: a
// renderer that stops answering stalls any of them for good. Here every case races its own
// deadline, and closing the browser races one too.

/** A browser the runner can throw away: `kill` must end it at once, without waiting on it. */
export interface Disposable {
  close(): Promise<unknown>;
  kill(): void;
}

export interface Case {
  label: string;
}

/** Thrown when something did not finish in time. */
export class Timeout extends Error {
  override name = 'Timeout';
}

/** `promise`, or a `Timeout` with `message` after `ms`. A rejection after the deadline is ignored. */
export function within<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  promise.catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Timeout(message)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/** Closes the browser, and kills it when that takes longer than `ms` (or fails). */
export async function dispose(browser: Disposable, ms: number): Promise<void> {
  try {
    await within(browser.close(), ms, `the browser did not close in ${ms / 1000} s`);
  } catch {
    browser.kill();
  }
}

export interface RunCasesOptions<B extends Disposable, C extends Case, R> {
  /** Starts a browser: at the start, and again after a case stalls. */
  launch(): Promise<B>;
  /** Runs one case. Whatever its page logs goes into `log`, to be printed if it fails. */
  run(browser: B, item: C, log: string[]): Promise<R>;
  /** How long one try at a case may take. */
  deadlineMs?: number;
  /** How long closing the browser may take before it is killed. */
  closeMs?: number;
  /** Whether an error means the browser is stuck, so the case is worth a try in a new one. */
  stalled?(error: unknown): boolean;
  /** Where a retry is announced. */
  warn?(message: string): void;
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));
const pageLog = (log: string[]) => (log.length ? log.map((line) => `\n  ${line}`).join('') : ' nothing');

/**
 * Runs `cases` in order, each against `deadlineMs`. A case that stalls (runs out of time, or fails
 * in a way `stalled` accepts) is tried once more in a new browser, the old one killed; a second
 * stall, or any other error, throws with the case's label and what its page logged. The browser is
 * closed at the end however the run went, and killed if closing it hangs.
 */
export async function runCases<B extends Disposable, C extends Case, R>(
  cases: readonly C[],
  {
    launch,
    run,
    deadlineMs = 120_000,
    closeMs = 10_000,
    stalled = (error) => error instanceof Timeout,
    warn = console.error,
  }: RunCasesOptions<B, C, R>,
): Promise<R[]> {
  const start = () => within(launch(), deadlineMs, `the browser did not start in ${deadlineMs / 1000} s`);
  const results: R[] = [];
  let browser = await start();
  try {
    for (const item of cases) {
      for (let attempt = 1; ; attempt++) {
        const log: string[] = [];
        try {
          results.push(await within(run(browser, item, log), deadlineMs, `no result after ${deadlineMs / 1000} s`));
          break;
        } catch (error) {
          const stuck = error instanceof Timeout || stalled(error);
          if (stuck && attempt === 1) {
            warn(
              `perf: ${item.label}: ${reason(error)}; trying it once more in a new browser. The page logged:${pageLog(log)}`,
            );
            browser.kill();
            browser = await start();
            continue;
          }
          const again = stuck ? ', the second time in a new browser' : '';
          throw new Error(`perf: ${item.label}: ${reason(error)}${again}. The page logged:${pageLog(log)}`, {
            cause: error,
          });
        }
      }
    }
  } finally {
    await dispose(browser, closeMs);
  }
  return results;
}
