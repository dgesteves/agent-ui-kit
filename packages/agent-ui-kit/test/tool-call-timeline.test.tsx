import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TOOL_STATES } from '../src/lib/ai';
import { ToolCallTimeline } from '../src/tool-call-timeline';
import { axe, dynamicToolPart, toolPart } from './utils';

const EXPECTED: Record<(typeof TOOL_STATES)[number], { phase: string; text: string }> = {
  'input-streaming': { phase: 'streaming', text: 'Preparing' },
  'input-available': { phase: 'running', text: 'Running' },
  'approval-requested': { phase: 'awaiting-approval', text: 'Needs approval' },
  'approval-responded': { phase: 'running', text: 'Running' },
  'output-available': { phase: 'success', text: 'Done' },
  'output-error': { phase: 'error', text: 'Failed' },
  'output-denied': { phase: 'denied', text: 'Denied' },
};

describe('ToolCallTimeline', () => {
  it.each(TOOL_STATES)('renders the %s state', (state) => {
    render(<ToolCallTimeline parts={[toolPart(state)]} />);
    const item = screen.getByRole('listitem');
    expect(item).toHaveAttribute('data-state', state);
    expect(item).toHaveAttribute('data-phase', EXPECTED[state].phase);
    expect(within(item).getByText(EXPECTED[state].text)).toBeInTheDocument();
    expect(within(item).getByText('Search docs')).toBeInTheDocument();
  });

  it('treats a denied approval response and preliminary output correctly', () => {
    render(
      <ToolCallTimeline
        parts={[
          toolPart('approval-responded', { toolCallId: 'a', approval: { id: 'x', approved: false } }),
          toolPart('output-available', { toolCallId: 'b', preliminary: true }),
        ]}
      />,
    );
    const [denied, partial] = screen.getAllByRole('listitem');
    expect(denied).toHaveAttribute('data-phase', 'denied');
    expect(partial).toHaveAttribute('data-phase', 'running');
  });

  it('supports dynamic tools', () => {
    render(<ToolCallTimeline parts={[dynamicToolPart()]} />);
    expect(screen.getByText('Mcp fetch')).toBeInTheDocument();
  });

  it('ignores non-tool parts and renders nothing without tools', () => {
    const { container } = render(<ToolCallTimeline parts={[{ type: 'text', text: 'hi' }]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('expands to show input and output, by mouse and keyboard', async () => {
    const user = userEvent.setup();
    render(<ToolCallTimeline parts={[toolPart('output-available')]} />);
    const trigger = screen.getByRole('button', { name: /search docs/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('group', { name: 'Input' })).toHaveTextContent('"query": "streaming ui"');
    expect(screen.getByRole('group', { name: 'Output' })).toHaveTextContent('"score": 0.92');
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard(' ');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('auto-expands failures and shows the error text', () => {
    render(<ToolCallTimeline parts={[toolPart('output-error')]} />);
    expect(screen.getByRole('button', { name: /search docs/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('ENOENT: no such file or directory')).toBeInTheDocument();
  });

  it('shows the denial reason', async () => {
    const user = userEvent.setup();
    render(<ToolCallTimeline parts={[toolPart('output-denied')]} />);
    await user.click(screen.getByRole('button', { name: /search docs/i }));
    expect(screen.getByText('Not on main')).toBeInTheDocument();
  });

  it('moves between calls with arrow keys, Home and End', async () => {
    const user = userEvent.setup();
    render(
      <ToolCallTimeline
        parts={[
          toolPart('output-available', { toolCallId: '1', toolName: 'search_docs' }),
          toolPart('output-available', { toolCallId: '2', toolName: 'read_file' }),
          toolPart('input-available', { toolCallId: '3', toolName: 'run_tests' }),
        ]}
      />,
    );
    const [first, second, third] = screen.getAllByRole('button');
    first!.focus();
    await user.keyboard('{ArrowDown}');
    expect(second).toHaveFocus();
    await user.keyboard('{End}');
    expect(third).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(first).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(third).toHaveFocus();
    await user.keyboard('{Home}');
    expect(first).toHaveFocus();
  });

  it('formats durations from provided timings, excluding approval wait', () => {
    render(
      <ToolCallTimeline
        parts={[toolPart('output-available')]}
        timings={{ 'call_output-available': { startedAt: 1_000, runningAt: 6_000, endedAt: 7_200 } }}
      />,
    );
    expect(screen.getByText('1.20s')).toBeInTheDocument();
  });

  it('uses tool metadata for labels, summaries and custom output', async () => {
    const user = userEvent.setup();
    render(
      <ToolCallTimeline
        parts={[toolPart('output-available')]}
        tools={{
          search_docs: {
            label: 'Search',
            summary: (input) => `“${(input as { query: string }).query}”`,
            renderOutput: () => <p>1 result</p>,
          },
        }}
      />,
    );
    expect(screen.getByText('Search')).toBeInTheDocument();
    expect(screen.getByText('“streaming ui”')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /search/i }));
    expect(screen.getByText('1 result')).toBeInTheDocument();
  });

  it('announces completions and failures politely', async () => {
    const { rerender } = render(<ToolCallTimeline parts={[toolPart('input-available', { toolCallId: 'c1' })]} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('');
    await act(async () => {
      rerender(<ToolCallTimeline parts={[toolPart('output-available', { toolCallId: 'c1' })]} />);
    });
    expect(status).toHaveTextContent(/^Search docs finished in \d+ milliseconds$/);
    await act(async () => {
      rerender(
        <ToolCallTimeline
          parts={[
            toolPart('output-available', { toolCallId: 'c1' }),
            toolPart('input-available', { toolCallId: 'c2', toolName: 'read_file' }),
          ]}
        />,
      );
    });
    await act(async () => {
      rerender(
        <ToolCallTimeline
          parts={[
            toolPart('output-available', { toolCallId: 'c1' }),
            toolPart('output-error', { toolCallId: 'c2', toolName: 'read_file' }),
          ]}
        />,
      );
    });
    expect(status).toHaveTextContent('Read file failed: ENOENT: no such file or directory');
  });

  it('does not invent durations for calls restored already settled', () => {
    render(<ToolCallTimeline parts={[toolPart('output-available')]} />);
    expect(screen.queryByText(/\d+ms|\d\.\d+s/)).not.toBeInTheDocument();
  });

  it('renders extra content under a call', () => {
    render(<ToolCallTimeline parts={[toolPart('approval-requested')]} renderExtra={() => <p>approve me</p>} />);
    expect(screen.getByText('approve me')).toBeInTheDocument();
  });

  it('has no axe violations, collapsed and expanded', async () => {
    const { container } = render(
      <ToolCallTimeline
        defaultExpanded={['call_output-available']}
        parts={TOOL_STATES.map((state) => toolPart(state, { toolCallId: `call_${state}` }))}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
