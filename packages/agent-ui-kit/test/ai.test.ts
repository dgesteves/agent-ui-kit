import { getToolName, isToolUIPart } from 'ai';
import { describe, expect, it } from 'vitest';
import {
  getSourceParts,
  getToolPartName,
  getToolPhase,
  isToolPart,
  observeToolTimings,
  TOOL_STATES,
} from '../src/lib/ai';
import { dynamicToolPart, toolPart } from './utils';

describe('AI SDK part helpers', () => {
  it('agree with the SDK runtime helpers', () => {
    const parts = [
      toolPart('output-available', { toolName: 'read_file' }),
      dynamicToolPart(),
      { type: 'text' as const, text: 'x' },
    ];
    for (const part of parts) {
      expect(isToolPart(part)).toBe(isToolUIPart(part));
      if (isToolPart(part)) expect(getToolPartName(part)).toBe(getToolName(part));
    }
  });

  it('maps every v7 tool state to a phase', () => {
    const phases = TOOL_STATES.map((s) => getToolPhase(toolPart(s)));
    expect(phases).toEqual(['streaming', 'running', 'awaiting-approval', 'running', 'success', 'error', 'denied']);
  });

  it('de-duplicates sources by url', () => {
    const s = { type: 'source-url' as const, sourceId: 'a', url: 'https://x.dev' };
    expect(getSourceParts([s, { ...s, sourceId: 'b' }, { type: 'text', text: '' }])).toHaveLength(1);
  });
});

describe('observeToolTimings', () => {
  it('records start, execution start and end; keeps identity when nothing changes', () => {
    const t0 = observeToolTimings({}, [toolPart('input-streaming', { toolCallId: 'a' })], 100);
    expect(t0.a).toEqual({ startedAt: 100, runningAt: undefined });
    const t1 = observeToolTimings(t0, [toolPart('approval-requested', { toolCallId: 'a' })], 200);
    expect(t1).toBe(t0);
    const t2 = observeToolTimings(t1, [toolPart('approval-responded', { toolCallId: 'a' })], 5_000);
    expect(t2.a).toEqual({ startedAt: 100, runningAt: 5_000 });
    const t3 = observeToolTimings(t2, [toolPart('output-available', { toolCallId: 'a' })], 6_200);
    expect(t3.a).toEqual({ startedAt: 100, runningAt: 5_000, endedAt: 6_200 });
  });

  it('does not time calls first seen already settled', () => {
    expect(observeToolTimings({}, [toolPart('output-available', { toolCallId: 'z' })], 1).z).toEqual({});
  });
});
