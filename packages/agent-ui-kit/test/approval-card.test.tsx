import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApprovalCard, ToolApprovalCard } from '../src/approval-card';
import { axe, toolPart } from './utils';

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
    const { user, onApprove, onDeny } = setup();
    await user.click(screen.getByRole('button', { name: /^approve/i }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /^deny$/i }));
    expect(onDeny).toHaveBeenCalledWith(undefined);
  });

  it('approves with Y and denies with N while focus is inside the card', async () => {
    const { user, onApprove, onDeny, card } = setup();
    card.focus();
    await user.keyboard('y');
    expect(onApprove).toHaveBeenCalledTimes(1);
    await user.keyboard('n');
    expect(onDeny).toHaveBeenCalledTimes(1);
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

  it('renders nothing for parts outside the approval flow', () => {
    const { container } = render(<ToolApprovalCard part={toolPart('output-available')} onRespond={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
