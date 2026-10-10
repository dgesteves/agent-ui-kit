import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { applyPatch } from 'diff';
import { describe, expect, it, vi } from 'vitest';
import { DiffReview, type DiffReviewResult } from '../src/diff-review';
import { axe } from './utils';
import { ROUTE_NEW, ROUTE_OLD } from './fixtures';

const lines = (n: number, p = 'line') => Array.from({ length: n }, (_, i) => `${p} ${i + 1}`).join('\n') + '\n';
const files = [
  { path: 'app/api/chat/route.ts', oldContent: ROUTE_OLD, newContent: ROUTE_NEW },
  { path: 'lib/ratelimit.ts', oldContent: '', newContent: "export const ratelimit = createLimiter('10 s');\n" },
  { path: 'docs/guide.md', oldPath: 'docs/old-guide.md', oldContent: '# Guide\n', newContent: '# Guide\n' },
  { path: 'public/logo.png', oldContent: 'PNG\u0000old', newContent: 'PNG\u0000new' },
];
// jsdom runs without the stylesheet, so a visually hidden span's leading space is lost from a name;
// Chrome keeps it ("Accept file app/route.ts"). The name patterns allow for both.
const items = () => screen.getAllByRole('group', { name: /^(Hunk|Change) /, hidden: true });
const status = () => screen.getByRole('status');
const fileOf = (path: string) =>
  [...document.querySelectorAll<HTMLElement>('[data-slot="signoff-diff-file"]')].find(
    (el) => el.querySelector('[data-slot]') && el.textContent?.includes(path),
  )!;

describe('DiffReview files', () => {
  it('shows renamed and binary files, each decided as a whole', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(result: DiffReviewResult) => void>();
    render(<DiffReview files={files} onSubmit={onSubmit} />);
    expect(screen.getByText('Renamed from docs/old-guide.md, without changes.')).toBeInTheDocument();
    expect(screen.getByText('Binary file, not shown.')).toBeInTheDocument();
    expect(items().map((el) => el.getAttribute('aria-label'))).toEqual([
      'Hunk 1 of 6, app/api/chat/route.ts, lines 1 to 7, not reviewed',
      'Hunk 2 of 6, app/api/chat/route.ts, lines 12 to 26, not reviewed',
      'Hunk 3 of 6, app/api/chat/route.ts, lines 28 to 34, not reviewed',
      'Hunk 4 of 6, lib/ratelimit.ts, lines 1 to 1, not reviewed',
      'Change 5 of 6, docs/guide.md, renamed from docs/old-guide.md, not reviewed',
      'Change 6 of 6, public/logo.png, binary file, not reviewed',
    ]);
    // The header reads the rename as "old to new".
    expect(within(fileOf('docs/guide.md')).getAllByText('docs/old-guide.md')[0]).toBeInTheDocument();
    items()[5]!.focus();
    await user.keyboard('a');
    expect(status()).toHaveTextContent('Change 6 of 6 accepted. 5 remaining.');
    await user.click(within(items()[4]!).getByRole('button', { name: 'Reject change 5' }));
    await user.click(screen.getByRole('button', { name: /^Apply/ }));
    const result = onSubmit.mock.calls[0]![0];
    expect(result.files.map((f) => [f.path, f.status, f.decision, f.binary ?? false])).toEqual([
      ['app/api/chat/route.ts', 'modified', 'pending', false],
      ['lib/ratelimit.ts', 'added', 'pending', false],
      ['docs/guide.md', 'renamed', 'rejected', false],
      ['public/logo.png', 'modified', 'accepted', true],
    ]);
    expect(result.files[2]).toMatchObject({ oldPath: 'docs/old-guide.md', content: '# Guide\n' });
  });

  it('accepts or rejects a whole file with its buttons and Alt+A / Alt+R', async () => {
    const user = userEvent.setup();
    render(<DiffReview files={files} />);
    const route = fileOf('app/api/chat/route.ts');
    await user.click(within(route).getByRole('button', { name: /^Accept file ?app\/api\/chat\/route\.ts$/ }));
    expect(
      within(route)
        .getAllByRole('group')
        .map((h) => h.dataset.decision),
    ).toEqual(['accepted', 'accepted', 'accepted']);
    expect(status()).toHaveTextContent('All 3 hunks in app/api/chat/route.ts accepted.');
    items()[3]!.focus();
    await user.keyboard('{Alt>}r{/Alt}');
    expect(items()[3]).toHaveAttribute('data-decision', 'rejected');
    expect(status()).toHaveTextContent('The hunk in lib/ratelimit.ts rejected.');
    // The other files are untouched.
    expect(items()[4]).toHaveAttribute('data-decision', 'pending');
  });

  it('marks a file viewed, folds it away and moves on with V; J and K skip what is folded', async () => {
    const user = userEvent.setup();
    const onViewedChange = vi.fn();
    render(<DiffReview files={files} onViewedChange={onViewedChange} />);
    items()[0]!.focus();
    await user.keyboard('v');
    expect(onViewedChange).toHaveBeenLastCalledWith({ 'app/api/chat/route.ts': true });
    expect(status()).toHaveTextContent('app/api/chat/route.ts viewed. 1 of 4 files viewed.');
    expect(items()[3]).toHaveFocus();
    expect(items()[0]).not.toBeVisible();
    expect(within(fileOf('app/api/chat/route.ts')).getByRole('checkbox', { name: /^Viewed/ })).toBeChecked();
    await user.keyboard('k');
    expect(items()[3]).toHaveFocus();
    // The fold toggle shows it again, without changing the mark.
    await user.click(screen.getByRole('button', { name: 'Show app/api/chat/route.ts' }));
    expect(items()[0]).toBeVisible();
    await user.click(within(fileOf('app/api/chat/route.ts')).getByRole('checkbox', { name: /^Viewed/ }));
    expect(onViewedChange).toHaveBeenLastCalledWith({ 'app/api/chat/route.ts': false });
    expect(status()).toHaveTextContent('app/api/chat/route.ts no longer viewed.');
  });

  it('keeps one item in the tab order when the active one is folded away', async () => {
    const user = userEvent.setup();
    render(<DiffReview files={files} />);
    await user.click(within(fileOf('app/api/chat/route.ts')).getByRole('checkbox', { name: /^Viewed/ }));
    expect(items().filter((el) => el.tabIndex === 0)).toEqual([items()[3]]);
  });

  it('moves between files with Shift+J and Shift+K', async () => {
    const user = userEvent.setup();
    render(<DiffReview files={files} />);
    items()[1]!.focus();
    await user.keyboard('{Shift>}j{/Shift}');
    expect(items()[3]).toHaveFocus();
    await user.keyboard('{Shift>}j{/Shift}');
    expect(items()[4]).toHaveFocus();
    await user.keyboard('{Shift>}k{/Shift}{Shift>}k{/Shift}');
    expect(items()[0]).toHaveFocus();
  });

  it('lists the files in a navigator: one tab stop, the arrows between files, Enter goes to one', async () => {
    const user = userEvent.setup();
    render(<DiffReview files={files} defaultViewed={{ 'lib/ratelimit.ts': true }} />);
    const nav = screen.getByRole('navigation', { name: 'Files in this review' });
    const entries = within(nav).getAllByRole('button');
    expect(entries.map((b) => b.tabIndex)).toEqual([0, -1, -1, -1]);
    expect(entries[0]).toHaveAttribute('aria-current', 'true');
    expect(entries[1]).toHaveAccessibleName(/^Added: ?lib\/ratelimit\.ts ?, 0 of 1 decided, viewed$/);
    entries[0]!.focus();
    await user.keyboard('{ArrowDown}');
    expect(entries[1]).toHaveFocus();
    await user.keyboard('{End}');
    expect(entries[3]).toHaveFocus();
    await user.keyboard('{Home}{ArrowDown}{Enter}');
    // The viewed file unfolds to show the hunk it goes to.
    expect(items()[3]).toHaveFocus();
    expect(items()[3]).toBeVisible();
  });

  it('has no navigator for a single file', () => {
    render(<DiffReview files={[files[0]!]} />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});

describe('DiffReview context', () => {
  const big = { path: 'src/a.ts', oldContent: lines(100), newContent: lines(100).replace('line 50\n', 'LINE 50\n') };

  it('shows more unchanged lines with E, around the focused hunk', async () => {
    const user = userEvent.setup();
    const { container } = render(<DiffReview files={[big]} />);
    const rows = () => [...container.querySelectorAll('[data-line]')].map((r) => r.textContent?.replace(/\s+/g, ' '));
    expect(rows()).toHaveLength(8);
    expect(screen.getByText('46 unchanged lines', { selector: 'span:not(.sr-only)' })).toBeInTheDocument();
    screen.getByRole('group', { name: /^Hunk 1/ }).focus();
    await user.keyboard('e');
    expect(status()).toHaveTextContent('Showing 40 more unchanged lines.');
    expect(rows()).toHaveLength(48);
    expect(screen.getByText('26 unchanged lines', { selector: 'span:not(.sr-only)' })).toBeInTheDocument();
    expect(screen.getByText('27 unchanged lines', { selector: 'span:not(.sr-only)' })).toBeInTheDocument();
    // Numbered in both files, in order.
    const shown = [...container.querySelectorAll('[data-slot="signoff-diff-gap"] [data-line]')];
    expect(shown[0]!.textContent).toMatch(/^2727 line 27$/);
  });

  it('shows them from the gap’s buttons too, all at once when few are left', async () => {
    const user = userEvent.setup();
    render(<DiffReview files={[big]} />);
    await user.click(screen.getAllByRole('button', { name: /^Show all ?46 unchanged lines$/ })[0]!);
    expect(screen.queryByText('46 unchanged lines', { selector: 'span:not(.sr-only)' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /^20 more ?unchanged lines after hunk 1$/ }));
    expect(screen.getByText('27 unchanged lines', { selector: 'span:not(.sr-only)' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^20 more ?unchanged lines after hunk 1$/ }));
    await user.click(screen.getByRole('button', { name: /^Show all ?7 unchanged lines$/ }));
    expect(screen.queryByText(/unchanged lines?$/, { selector: 'span:not(.sr-only)' })).toBeNull();
  });

  it('has no context to show for a patch alone', () => {
    const patch = ['--- a/x.ts', '+++ b/x.ts', '@@ -10,3 +10,3 @@', ' a', '-b', '+c', ' d', ''].join('\n');
    const { container } = render(<DiffReview files={[{ path: 'x.ts', patch }]} />);
    expect(container.querySelector('[data-slot="signoff-diff-gap"]')).toBeNull();
  });
});

describe('DiffReview output', () => {
  it('passes a toPatch of the accepted changes to onSubmit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(result: DiffReviewResult, review: { toPatch: () => string }) => void>();
    render(<DiffReview files={[files[0]!]} onSubmit={onSubmit} />);
    await user.click(within(items()[0]!).getByRole('button', { name: 'Accept hunk 1' }));
    await user.click(within(items()[2]!).getByRole('button', { name: 'Accept hunk 3' }));
    await user.click(screen.getByRole('button', { name: /^Apply/ }));
    const [result, review] = onSubmit.mock.calls[0]!;
    const patch = review.toPatch();
    expect(patch).toMatch(/^diff --git a\/app\/api\/chat\/route\.ts b\/app\/api\/chat\/route\.ts\n/);
    expect(applyPatch(ROUTE_OLD, patch)).toBe(result.files[0]!.content);
  });

  it('submits again once a file is marked viewed', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<DiffReview files={files} onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: /^Apply/ }));
    await user.click(screen.getByRole('button', { name: /^Apply/ }));
    await user.click(within(fileOf('lib/ratelimit.ts')).getByRole('checkbox', { name: /^Viewed/ }));
    await user.click(screen.getByRole('button', { name: /^Apply/ }));
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit.mock.calls[1]![0].files[1].viewed).toBe(true);
  });

  it('has no axe violations with every kind of file, a fold and shown context', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DiffReview files={[...files, big()]} onSubmit={() => {}} defaultViewed={{ 'lib/ratelimit.ts': true }} />,
    );
    await user.click(screen.getAllByRole('button', { name: /^20 more ?unchanged lines/ })[0]!);
    expect(await axe(container)).toHaveNoViolations();
    function big() {
      return { path: 'src/a.ts', oldContent: lines(100), newContent: lines(100).replace('line 50\n', 'LINE 50\n') };
    }
  });
});
