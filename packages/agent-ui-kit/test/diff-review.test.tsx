import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DiffReview, type DiffReviewResult } from '../src/diff-review';
import { axe } from './utils';
import { ROUTE_NEW, ROUTE_OLD } from './fixtures';

const files = [
  { path: 'app/api/chat/route.ts', oldContent: ROUTE_OLD, newContent: ROUTE_NEW },
  { path: 'lib/ratelimit.ts', oldContent: '', newContent: "export const ratelimit = createLimiter('10 s');\n" },
];

function hunks() {
  return screen.getAllByRole('group', { name: /^Hunk/ });
}

describe('DiffReview', () => {
  it('renders files, hunks, stats and line markers', () => {
    render(<DiffReview files={files} />);
    expect(screen.getByRole('region', { name: 'Review changes' })).toBeInTheDocument();
    expect(screen.getByText('route.ts')).toBeInTheDocument();
    expect(hunks().length).toBe(4);
    expect(hunks()[0]).toHaveAccessibleName('Hunk 1 of 4, app/api/chat/route.ts, lines 1 to 7, not reviewed');
    expect(screen.getAllByText('Added:').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Removed:').length).toBe(1);
  });

  it('accepts and rejects hunks with buttons, and toggles back to pending', async () => {
    const user = userEvent.setup();
    const onDecisionsChange = vi.fn();
    render(<DiffReview files={files} onDecisionsChange={onDecisionsChange} />);
    const first = hunks()[0]!;
    const accept = within(first).getByRole('button', { name: 'Accept hunk 1' });
    await user.click(accept);
    expect(accept).toHaveAttribute('aria-pressed', 'true');
    expect(first).toHaveAttribute('data-decision', 'accepted');
    expect(onDecisionsChange).toHaveBeenLastCalledWith({ 'app/api/chat/route.ts:0': 'accepted' });
    await user.click(within(first).getByRole('button', { name: 'Reject hunk 1' }));
    expect(first).toHaveAttribute('data-decision', 'rejected');
    await user.click(within(first).getByRole('button', { name: 'Reject hunk 1' }));
    expect(first).toHaveAttribute('data-decision', 'pending');
  });

  it('supports keyboard review: j/k, a, r, u and auto-advance', async () => {
    const user = userEvent.setup();
    render(<DiffReview files={files} />);
    const [h1, h2, h3] = hunks();
    h1!.focus();
    await user.keyboard('a');
    expect(h1).toHaveAttribute('data-decision', 'accepted');
    expect(h2).toHaveFocus();
    await user.keyboard('r');
    expect(h2).toHaveAttribute('data-decision', 'rejected');
    expect(h3).toHaveFocus();
    await user.keyboard('k');
    expect(h2).toHaveFocus();
    await user.keyboard('u');
    expect(h2).toHaveAttribute('data-decision', 'pending');
    expect(screen.getByText('Hunk 2 of 4 reset. 3 remaining.')).toBeInTheDocument();
    await user.keyboard('{ArrowDown}');
    expect(h3).toHaveFocus();
    await user.keyboard('jj');
    expect(hunks()[3]).toHaveFocus();
  });

  it('uses roving tabindex so only the active hunk is in the tab order', async () => {
    const user = userEvent.setup();
    render(<DiffReview files={files} />);
    const [h1, h2] = hunks();
    expect(h1).toHaveAttribute('tabindex', '0');
    expect(h2).toHaveAttribute('tabindex', '-1');
    h1!.focus();
    await user.keyboard('j');
    expect(h1).toHaveAttribute('tabindex', '-1');
    expect(h2).toHaveAttribute('tabindex', '0');
  });

  it('decides every hunk with Shift+A / Shift+R and the bulk buttons', async () => {
    const user = userEvent.setup();
    render(<DiffReview files={files} />);
    hunks()[0]!.focus();
    await user.keyboard('{Shift>}A{/Shift}');
    expect(hunks().every((h) => h.dataset.decision === 'accepted')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Reject all' }));
    expect(hunks().every((h) => h.dataset.decision === 'rejected')).toBe(true);
    expect(screen.getByText('All 4 hunks rejected.')).toBeInTheDocument();
  });

  it('submits only accepted hunks, by button and by Ctrl/Cmd+Enter', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(r: DiffReviewResult) => void>();
    render(<DiffReview files={files} onSubmit={onSubmit} />);
    const [h1, h2, h3, h4] = hunks();
    await user.click(within(h1!).getByRole('button', { name: 'Accept hunk 1' }));
    await user.click(within(h2!).getByRole('button', { name: 'Accept hunk 2' }));
    await user.click(within(h3!).getByRole('button', { name: 'Reject hunk 3' }));
    await user.click(within(h4!).getByRole('button', { name: 'Accept hunk 4' }));
    await user.click(screen.getByRole('button', { name: 'Apply 3 of 4' }));
    const result = onSubmit.mock.calls[0]![0];
    expect(result).toMatchObject({ accepted: 3, rejected: 1, pending: 0 });
    const route = result.files[0]!;
    expect(route.content).toContain("import { ratelimit } from '@/lib/ratelimit';");
    expect(route.content).toContain('status: 429');
    expect(route.content).toContain("openai('gpt-4o')");
    expect(route.content).not.toContain('gpt-4.1-mini');
    expect(result.files[1]!.content).toBe("export const ratelimit = createLimiter('10 s');\n");
    // Submitting again needs a change; then Ctrl/Cmd+Enter submits too.
    await user.click(within(h3!).getByRole('button', { name: 'Reject hunk 3' }));
    h1!.focus();
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit.mock.calls[1]![0]).toMatchObject({ accepted: 3, rejected: 0, pending: 1 });
  });

  it('submits once per set of decisions, even on a double click', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<DiffReview files={files} onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Accept all' }));
    await user.dblClick(screen.getByRole('button', { name: /^apply/i }));
    hunks()[0]!.focus();
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('submits the new contents when every hunk is accepted, even without context lines', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(r: DiffReviewResult) => void>();
    const oldContent = "import a from 'a';\nexport const x = 1;\n";
    const newContent = "'use server';\nimport a from 'a';\nexport const x = 1;\nexport const y = 2;\n";
    render(<DiffReview files={[{ path: 'x.ts', oldContent, newContent }]} context={0} onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Accept all' }));
    await user.click(screen.getByRole('button', { name: /^apply/i }));
    expect(onSubmit.mock.calls[0]![0].files[0]!.content).toBe(newContent);
  });

  it('keeps the hunks of two changes to the same path apart', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(r: DiffReviewResult) => void>();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <DiffReview
        files={[
          { path: 'a.ts', oldContent: 'one\n', newContent: 'ONE\n' },
          { path: 'a.ts', oldContent: 'two\n', newContent: 'TWO\n' },
        ]}
        onSubmit={onSubmit}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Accept hunk 1' }));
    expect(hunks().map((h) => h.dataset.decision)).toEqual(['accepted', 'pending']);
    await user.click(screen.getByRole('button', { name: /^apply/i }));
    const result = onSubmit.mock.calls[0]![0];
    expect(result.accepted).toBe(1);
    expect(result.files.map((f) => f.content)).toEqual(['ONE\n', 'two\n']);
    expect(result.files.map((f) => f.accepted)).toEqual([['a.ts:0'], []]);
    expect(result.files[1]!.pending).toEqual(['a.ts#2:0']);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('switches between unified and split layouts', async () => {
    const user = userEvent.setup();
    const { container } = render(<DiffReview files={files} />);
    expect(container.querySelector('.grid-cols-\\[minmax\\(0\\,1fr\\)_1px_minmax\\(0\\,1fr\\)\\]')).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'split' }));
    expect(screen.getByRole('radio', { name: 'split' })).toHaveAttribute('aria-checked', 'true');
    expect(container.querySelectorAll('[data-line="add"]').length).toBeGreaterThan(0);
    expect(container.querySelector('.grid-cols-\\[minmax\\(0\\,1fr\\)_1px_minmax\\(0\\,1fr\\)\\]')).not.toBeNull();
  });

  it('hides review controls when read-only', () => {
    render(<DiffReview files={files} readOnly defaultDecisions={{ 'lib/ratelimit.ts:0': 'accepted' }} />);
    expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument();
    expect(screen.getByText('accepted')).toBeInTheDocument();
  });

  it('has no axe violations in unified and split view', async () => {
    const { container, rerender } = render(
      <DiffReview files={files} onSubmit={() => {}} defaultDecisions={{ 'app/api/chat/route.ts:0': 'accepted' }} />,
    );
    expect(await axe(container)).toHaveNoViolations();
    rerender(<DiffReview files={files} view="split" onSubmit={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
