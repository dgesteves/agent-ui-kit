import { act, render, screen } from '@testing-library/react';
import type { ChatStatus, UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentStatus } from '../src/agent-status';
import { deriveAgentState } from '../src/lib/ai';
import { assistant, axe, toolPart } from './utils';

const LOCATE = { toolName: 'get_location', toolCallId: 'call_locate' };

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

  it('shows a stopped run with its time, announced politely', () => {
    const { container } = render(<AgentStatus state="stopped" elapsedMs={2_100} />);
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByRole('status')).toHaveTextContent('Stopped');
    expect(screen.getByRole('alert')).toHaveTextContent('');
    expect(screen.getByText('2.10s')).toBeInTheDocument();
    expect(container.firstChild).toHaveAttribute('data-state', 'stopped');
  });

  it('exposes the state for styling and has no axe violations', async () => {
    vi.useRealTimers();
    const { container } = render(
      <div>
        {(['idle', 'thinking', 'working', 'awaiting-approval', 'done', 'stopped', 'error'] as const).map((s) => (
          <AgentStatus key={s} state={s} announce={false} />
        ))}
      </div>,
    );
    expect(container.querySelectorAll('[data-state]')).toHaveLength(7);
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

  it('reads a run that ended with unfinished work as stopped, not done', () => {
    const ended = (parts: UIMessage['parts']) => deriveAgentState({ status: 'ready', message: assistant(parts) });
    // What stop() leaves behind: no end event arrives for the text, reasoning or call in progress.
    expect(ended([{ type: 'text', text: 'I will add the', state: 'streaming' }])).toEqual({ state: 'stopped' });
    expect(ended([{ type: 'reasoning', text: 'The route', state: 'streaming' }])).toEqual({ state: 'stopped' });
    expect(ended([toolPart('input-streaming')])).toEqual({ state: 'stopped' });
    expect(ended([{ type: 'text', text: 'Reading it.', state: 'done' }, toolPart('input-available')])).toEqual({
      state: 'stopped',
    });
    expect(ended([toolPart('output-available', { preliminary: true })])).toEqual({ state: 'stopped' });

    // Finished work is done, and so is an approved call waiting for useChat to send the continuation.
    expect(ended([{ type: 'text', text: 'Done.', state: 'done' }, toolPart('output-available')])).toEqual({
      state: 'done',
    });
    expect(ended([toolPart('approval-responded')])).toEqual({ state: 'done' });
    // In flight, the same parts are work in progress; a failure is an error.
    const half = assistant([{ type: 'text', text: 'I will add the', state: 'streaming' }]);
    expect(deriveAgentState({ status: 'streaming', message: half }).state).toBe('working');
    expect(deriveAgentState({ status: 'error', message: half }).state).toBe('error');
    // A client-side tool the app is waiting on is not stopped.
    const review = assistant([toolPart('input-available', { toolName: 'review_changes' })]);
    expect(deriveAgentState({ status: 'ready', message: review, pendingClientTools: ['review_changes'] }).state).toBe(
      'awaiting-approval',
    );
  });

  it('reads a client-side tool the app is running as working, and the same call cut off as stopped', () => {
    // onToolCall runs get_location in the app; useChat is `ready` until addToolOutput lands and
    // sendAutomaticallyWhen continues the run.
    const steps: Array<[ChatStatus, UIMessage['parts']]> = [
      ['streaming', [{ type: 'text', text: 'Finding you.', state: 'done' }, toolPart('input-streaming', LOCATE)]],
      ['ready', [{ type: 'text', text: 'Finding you.', state: 'done' }, toolPart('input-available', LOCATE)]],
      ['submitted', [{ type: 'text', text: 'Finding you.', state: 'done' }, toolPart('output-available', LOCATE)]],
    ];
    const states = steps.map(([status, parts]) =>
      deriveAgentState({ status, message: assistant(parts), clientTools: ['get_location'] }),
    );
    expect(states).toEqual([
      { state: 'working', detail: 'get_location' },
      { state: 'working', detail: 'get_location' },
      { state: 'thinking' },
    ]);

    // Without clientTools, a call left at input-available once the run is ready was cut off by stop().
    const waiting = assistant(steps[1]![1]);
    expect(deriveAgentState({ status: 'ready', message: waiting })).toEqual({ state: 'stopped' });
    // So is a client-side tool whose input never finished streaming.
    const cut = assistant([toolPart('input-streaming', LOCATE)]);
    expect(deriveAgentState({ status: 'ready', message: cut, clientTools: ['get_location'] })).toEqual({
      state: 'stopped',
    });
    // A tool that waits on a person is still a wait, not work.
    const review = assistant([toolPart('input-available', { toolName: 'review_changes' })]);
    expect(
      deriveAgentState({
        status: 'ready',
        message: review,
        pendingClientTools: ['review_changes'],
        clientTools: ['get_location'],
      }),
    ).toEqual({ state: 'awaiting-approval', detail: 'review_changes' });
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
