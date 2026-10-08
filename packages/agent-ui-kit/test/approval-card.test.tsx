import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApprovalCard, ToolApprovalCard, type ApprovalStatus } from '../src/approval-card';
import { axe, collectErrors, toolPart } from './utils';

const command = { command: 'pnpm add @upstash/ratelimit', cwd: '~/app' };

function setup(props: Partial<Parameters<typeof ApprovalCard>[0]> = {}) {
  const onApprove = vi.fn();
  const onDeny = vi.fn();
  const user = userEvent.setup();
  const utils = render(
    <ApprovalCard
      toolName="run_command"
      input={command}
      risk="high"
      onApprove={onApprove}
      onDeny={onDeny}
      {...props}
    />,
  );
  return { ...utils, user, onApprove, onDeny, card: screen.getByRole('region', { name: /run command/i }) };
}

describe('ApprovalCard', () => {
  it('shows the action, risk and a command preview', () => {
    setup({ description: 'Adds a dependency' });
    expect(screen.getByRole('heading', { name: 'Run command' })).toBeInTheDocument();
    expect(screen.getByText('High risk')).toBeInTheDocument();
    expect(screen.getByText('pnpm add @upstash/ratelimit')).toBeInTheDocument();
    expect(screen.getByText('~/app')).toBeInTheDocument();
    expect(screen.getByRole('region')).toHaveAccessibleDescription(/Adds a dependency/);
  });

  it('approves and denies with the mouse', async () => {
    const approving = setup();
    await approving.user.click(screen.getByRole('button', { name: /^approve/i }));
    expect(approving.onApprove).toHaveBeenCalledTimes(1);
    approving.unmount();
    const denying = setup();
    await denying.user.click(screen.getByRole('button', { name: /^deny$/i }));
    expect(denying.onDeny).toHaveBeenCalledWith(undefined);
  });

  it('approves with Y and denies with N while focus is inside the card', async () => {
    const approving = setup();
    approving.card.focus();
    await approving.user.keyboard('y');
    expect(approving.onApprove).toHaveBeenCalledTimes(1);
    approving.unmount();
    const denying = setup();
    denying.card.focus();
    await denying.user.keyboard('n');
    expect(denying.onDeny).toHaveBeenCalledTimes(1);
  });

  it('approves with Ctrl/Cmd+Enter inside the card', async () => {
    const { user, onApprove, card } = setup();
    card.focus();
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('ignores shortcuts when focus is outside the card unless globalShortcut is on', async () => {
    const { user, onApprove, unmount } = setup();
    document.body.focus();
    await user.keyboard('y{Control>}{Enter}{/Control}');
    expect(onApprove).not.toHaveBeenCalled();
    unmount();
    const second = setup({ globalShortcut: true });
    document.body.focus();
    await second.user.keyboard('{Control>}{Enter}{/Control}');
    expect(second.onApprove).toHaveBeenCalledTimes(1);
  });

  it('does not treat typing in the feedback field as shortcuts, and sends the reason', async () => {
    const { user, onApprove, onDeny } = setup();
    await user.click(screen.getByRole('button', { name: 'Deny with feedback' }));
    const field = screen.getByRole('textbox', { name: /tell the agent why/i });
    expect(field).toHaveFocus();
    await user.type(field, 'Use the existing Redis client');
    expect(onApprove).not.toHaveBeenCalled();
    expect(onDeny).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onDeny).toHaveBeenCalledWith('Use the existing Redis client');
  });

  it('does not send the denial on the Enter that commits an IME composition', async () => {
    const { user, onDeny } = setup();
    await user.click(screen.getByRole('button', { name: 'Deny with feedback' }));
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'にほんご' } });
    fireEvent.keyDown(textarea, { key: 'Enter', keyCode: 229, isComposing: true });
    // Safari reports the committing keydown with isComposing false but keyCode 229.
    fireEvent.keyDown(textarea, { key: 'Enter', keyCode: 229 });
    expect(onDeny).not.toHaveBeenCalled();
    fireEvent.keyDown(textarea, { key: 'Enter', keyCode: 13 });
    expect(onDeny).toHaveBeenCalledWith('にほんご');
  });

  describe('decides once', () => {
    it('ignores the second click of a double click while an async onApprove runs', async () => {
      const user = userEvent.setup();
      const onApprove = vi.fn();
      function Standalone() {
        const [status, setStatus] = useState<ApprovalStatus>('pending');
        return (
          <ApprovalCard
            toolName="deploy"
            status={status}
            onApprove={async () => {
              onApprove();
              await new Promise((resolve) => setTimeout(resolve, 50));
              setStatus('approved');
            }}
          />
        );
      }
      render(<Standalone />);
      await user.dblClick(screen.getByRole('button', { name: /^approve/i }));
      await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
      expect(onApprove).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Approved', { selector: 'span' })).toBeInTheDocument();
    });

    it('does not deny what it just approved, or approve what it just denied', async () => {
      const approving = setup();
      approving.card.focus();
      await approving.user.keyboard('yn');
      expect(approving.onApprove).toHaveBeenCalledTimes(1);
      expect(approving.onDeny).not.toHaveBeenCalled();
      approving.unmount();
      const denying = setup();
      await denying.user.click(screen.getByRole('button', { name: /^deny$/i }));
      await denying.user.click(screen.getByRole('button', { name: /^approve/i }));
      expect(denying.onDeny).toHaveBeenCalledTimes(1);
      expect(denying.onApprove).not.toHaveBeenCalled();
    });

    it('can decide again once the promise it returned settles with the card still pending', async () => {
      const user = userEvent.setup();
      // e.g. the request failed and the app kept the approval open.
      const onApprove = vi.fn(() => Promise.resolve());
      render(<ApprovalCard toolName="deploy" onApprove={onApprove} />);
      await user.click(screen.getByRole('button', { name: /^approve/i }));
      await user.click(screen.getByRole('button', { name: /^approve/i }));
      expect(onApprove).toHaveBeenCalledTimes(2);
    });

    it.each(['approve', 'deny'] as const)(
      'is not locked when %s throws, and still reports the error',
      async (action) => {
        const user = userEvent.setup();
        const handler = vi.fn().mockImplementationOnce(() => {
          throw new Error('offline');
        });
        render(
          <ApprovalCard toolName="deploy" {...(action === 'approve' ? { onApprove: handler } : { onDeny: handler })} />,
        );
        const button = screen.getByRole('button', { name: action === 'approve' ? /^approve/i : /^deny$/i });
        const { reported } = await collectErrors(() => user.click(button));
        expect(reported).toMatchObject([{ message: 'offline' }]);
        await user.click(button);
        expect(handler).toHaveBeenCalledTimes(2);
      },
    );

    it('can decide again once a promise it returned rejects, and leaves the rejection unhandled', async () => {
      const user = userEvent.setup();
      const onApprove = vi.fn().mockRejectedValueOnce(new Error('500'));
      render(<ApprovalCard toolName="deploy" onApprove={onApprove} />);
      const { rejected } = await collectErrors(async () => {
        await user.click(screen.getByRole('button', { name: /^approve/i }));
      });
      expect(rejected).toEqual([new Error('500')]);
      await user.click(screen.getByRole('button', { name: /^approve/i }));
      expect(onApprove).toHaveBeenCalledTimes(2);
    });

    it('is re-armed when the status returns to pending', async () => {
      const user = userEvent.setup();
      const onApprove = vi.fn();
      const { rerender } = render(<ApprovalCard toolName="deploy" onApprove={onApprove} />);
      await user.click(screen.getByRole('button', { name: /^approve/i }));
      rerender(<ApprovalCard toolName="deploy" status="approved" onApprove={onApprove} />);
      rerender(<ApprovalCard toolName="deploy" status="pending" onApprove={onApprove} />);
      await user.click(screen.getByRole('button', { name: /^approve/i }));
      expect(onApprove).toHaveBeenCalledTimes(2);
    });
  });

  it('closes the feedback field with Escape and returns focus to the card', async () => {
    const { user, card } = setup();
    await user.click(screen.getByRole('button', { name: 'Deny with feedback' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(card).toHaveFocus();
  });

  it('requires a confirming second press for critical actions', async () => {
    const { user, onApprove } = setup({ risk: 'critical' });
    expect(screen.getByText('Critical')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^approve/i }));
    expect(onApprove).not.toHaveBeenCalled();
    expect(screen.getByText('Critical action. Press approve again to confirm.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /confirm approval/i }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('keeps focus on the card after deciding', async () => {
    const { user, card } = setup();
    await user.click(screen.getByRole('button', { name: /^approve/i }));
    expect(card).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Approved');
  });

  it('renders the resolved state without actions', () => {
    setup({ status: 'denied', reason: 'Not on main' });
    expect(screen.getByText('Denied')).toBeInTheDocument();
    expect(screen.getByText('· Not on main')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders its title at the requested heading level', () => {
    setup({ headingLevel: 2 });
    expect(screen.getByRole('heading', { level: 2, name: 'Run command' })).toBeInTheDocument();
  });

  it('exposes shortcuts to assistive tech', () => {
    setup();
    expect(screen.getByRole('button', { name: /^approve/i })).toHaveAttribute('aria-keyshortcuts', 'Y Control+Enter');
    expect(screen.getByRole('button', { name: /^deny$/i })).toHaveAttribute('aria-keyshortcuts', 'N');
  });

  it('has no axe violations when pending, with feedback open, and resolved', async () => {
    const { container, user, rerender } = setup({ description: 'Adds a dependency' });
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole('button', { name: 'Deny with feedback' }));
    expect(await axe(container)).toHaveNoViolations();
    rerender(<ApprovalCard toolName="run_command" status="approved" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('ToolApprovalCard', () => {
  it('responds with the AI SDK approval id', async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn();
    render(<ToolApprovalCard part={toolPart('approval-requested', { toolCallId: 'c9' })} onRespond={onRespond} />);
    expect(screen.getByText('Installs packages from npm')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^approve/i }));
    expect(onRespond).toHaveBeenCalledWith({ id: 'approval_c9', approved: true });
  });

  it('sends a denial reason', async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn();
    render(<ToolApprovalCard part={toolPart('approval-requested', { toolCallId: 'c9' })} onRespond={onRespond} />);
    await user.click(screen.getByRole('button', { name: 'Deny with feedback' }));
    await user.type(screen.getByRole('textbox'), 'too risky{Enter}');
    expect(onRespond).toHaveBeenCalledWith({ id: 'approval_c9', approved: false, reason: 'too risky' });
  });

  it('reflects resolved SDK states and resolves risk from tool meta', () => {
    const { rerender } = render(<ToolApprovalCard part={toolPart('output-denied')} onRespond={() => {}} />);
    expect(screen.getByText('Denied')).toBeInTheDocument();
    rerender(
      <ToolApprovalCard
        part={toolPart('approval-requested')}
        onRespond={() => {}}
        meta={{ risk: (input) => ((input as { query: string }).query.includes('stream') ? 'critical' : 'low') }}
      />,
    );
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('responds once to a double click', async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn(() => new Promise<void>(() => {}));
    render(<ToolApprovalCard part={toolPart('approval-requested', { toolCallId: 'c9' })} onRespond={onRespond} />);
    await user.dblClick(screen.getByRole('button', { name: /^approve/i }));
    expect(onRespond).toHaveBeenCalledTimes(1);
  });

  it('renders nothing for parts outside the approval flow', () => {
    const { container } = render(<ToolApprovalCard part={toolPart('output-available')} onRespond={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
