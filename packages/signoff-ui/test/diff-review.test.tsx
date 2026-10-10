import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DiffReview, type DiffReviewResult } from '../src/diff-review';
import { axe, collectErrors } from './utils';
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
    // In the file navigator and in the file's header.
    expect(
      within(screen.getByRole('navigation', { name: 'Files in this review' })).getByText('route.ts'),
    ).toBeVisible();
    expect(screen.getAllByText('route.ts')).toHaveLength(2);
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

  it('keeps one hunk in the tab order when the files shrink', async () => {
    const user = userEvent.setup();
    const two = [
      { path: 'a.ts', oldContent: 'a\n', newContent: 'A\n' },
      { path: 'b.ts', oldContent: 'b\n', newContent: 'B\n' },
    ];
    const { rerender } = render(<DiffReview files={two} />);
    hunks()[1]!.focus();
    rerender(<DiffReview files={[two[0]!]} />);
    expect(hunks().map((h) => h.tabIndex)).toEqual([0]);
    await user.keyboard('j');
    hunks()[0]!.focus();
    await user.keyboard('a');
    expect(hunks()[0]).toHaveAttribute('data-decision', 'accepted');
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

  it('compares files by content and decisions by value when deciding whether a submit repeats', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const change = (newContent: string) => [{ path: 'a.ts', oldContent: 'a\n', newContent }];
    function Parent() {
      const [files, setFiles] = useState(() => change('A\n'));
      const [, rerender] = useState(0);
      return (
        <>
          <button type="button" onClick={() => setFiles(change('A\n'))}>
            Same files
          </button>
          <button type="button" onClick={() => setFiles(change('B\n'))}>
            Other files
          </button>
          <button type="button" onClick={() => rerender((n) => n + 1)}>
            Re-render
          </button>
          {/* Controlled, with a new but equal object on every render. */}
          <DiffReview files={files} decisions={{ 'a.ts:0': 'accepted' }} onSubmit={onSubmit} />
        </>
      );
    }
    render(<Parent />);
    const apply = () => user.click(screen.getByRole('button', { name: /^apply/i }));
    await apply();
    await user.click(screen.getByRole('button', { name: 'Re-render' }));
    await apply();
    await user.click(screen.getByRole('button', { name: 'Same files' }));
    await apply();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Other files' }));
    await apply();
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit.mock.calls[1]![0].files[0].content).toBe('B\n');
  });

  it('submits again once a decision changes, including back to one already submitted', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<DiffReview files={files} onSubmit={onSubmit} />);
    const apply = () => user.click(screen.getByRole('button', { name: /^apply/i }));
    await apply();
    await user.click(screen.getByRole('button', { name: 'Accept all' }));
    await apply();
    await user.click(screen.getByRole('button', { name: 'Accept all' }));
    await apply();
    await user.click(screen.getByRole('button', { name: 'Reject all' }));
    await user.click(screen.getByRole('button', { name: 'Accept all' }));
    await apply();
    expect(onSubmit.mock.calls.map(([r]) => r.accepted)).toEqual([0, 4, 4]);
  });

  it('can submit again after onSubmit throws or its promise rejects', async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('offline');
      })
      .mockRejectedValueOnce(new Error('500'));
    render(<DiffReview files={files} onSubmit={onSubmit} />);
    const apply = () => user.click(screen.getByRole('button', { name: /^apply/i }));
    const { reported, rejected } = await collectErrors(async () => {
      await apply();
      await apply();
    });
    expect(reported).toMatchObject([{ message: 'offline' }]);
    expect(rejected).toEqual([new Error('500')]);
    await apply();
    expect(onSubmit).toHaveBeenCalledTimes(3);
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

  it.each([
    [
      ['a.ts', 'a.ts', 'a.ts#2'],
      ['a.ts:0', 'a.ts#2:0', 'a.ts#2#2:0'],
    ],
    [
      ['a.ts#2', 'a.ts', 'a.ts'],
      ['a.ts#2:0', 'a.ts:0', 'a.ts#3:0'],
    ],
    [
      ['a.ts', 'a.ts#2', 'a.ts', 'a.ts', 'a.ts#3'],
      ['a.ts:0', 'a.ts#2:0', 'a.ts#3:0', 'a.ts#4:0', 'a.ts#3#2:0'],
    ],
  ])('gives every file its own hunk ids when a path looks like a repeat: %j', async (paths, ids) => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(r: DiffReviewResult) => void>();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <DiffReview
        files={paths.map((path, i) => ({ path, oldContent: `old ${i}\n`, newContent: `new ${i}\n` }))}
        onSubmit={onSubmit}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Accept hunk 2' }));
    expect(hunks().map((h) => h.dataset.decision)).toEqual(paths.map((_, i) => (i === 1 ? 'accepted' : 'pending')));
    await user.click(screen.getByRole('button', { name: /^apply/i }));
    const result = onSubmit.mock.calls[0]![0];
    expect(result.files.map((f) => f.content)).toEqual(paths.map((_, i) => (i === 1 ? `new ${i}\n` : `old ${i}\n`)));
    expect(result.files.flatMap((f) => [...f.accepted, ...f.pending])).toEqual(ids);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('switches between unified and split layouts', async () => {
    const user = userEvent.setup();
    const { container } = render(<DiffReview files={files} />);
    expect(container.querySelector('.grid-cols-\\[minmax\\(0\\,1fr\\)_1px_minmax\\(0\\,1fr\\)\\]')).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Split' }));
    expect(screen.getByRole('radio', { name: 'Split' })).toHaveAttribute('aria-checked', 'true');
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
