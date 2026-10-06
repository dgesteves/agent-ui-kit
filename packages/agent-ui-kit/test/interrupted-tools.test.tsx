import { act, render, screen } from '@testing-library/react';
import { Profiler } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentMessage } from '../src/agent-message';
import { ToolCallTimeline } from '../src/tool-call-timeline';
import { assistant, toolPart } from './utils';

/** The visible duration cell of the first call. */
const duration = () => document.querySelector('[data-slot="tool-call-trigger"] .w-12')?.textContent;

describe('calls that never settle because the run ended', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stop their clock and read "Stopped" once the run is no longer active', () => {
    const parts = [toolPart('input-available', { toolCallId: 'r', toolName: 'web_search' })];
    let commits = 0;
    const view = (active: boolean) => (
      <Profiler id="t" onRender={() => commits++}>
        <ToolCallTimeline parts={parts} active={active} announce={false} />
      </Profiler>
    );
    const { rerender } = render(view(true));
    act(() => vi.advanceTimersByTime(1_500));
    expect(screen.getByRole('button', { name: /Web search/ })).toHaveTextContent('Running');
    expect(duration()).toBe('1.50s');

    // stop(): useChat goes back to ready and the part stays input-available.
    rerender(view(false));
    expect(screen.getByRole('button', { name: /Web search/ })).toHaveTextContent('Stopped');
    expect(document.querySelector('[data-slot="tool-call"]')).toHaveAttribute('data-interrupted', 'true');
    const frozen = duration();
    const before = commits;
    act(() => vi.advanceTimersByTime(5_000));
    expect(duration()).toBe(frozen);
    expect(commits).toBe(before);
  });

  it('show no live clock for interrupted calls restored from history', () => {
    let commits = 0;
    render(
      <Profiler id="t" onRender={() => commits++}>
        <ToolCallTimeline
          parts={[toolPart('input-streaming', { toolCallId: 's' }), toolPart('input-available', { toolCallId: 'r' })]}
          active={false}
          announce={false}
        />
      </Profiler>,
    );
    const before = commits;
    act(() => vi.advanceTimersByTime(5_000));
    expect(commits).toBe(before);
    expect(screen.getAllByText('Stopped')).toHaveLength(2);
    expect(screen.queryByText(/\d+ms|\d\.\d+s/)).toBeNull();
  });

  it('keeps calls that wait on the user, or on the continuation after an approval, as they are', () => {
    // useChat renders `ready` with the approved part once before sendAutomaticallyWhen submits.
    render(
      <ToolCallTimeline
        parts={[
          toolPart('approval-requested', { toolCallId: 'a' }),
          toolPart('approval-responded', { toolCallId: 'b' }),
        ]}
        active={false}
        announce={false}
      />,
    );
    expect(screen.getByText('Needs approval')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.queryByText('Stopped')).toBeNull();
  });

  it('stops preliminary output that never completed', () => {
    render(
      <ToolCallTimeline
        parts={[toolPart('output-available', { preliminary: true })]}
        active={false}
        announce={false}
      />,
    );
    expect(screen.getByText('Stopped')).toBeInTheDocument();
  });

  it('is forwarded by AgentMessage', () => {
    render(<AgentMessage message={assistant([toolPart('input-available')])} active={false} />);
    expect(screen.getByText('Stopped')).toBeInTheDocument();
  });
});
