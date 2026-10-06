import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentStatus } from '../src/agent-status';
import { deriveAgentState } from '../src/lib/ai';
import { assistant, axe, toolPart } from './utils';

describe('AgentStatus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders the label, detail and elapsed time', () => {
    render(<AgentStatus state="working" detail="read_file" elapsedMs={3_400} announce={false} />);
    expect(screen.getByText('Working')).toBeInTheDocument();
    expect(screen.getByText('read_file')).toBeInTheDocument();
    expect(screen.getByText('3.40s')).toBeInTheDocument();
  });

  it('announces state changes politely, debounced', () => {
    const { rerender } = render(<AgentStatus state="thinking" />);
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByRole('status')).toHaveTextContent('Thinking');
    rerender(<AgentStatus state="working" detail="search_docs" />);
    rerender(<AgentStatus state="thinking" />);
    rerender(<AgentStatus state="working" detail="read_file" />);
    act(() => vi.advanceTimersByTime(100));
    // Rapid flips are not announced individually.
    expect(screen.getByRole('status')).toHaveTextContent('Thinking');
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByRole('status')).toHaveTextContent('Working: read_file');
  });

  it('announces approval requests and errors assertively', () => {
    const { rerender } = render(<AgentStatus state="awaiting-approval" detail="run_command" />);
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByRole('alert')).toHaveTextContent('Waiting for approval: run_command');
    expect(screen.getByRole('status')).toHaveTextContent('');
    rerender(<AgentStatus state="error" label="Model overloaded" />);
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByRole('alert')).toHaveTextContent('Model overloaded');
  });

  it('exposes the state for styling and has no axe violations', async () => {
    vi.useRealTimers();
    const { container } = render(
      <div>
        {(['idle', 'thinking', 'working', 'awaiting-approval', 'done', 'error'] as const).map((s) => (
          <AgentStatus key={s} state={s} announce={false} />
        ))}
      </div>,
    );
    expect(container.querySelectorAll('[data-state]')).toHaveLength(6);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('deriveAgentState', () => {
  it('maps chat status and message parts to an agent state', () => {
    expect(deriveAgentState({ status: 'ready' })).toEqual({ state: 'idle' });
    expect(deriveAgentState({ status: 'submitted' })).toEqual({ state: 'thinking' });
    expect(deriveAgentState({ status: 'error' })).toEqual({ state: 'error' });
    expect(
      deriveAgentState({
        status: 'streaming',
        message: assistant([{ type: 'reasoning', text: 'hmm', state: 'streaming' }]),
      }),
    ).toEqual({ state: 'thinking' });
    expect(
      deriveAgentState({
        status: 'streaming',
        message: assistant([toolPart('input-available', { toolName: 'read_file' })]),
      }),
    ).toEqual({
      state: 'working',
      detail: 'read_file',
    });
    expect(deriveAgentState({ status: 'streaming', message: assistant([{ type: 'text', text: 'Hi' }]) })).toEqual({
      state: 'working',
      detail: 'Writing response',
    });
    expect(deriveAgentState({ status: 'ready', message: assistant([{ type: 'text', text: 'Hi' }]) })).toEqual({
      state: 'done',
    });
  });

  it('prioritises human-in-the-loop waits', () => {
    const message = assistant([toolPart('approval-requested', { toolName: 'run_command' })]);
    expect(deriveAgentState({ status: 'ready', message })).toEqual({
      state: 'awaiting-approval',
      detail: 'run_command',
    });
    const review = assistant([toolPart('input-available', { toolName: 'review_changes' })]);
    expect(deriveAgentState({ status: 'ready', message: review, pendingClientTools: ['review_changes'] })).toEqual({
      state: 'awaiting-approval',
      detail: 'review_changes',
    });
  });
});
