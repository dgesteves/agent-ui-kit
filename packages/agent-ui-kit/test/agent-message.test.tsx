import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { UIMessage } from 'ai';
import { AgentMessage } from '../src/agent-message';
import { assistant, axe, toolPart } from './utils';

const message = assistant([
  { type: 'step-start' },
  { type: 'reasoning', text: 'Check the route handler first.', state: 'done' },
  { type: 'text', text: 'Here is the plan:\n\n1. Read the route\n2. Add a limiter', state: 'done' },
  toolPart('output-available', { toolCallId: 't1', toolName: 'search_code' }),
  toolPart('output-error', { toolCallId: 't2', toolName: 'read_file' }),
  toolPart('approval-requested', {
    toolCallId: 't3',
    toolName: 'run_command',
    input: { command: 'pnpm add @upstash/ratelimit' },
  }),
  { type: 'text', text: 'Done. Sliding windows suit bursty chat traffic [1].', state: 'done' },
  { type: 'source-url', sourceId: 's1', url: 'https://upstash.com/docs/ratelimit', title: 'Upstash Ratelimit' },
]);

describe('AgentMessage', () => {
  it('renders text, reasoning, grouped tools and sources in order', () => {
    render(<AgentMessage message={message} />);
    const article = screen.getByRole('article');
    expect(within(article).getByText('Here is the plan:')).toBeInTheDocument();
    expect(within(article).getByRole('button', { name: /reasoning/i })).toHaveAttribute('aria-expanded', 'false');
    const timeline = within(article).getByRole('list', { name: 'Tool calls' });
    expect(
      within(timeline)
        .getAllByRole('listitem')
        .filter((li) => li.dataset.slot === 'tool-call'),
    ).toHaveLength(3);
    expect(within(article).getByRole('list', { name: 'Sources' })).toBeInTheDocument();
  });

  it('links inline citations to the message sources', () => {
    render(<AgentMessage message={message} />);
    expect(screen.getByRole('link', { name: 'Source 1' })).toHaveAttribute('href', '#msg_1-source-1');
    expect(document.getElementById('msg_1-source-1')).not.toBeNull();
  });

  it('renders inline approval cards wired to addToolApprovalResponse', async () => {
    const user = userEvent.setup();
    const onToolApproval = vi.fn();
    render(
      <AgentMessage message={message} onToolApproval={onToolApproval} tools={{ run_command: { risk: 'high' } }} />,
    );
    const card = screen.getByRole('region', { name: 'Run command' });
    expect(within(card).getByText('High risk')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: /^approve/i }));
    expect(onToolApproval).toHaveBeenCalledWith({ id: 'approval_t3', approved: true });
  });

  it('opens reasoning while it streams and marks the message busy', () => {
    const streaming = assistant([{ type: 'reasoning', text: 'Thinking about', state: 'streaming' }]);
    render(<AgentMessage message={streaming} streaming />);
    expect(screen.getByRole('article')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: /thinking/i })).toHaveAttribute('aria-expanded', 'true');
  });

  it('lets apps render tools and data parts themselves', () => {
    const custom = assistant([
      toolPart('output-available', { toolCallId: 'a', toolName: 'show_chart' }),
      toolPart('output-available', { toolCallId: 'b', toolName: 'read_file' }),
      { type: 'data-weather', id: 'w1', data: { city: 'Lisbon' } },
    ]);
    render(
      <AgentMessage
        message={custom}
        renderTool={(part) => (part.type === 'tool-show_chart' ? <p>chart!</p> : undefined)}
        renderData={(part) => <p>{(part.data as { city: string }).city}</p>}
      />,
    );
    expect(screen.getByText('chart!')).toBeInTheDocument();
    expect(screen.getByText('Lisbon')).toBeInTheDocument();
    expect(screen.getByText('Read file')).toBeInTheDocument();
  });

  it('accepts typed UIMessages', () => {
    type Typed = UIMessage<
      { usage: number },
      { weather: { city: string } },
      { read_file: { input: { path: string }; output: string } }
    >;
    const typed: Typed = {
      id: 'm',
      role: 'assistant',
      parts: [
        { type: 'tool-read_file', toolCallId: 'x', state: 'output-available', input: { path: 'a.ts' }, output: 'ok' },
      ],
    };
    render(<AgentMessage message={typed} />);
    expect(screen.getByText('a.ts')).toBeInTheDocument();
  });

  it('streams text and reasoning that end in a thematic break or an image', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <AgentMessage
        streaming
        message={assistant([
          { type: 'reasoning', text: 'look ![a](/a.png)', state: 'streaming' },
          { type: 'text', text: '## Summary\n\nDone.\n\n---\n', state: 'streaming' },
        ])}
      />,
    );
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
    expect(container.querySelector('hr')?.childNodes).toHaveLength(0);
    expect(container.querySelector('img')?.childNodes).toHaveLength(0);
  });

  it('has no axe violations', async () => {
    const { container } = render(<AgentMessage message={message} onToolApproval={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
