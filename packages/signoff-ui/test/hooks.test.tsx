import { renderHook } from '@testing-library/react';
import type { ChatStatus } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRunTiming, type RunTimingMessage } from '../src/lib/hooks';

const user = (id: string): RunTimingMessage => ({ id, role: 'user' });
const reply = (id: string): RunTimingMessage => ({ id, role: 'assistant' });

describe('useRunTiming', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Drive the hook through `[status, at ms]` steps, as useChat would, with no second argument. */
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

  /** The same, with the chat's messages at each step. */
  function runWithMessages(steps: Array<[ChatStatus, number, RunTimingMessage[]]>) {
    const { result, rerender } = renderHook(({ status, messages }) => useRunTiming(status, messages), {
      initialProps: { status: 'ready' as ChatStatus, messages: [] as RunTimingMessage[] },
    });
    for (const [status, at, messages] of steps) {
      vi.setSystemTime(at);
      rerender({ status, messages });
    }
    return result.current;
  }

  /** The same, with a key of the caller's own. */
  function runWithKey(steps: Array<[ChatStatus, number, unknown]>) {
    const { result, rerender } = renderHook(({ status, key }) => useRunTiming(status, key), {
      initialProps: { status: 'ready' as ChatStatus, key: undefined as unknown },
    });
    for (const [status, at, key] of steps) {
      vi.setSystemTime(at);
      rerender({ status, key });
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

  it('times each turn on its own, with no second argument', () => {
    // Turn 1: TTFT 900ms, 3.9s active. Turn 2, after the user reads it: TTFT 200ms, 1.2s active.
    // Without a new run per turn, turn 2 showed turn 1's 900ms and the sum of both, 5.1s.
    const timing = run([
      ['submitted', 0],
      ['streaming', 900],
      ['ready', 3_900],
      ['submitted', 10_000],
      ['streaming', 10_200],
      ['ready', 11_200],
    ]);
    expect(timing.ttftMs).toBe(200);
    expect(timing.activeMs).toBe(1_200);
    expect(timing.startedAt).toBe(10_000);
  });

  it('starts a new run after an error, too', () => {
    const timing = run([
      ['submitted', 0],
      ['error', 500],
      ['submitted', 2_000],
      ['streaming', 2_300],
      ['ready', 3_000],
    ]);
    expect(timing.ttftMs).toBe(300);
    expect(timing.activeMs).toBe(1_000);
  });

  it('with the messages, spans approval round trips and starts a new run per user message', () => {
    const turn1 = [user('u1'), reply('a1')];
    const timing = runWithMessages([
      ['submitted', 1_000, [user('u1')]],
      // A non-streamed tool call that needs approval: the response arrives in one burst.
      ['ready', 1_300, turn1],
      // 10s later the user approves, and useChat continues the same message.
      ['submitted', 11_300, turn1],
      ['streaming', 11_350, turn1],
      ['ready', 11_600, turn1],
    ]);
    // The continuation after the approval wait counts neither toward TTFT nor active time.
    expect(timing.ttftMs).toBe(300);
    expect(timing.activeMs).toBe(300 + 300);

    const two = runWithMessages([
      ['submitted', 0, [user('u1')]],
      ['streaming', 900, turn1],
      ['ready', 3_900, turn1],
      ['submitted', 10_000, [...turn1, user('u2')]],
      ['streaming', 10_200, [...turn1, user('u2'), reply('a2')]],
      ['ready', 11_200, [...turn1, user('u2'), reply('a2')]],
    ]);
    expect(two.ttftMs).toBe(200);
    expect(two.activeMs).toBe(1_200);
  });

  it('with the messages, starts a new run when a reply is regenerated', () => {
    const timing = runWithMessages([
      ['submitted', 0, [user('u1')]],
      ['streaming', 900, [user('u1'), reply('a1')]],
      ['ready', 3_900, [user('u1'), reply('a1')]],
      // regenerate() drops the reply and submits the same user message again.
      ['submitted', 8_000, [user('u1')]],
      ['streaming', 8_400, [user('u1'), reply('a2')]],
      ['ready', 9_000, [user('u1'), reply('a2')]],
    ]);
    expect(timing.ttftMs).toBe(400);
    expect(timing.activeMs).toBe(1_000);
  });

  it('with the messages, has no time to first token for a request stopped before any reply', () => {
    const timing = runWithMessages([
      ['submitted', 0, [user('u1')]],
      ['ready', 700, [user('u1')]],
    ]);
    expect(timing.ttftMs).toBeUndefined();
    expect(timing.activeMs).toBe(700);
  });

  it('stamps the first token when a response arrives in one burst, not after the human wait', () => {
    // With a key of the caller's own, a run spans every request until the key changes.
    const timing = runWithKey([
      ['submitted', 1_000, 1],
      ['ready', 1_300, 1],
      ['submitted', 11_300, 1],
      ['streaming', 11_350, 1],
      ['ready', 11_600, 1],
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

  it('reports an unknown time to first token, not 0, when the run is already streaming when first seen', () => {
    // The playground's Replay changed its key while the stopped run was still streaming.
    const timing = runWithKey([
      ['submitted', 0, 1],
      ['streaming', 600, 1],
      ['streaming', 2_000, 2],
      ['ready', 2_500, 2],
    ]);
    expect(timing.ttftMs).toBeUndefined();
    expect(timing.firstTokenAt).toBeUndefined();
    expect(timing.activeMs).toBe(500);
  });

  it('never times a later request as the first token of the run', () => {
    // Mounted mid-stream: the continuation after an approval is not the run's first token either.
    const timing = runWithKey([
      ['streaming', 1_000, 1],
      ['ready', 1_500, 1],
      ['submitted', 9_000, 1],
      ['streaming', 9_200, 1],
      ['ready', 9_500, 1],
    ]);
    expect(timing.ttftMs).toBeUndefined();
    expect(timing.activeMs).toBe(500 + 500);
  });

  it('with the messages, times a replay from its own submission', () => {
    // Replay: the old run is still streaming when the messages are cleared, then the new prompt is
    // submitted. Keyed on a counter bumped by Replay, this showed a TTFT of 0ms.
    const timing = runWithMessages([
      ['submitted', 0, [user('u1')]],
      ['streaming', 600, [user('u1'), reply('a1')]],
      ['streaming', 2_000, []],
      ['submitted', 2_001, [user('u2')]],
      ['streaming', 2_601, [user('u2'), reply('a2')]],
      ['ready', 4_001, [user('u2'), reply('a2')]],
    ]);
    expect(timing.ttftMs).toBe(600);
    expect(timing.activeMs).toBe(2_000);
  });
});
