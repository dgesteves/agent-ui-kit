import { renderHook } from '@testing-library/react';
import type { ChatStatus } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRunTiming } from '../src/lib/hooks';

describe('useRunTiming', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Drive the hook through `[status, at ms]` steps, as useChat would. */
  function run(steps: Array<[ChatStatus, number]>) {
    const { result, rerender } = renderHook(({ status }) => useRunTiming(status), {
      initialProps: { status: 'ready' as ChatStatus },
    });
    for (const [status, at] of steps) {
      vi.setSystemTime(at);
      rerender({ status });
    }
    return result.current;
  }

  it('measures time to first token from submit to the first streamed status', () => {
    const timing = run([
      ['submitted', 1_000],
      ['streaming', 1_600],
      ['ready', 2_000],
    ]);
    expect(timing.ttftMs).toBe(600);
    expect(timing.activeMs).toBe(1_000);
  });

  it('stamps the first token when a response arrives in one burst, not after the human wait', () => {
    // useChat can go submitted -> ready without rendering `streaming` (e.g. a non-streamed tool call
    // that needs approval). The continuation after a 10s approval wait must not count toward TTFT.
    const timing = run([
      ['submitted', 1_000],
      ['ready', 1_300],
      ['submitted', 11_300],
      ['streaming', 11_350],
      ['ready', 11_600],
    ]);
    expect(timing.ttftMs).toBe(300);
    expect(timing.activeMs).toBe(300 + 300);
  });

  it('reports no time to first token for a request that failed before any token', () => {
    expect(
      run([
        ['submitted', 1_000],
        ['error', 1_500],
      ]).ttftMs,
    ).toBeUndefined();
  });
});
