import type { ToolCallMessagePartComponent, ToolCallMessagePartProps } from '@assistant-ui/react';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApprovalToolUI, ReviewToolUI, SignoffToolsProvider, signoffTools } from '../src/assistant-ui';
import type { reviewToolOutput } from '../src/lib/review';
import { useApprovalPolicy } from '../src/use-approval-policy';
import { axe } from './utils';

/*
 * signoff-ui/assistant-ui: the components assistant-ui's `MessagePrimitive.Parts` renders for a
 * tool call (`components.tools`), answering it with `addResult` and `respondToApproval`.
 */

const files = [
  { path: 'src/a.ts', oldContent: 'export const a = 1;\n', newContent: 'export const a = 2;\n' },
  { path: 'src/b.ts', oldContent: '', newContent: 'export const b = 1;\n' },
];

type Part = ToolCallMessagePartProps;

function call(overrides: Partial<Part> = {}): Part {
  return {
    type: 'tool-call',
    toolCallId: 'call_1',
    toolName: 'run_command',
    args: { command: 'pnpm add zod' },
    argsText: '{"command":"pnpm add zod"}',
    status: { type: 'requires-action', reason: 'tool-calls' },
    addResult: vi.fn(),
    resume: vi.fn(),
    respondToApproval: vi.fn(async () => {}),
    ...overrides,
  } as Part;
}

const gate = (approval: Partial<NonNullable<Part['approval']>> = {}) => ({ id: 'approval_1', ...approval });

describe('ReviewToolUI', () => {
  const review = (overrides: Partial<Part> = {}) =>
    call({ toolName: 'review_changes', args: { files }, argsText: JSON.stringify({ files }), ...overrides });

  it('waits for the files to finish streaming', () => {
    const { container } = render(<ReviewToolUI {...review({ status: { type: 'running' } })} />);
    expect(container).toBeEmptyDOMElement();
    render(<ReviewToolUI {...review({ args: {} })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('sends the review back as the call result, then shows it read-only', async () => {
    const user = userEvent.setup();
    const part = review();
    const { rerender } = render(<ReviewToolUI {...part} />);
    expect(screen.getAllByText(/src\/[ab]\.ts/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Accept all' }));
    await user.click(screen.getByRole('button', { name: /^Apply/ }));
    expect(part.addResult).toHaveBeenCalledOnce();
    const output = vi.mocked(part.addResult).mock.calls[0]![0] as ReturnType<typeof reviewToolOutput>;
    expect(output.summary).toBe('Applied 2 of 2 changes in 2 files.');
    expect(output.files.map((f) => [f.path, f.content])).toEqual([
      ['src/a.ts', 'export const a = 2;\n'],
      ['src/b.ts', 'export const b = 1;\n'],
    ]);
    rerender(<ReviewToolUI {...part} result={output} status={{ type: 'complete' }} />);
    expect(screen.queryByRole('button', { name: /^Apply/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Accept all' })).toBeNull();
  });

  it("takes DiffReview props and reviewToolOutput's options from the provider", async () => {
    const user = userEvent.setup();
    const part = review();
    render(
      <SignoffToolsProvider review={{ title: 'Proposed edit' }} output={{ contents: false }}>
        <ReviewToolUI {...part} />
      </SignoffToolsProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Proposed edit' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Accept all' }));
    await user.click(screen.getByRole('button', { name: /^Apply/ }));
    const output = vi.mocked(part.addResult).mock.calls[0]![0] as ReturnType<typeof reviewToolOutput>;
    expect(output.files[0]).not.toHaveProperty('content');
  });
});

describe('ApprovalToolUI', () => {
  it('answers the approval gate: approve, or deny with a reason', async () => {
    const user = userEvent.setup();
    const approving = call({ approval: gate({ prompt: 'Installs a package from npm.' }) });
    const { unmount } = render(<ApprovalToolUI {...approving} />);
    expect(screen.getByText('pnpm add zod')).toBeInTheDocument();
    expect(screen.getByText('Installs a package from npm.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Approve/ }));
    expect(approving.respondToApproval).toHaveBeenCalledWith({ approved: true });
    unmount();

    const denying = call({ approval: gate() });
    render(<ApprovalToolUI {...denying} />);
    await user.click(screen.getByRole('button', { name: 'Deny with feedback' }));
    await user.type(screen.getByRole('textbox'), 'Use npm');
    await user.keyboard('{Enter}');
    expect(denying.respondToApproval).toHaveBeenCalledWith({ approved: false, reason: 'Use npm' });
  });

  it('shows the decision once the runtime has recorded it', () => {
    const { rerender } = render(<ApprovalToolUI {...call({ approval: gate({ approved: true }) })} />);
    expect(screen.getByRole('group')).toHaveAttribute('data-status', 'approved');
    rerender(<ApprovalToolUI {...call({ approval: gate({ approved: false, reason: 'Not now' }) })} />);
    expect(screen.getByRole('group')).toHaveAttribute('data-status', 'denied');
    expect(screen.getByRole('group')).toHaveTextContent('Not now');
    rerender(
      <ApprovalToolUI
        {...call({ approval: gate({ approved: true }), result: { ok: true }, status: { type: 'complete' } })}
      />,
    );
    expect(screen.getByRole('group')).toHaveAttribute('data-status', 'approved');
  });

  it('renders nothing for a call with no gate, one that is not a plain decision, or one cancelled', () => {
    const { container, rerender } = render(<ApprovalToolUI {...call()} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<ApprovalToolUI {...call({ approval: gate({ display: 'select', options: [] }) })} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<ApprovalToolUI {...call({ approval: gate({ resolution: 'expired' }) })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('takes risk levels and card props from the provider, and has no axe violations', async () => {
    const { container } = render(
      <SignoffToolsProvider
        tools={{ run_command: { risk: 'high', label: 'Run a command' } }}
        approval={{ headingLevel: 2 }}
      >
        <ApprovalToolUI {...call({ approval: gate() })} />
      </SignoffToolsProvider>,
    );
    expect(screen.getByRole('group', { name: /Run a command/ })).toHaveTextContent(/high/i);
    expect(screen.getByRole('heading', { level: 2, name: 'Run a command' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('lets a rule answer the call once the run has paused for it, without showing a card', async () => {
    const policy = renderHook(() =>
      useApprovalPolicy({
        defaultRules: [
          { id: 'r', tool: 'run_command', args: { command: 'pnpm add *' }, effect: 'allow', scope: 'session' },
        ],
      }),
    ).result;
    await waitFor(() => expect(policy.current.ready).toBe(true));
    const running = call({ approval: gate(), status: { type: 'running' } });
    const { container, rerender } = render(
      <SignoffToolsProvider policy={policy.current}>
        <ApprovalToolUI {...running} />
      </SignoffToolsProvider>,
    );
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
    expect(running.respondToApproval).not.toHaveBeenCalled();

    const paused = { ...running, status: { type: 'requires-action', reason: 'tool-calls' } } as Part;
    rerender(
      <SignoffToolsProvider policy={policy.current}>
        <ApprovalToolUI {...paused} />
      </SignoffToolsProvider>,
    );
    await waitFor(() => expect(running.respondToApproval).toHaveBeenCalledWith({ approved: true }));
    expect(container).toBeEmptyDOMElement();
    rerender(
      <SignoffToolsProvider policy={policy.current}>
        <ApprovalToolUI {...paused} approval={gate({ approved: true })} />
      </SignoffToolsProvider>,
    );
    expect(screen.getByRole('group')).toHaveTextContent('Allowed by your rule');
    expect(running.respondToApproval).toHaveBeenCalledOnce();
  });

  it('tries an answer again while the runtime is still settling the run that asked', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const settling = call({
        approval: gate(),
        respondToApproval: vi
          .fn<Part['respondToApproval']>()
          .mockImplementationOnce(() => {
            throw new Error('Tried to respond to a tool approval while a run is in progress');
          })
          .mockResolvedValue(undefined),
      });
      render(<ApprovalToolUI {...settling} />);
      await user.click(screen.getByRole('button', { name: /^Approve/ }));
      await act(() => vi.advanceTimersByTimeAsync(100));
      expect(settling.respondToApproval).toHaveBeenCalledTimes(2);
      expect(settling.respondToApproval).toHaveBeenLastCalledWith({ approved: true });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('signoffTools', () => {
  it('maps the review tools to ReviewToolUI and every other call to the approval card', () => {
    const tools = signoffTools({ review: ['review_changes', 'propose_edit'] });
    expect(tools.by_name).toEqual({ review_changes: ReviewToolUI, propose_edit: ReviewToolUI });
    expect(tools.Fallback).toBe(ApprovalToolUI);
    expect(signoffTools()).toEqual({ by_name: {}, Fallback: ApprovalToolUI });
  });

  it('renders your Fallback for calls without a gate, and keeps one component per Fallback', () => {
    const Mine: ToolCallMessagePartComponent = ({ toolName }) => <p>my {toolName}</p>;
    const { Fallback } = signoffTools({ Fallback: Mine });
    expect(signoffTools({ Fallback: Mine }).Fallback).toBe(Fallback);
    const { rerender } = render(<Fallback {...call({ toolName: 'read_file' })} />);
    expect(screen.getByText('my read_file')).toBeInTheDocument();
    rerender(<Fallback {...call({ approval: gate() })} />);
    expect(screen.queryByText(/^my /)).toBeNull();
    expect(screen.getByRole('button', { name: /^Approve/ })).toBeInTheDocument();
  });
});
