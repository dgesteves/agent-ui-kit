import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DiffReview, type DiffReviewComment, type DiffReviewResult } from '../src/diff-review';
import { ROUTE_NEW, ROUTE_OLD } from './fixtures';

const items = () => screen.getAllByRole('group', { name: /^(Hunk|Change) /, hidden: true });
const status = () => screen.getByRole('status');
const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n') + '\n';

describe('DiffReview, the edges', () => {
  it('accepts a whole file with Alt+A and rejects everything with Shift+R', async () => {
    const user = userEvent.setup();
    render(
      <DiffReview
        files={[
          { path: 'a.ts', oldContent: 'a\nb\n', newContent: 'A\nb\n' },
          { path: 'b.ts', oldContent: 'c\n', newContent: 'C\n' },
        ]}
      />,
    );
    items()[0]!.focus();
    await user.keyboard('{Alt>}a{/Alt}');
    expect(items().map((i) => i.dataset.decision)).toEqual(['accepted', 'pending']);
    await user.keyboard('{Shift>}r{/Shift}');
    expect(items().map((i) => i.dataset.decision)).toEqual(['rejected', 'rejected']);
    expect(status()).toHaveTextContent('All 2 hunks rejected.');
    // Pressing a decision button again resets it.
    await user.click(within(items()[0]!).getByRole('button', { name: 'Reject hunk 1' }));
    expect(items()[0]).toHaveAttribute('data-decision', 'pending');
  });

  it('brings focus back into the review with J from outside a hunk', async () => {
    const user = userEvent.setup();
    render(<DiffReview files={[{ path: 'route.ts', oldContent: ROUTE_OLD, newContent: ROUTE_NEW }]} />);
    screen.getByRole('radio', { name: 'unified' }).focus();
    await user.keyboard('j');
    expect(items()[0]).toHaveFocus();
    // The arrows leave the layout toggle to itself.
    screen.getByRole('radio', { name: 'unified' }).focus();
    await user.keyboard('{ArrowDown}');
    expect(items()[0]).not.toHaveFocus();
  });

  it('comments on a whole file, and edits or cancels that comment', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(result: DiffReviewResult) => void>();
    render(
      <DiffReview files={[{ path: 'logo.png', oldContent: 'a\u0000', newContent: 'b\u0000' }]} onSubmit={onSubmit} />,
    );
    items()[0]!.focus();
    await user.keyboard('c');
    expect(screen.getByRole('textbox', { name: 'Comment on the file, for the agent' })).toHaveFocus();
    await user.keyboard('Use the SVG instead.{Control>}{Enter}{/Control}');
    expect(status()).toHaveTextContent('Comment added on the file of logo.png.');
    expect(items()[0]).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Edit comment on the file' }));
    await user.keyboard(' Or a PNG at 2x.');
    await user.keyboard('{Escape}');
    expect(screen.getByText('Use the SVG instead.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Apply/ }));
    expect(onSubmit.mock.calls[0]![0].comments).toMatchObject([
      { target: 'file', fileId: 'logo.png', path: 'logo.png', text: 'Use the SVG instead.' },
    ]);
  });

  it('ignores the Enter that commits an IME composition in the comment editor', async () => {
    const user = userEvent.setup();
    const onCommentsChange = vi.fn();
    render(
      <DiffReview
        files={[{ path: 'a.ts', oldContent: 'a\n', newContent: 'b\n' }]}
        onCommentsChange={onCommentsChange}
      />,
    );
    items()[0]!.focus();
    await user.keyboard('c');
    const editor = screen.getByRole('textbox');
    await user.type(editor, 'こんにちは');
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true, keyCode: 229 });
    expect(onCommentsChange).not.toHaveBeenCalled();
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true });
    expect(onCommentsChange).toHaveBeenCalledTimes(1);
  });

  it('says what is left to show, and E does nothing once all of it is', async () => {
    const user = userEvent.setup();
    const file = { path: 'a.ts', oldContent: lines(30), newContent: lines(30).replace('line 15\n', 'LINE 15\n') };
    render(<DiffReview files={[file]} />);
    for (const button of screen.getAllByRole('button', { name: /^Show all/ })) await user.click(button);
    items()[0]!.focus();
    status().textContent = '';
    await user.keyboard('e');
    expect(status()).toHaveTextContent('');
  });

  it('names a hunk that only removes lines by where they were', () => {
    render(<DiffReview files={[{ path: 'a.ts', oldContent: 'a\nb\nc\n', newContent: 'a\nc\n' }]} context={0} />);
    expect(items()[0]).toHaveAccessibleName(/^Hunk 1 of 1, a\.ts, lines 2 to 2, not reviewed$/);
  });

  it('decides files created or deleted empty as a whole', () => {
    render(
      <DiffReview
        files={[
          { path: 'new.ts', oldContent: '', newContent: '' },
          { path: 'gone.ts', oldContent: '', newContent: '', patch: undefined },
        ]}
      />,
    );
    expect(screen.getAllByText('New empty file.')).toHaveLength(2);
    const deleted = { path: 'gone.ts', patch: ['--- a/gone.ts', '+++ /dev/null', ''].join('\n') };
    render(<DiffReview files={[deleted]} />);
    expect(screen.getByText('Empty file, deleted.')).toBeInTheDocument();
  });

  it('selects nothing from a line number while read-only', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DiffReview files={[{ path: 'a.ts', oldContent: 'a\n', newContent: 'b\n' }]} readOnly />,
    );
    expect(container.querySelector('[data-line-index] button')).toBeNull();
    items()[0]!.focus();
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}');
    expect(container.querySelector('[data-selected]')).toBeNull();
  });

  it('keeps a comment whose lines left the diff, at the end of its hunk', () => {
    const comment: DiffReviewComment = {
      id: 'c',
      fileId: 'a.ts',
      path: 'a.ts',
      target: 'lines',
      hunkId: 'a.ts:0',
      side: 'new',
      startLine: 40,
      endLine: 41,
      text: 'Gone since.',
    };
    render(<DiffReview files={[{ path: 'a.ts', oldContent: 'a\n', newContent: 'b\n' }]} defaultComments={[comment]} />);
    expect(screen.getByText('Gone since.')).toBeInTheDocument();
  });

  it('follows controlled viewed marks', () => {
    const files = [
      { path: 'a.ts', oldContent: 'a\n', newContent: 'b\n' },
      { path: 'b.ts', oldContent: 'c\n', newContent: 'd\n' },
    ];
    const { rerender } = render(<DiffReview files={files} viewed={{ 'a.ts': true }} />);
    expect(items()[0]).not.toBeVisible();
    rerender(<DiffReview files={files} viewed={{}} />);
    expect(items()[0]).toBeVisible();
    rerender(<DiffReview files={files} viewed={{ 'a.ts': true }} collapseViewed={false} />);
    expect(items()[0]).toBeVisible();
  });
});
