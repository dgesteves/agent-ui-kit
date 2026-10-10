import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DiffReview, type DiffReviewComment, type DiffReviewResult } from '../src/diff-review';
import { axe } from './utils';
import { ROUTE_NEW, ROUTE_OLD } from './fixtures';

const files = [{ path: 'app/api/chat/route.ts', oldContent: ROUTE_OLD, newContent: ROUTE_NEW }];
const hunks = () => screen.getAllByRole('group', { name: /^Hunk/ });
const status = () => screen.getByRole('status');
const selected = (hunk: HTMLElement) =>
  [...hunk.querySelectorAll<HTMLElement>('[data-selected]')].map((row) => row.dataset.lineIndex);

describe('DiffReview line selection', () => {
  it('selects lines with Shift and the arrows, from the first changed line, and reads each one', async () => {
    const user = userEvent.setup();
    render(<DiffReview files={files} />);
    const second = hunks()[1]!;
    second.focus();
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}');
    // The second hunk adds its first line after three lines of context.
    expect(selected(second)).toEqual(['3']);
    expect(status()).toHaveTextContent(/^Added: .+\. Line 15 selected\.$/);
    await user.keyboard('{Shift>}{ArrowDown}{ArrowDown}{/Shift}');
    expect(selected(second)).toEqual(['3', '4', '5']);
    expect(status()).toHaveTextContent(/Lines 15 to 17 selected\.$/);
    // Without Shift, the arrows move the selection, one line.
    await user.keyboard('{ArrowUp}');
    expect(selected(second)).toEqual(['4']);
    await user.keyboard('{Escape}');
    expect(selected(second)).toEqual([]);
    // Then the arrows move between hunks again.
    await user.keyboard('{ArrowDown}');
    expect(hunks()[2]).toHaveFocus();
  });

  it('starts from the last changed line going up, and numbers removed lines in the original', async () => {
    const user = userEvent.setup();
    render(<DiffReview files={files} />);
    const third = hunks()[2]!;
    third.focus();
    await user.keyboard('{Shift>}{ArrowUp}{/Shift}');
    expect(status()).toHaveTextContent(/^Added: .*gpt-4\.1-mini.*Line 31 selected\.$/);
    // With the removed line above it: the range is still the one line in the proposed file.
    await user.keyboard('{Shift>}{ArrowUp}{/Shift}');
    expect(status()).toHaveTextContent(/^Removed: .*gpt-4o.*Line 31 selected\.$/);
    // Only the removed line: numbered in the original file.
    await user.keyboard('{ArrowDown}{ArrowUp}');
    expect(status()).toHaveTextContent(/^Removed: .*gpt-4o.*Line 21 of the original selected\.$/);
  });

  it('selects with a click on a line number, and extends with Shift-click', async () => {
    const user = userEvent.setup();
    const { container } = render(<DiffReview files={files} />);
    const second = hunks()[1]!;
    const numbers = (i: number) => second.querySelector(`[data-line-index="${i}"] button`)!;
    await user.click(numbers(2));
    expect(selected(second)).toEqual(['2']);
    expect(second).toHaveFocus();
    await user.keyboard('{Shift>}');
    await user.click(numbers(4));
    await user.keyboard('{/Shift}');
    expect(selected(second)).toEqual(['2', '3', '4']);
    // Line numbers stay out of the tab order and the reading.
    for (const button of container.querySelectorAll('[data-line-index] button')) {
      expect(button).toHaveAttribute('tabindex', '-1');
      expect(button).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('moves J and K between hunks, clearing the selection', async () => {
    const user = userEvent.setup();
    render(<DiffReview files={files} />);
    hunks()[1]!.focus();
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}j');
    expect(hunks()[2]).toHaveFocus();
    expect(selected(hunks()[1]!)).toEqual([]);
  });
});

describe('DiffReview comments', () => {
  it('comments on the selected lines with C, saves with Ctrl+Enter, and sends them with the review', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(result: DiffReviewResult) => void>();
    render(<DiffReview files={files} onSubmit={onSubmit} />);
    const second = hunks()[1]!;
    second.focus();
    await user.keyboard('{Shift>}{ArrowDown}{ArrowDown}{/Shift}c');
    const editor = screen.getByRole('textbox', { name: 'Comment on lines 15 to 16, for the agent' });
    expect(editor).toHaveFocus();
    await user.keyboard('Keep the 429 body as JSON.{Control>}{Enter}{/Control}');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(status()).toHaveTextContent('Comment added on lines 15 to 16 of app/api/chat/route.ts.');
    // Focus goes back to the hunk, and the comment shows under its last line.
    expect(second).toHaveFocus();
    const comment = within(second)
      .getByText('Keep the 429 body as JSON.')
      .closest('[data-slot="signoff-diff-comment"]')!;
    expect(comment.previousElementSibling).toHaveAttribute('data-line-index', '4');
    expect(within(comment as HTMLElement).getByText(/On lines 15 to 16/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Apply/ }));
    expect(onSubmit.mock.calls[0]![0].comments).toEqual([
      {
        id: expect.any(String),
        fileId: 'app/api/chat/route.ts',
        path: 'app/api/chat/route.ts',
        target: 'lines',
        hunkId: 'app/api/chat/route.ts:1',
        side: 'new',
        startLine: 15,
        endLine: 16,
        text: 'Keep the 429 body as JSON.',
        excerpt: expect.stringMatching(/^\+ {2}const ip = .*\n\+ {2}const \{ success/),
      },
    ]);
  });

  it('comments on the whole hunk with C when no lines are selected, or from the hunk’s button', async () => {
    const user = userEvent.setup();
    const onCommentsChange = vi.fn<(comments: DiffReviewComment[]) => void>();
    render(<DiffReview files={files} onCommentsChange={onCommentsChange} />);
    hunks()[0]!.focus();
    await user.keyboard('c');
    expect(screen.getByRole('textbox', { name: 'Comment on the hunk, for the agent' })).toHaveFocus();
    await user.keyboard('Import it from the barrel file.');
    await user.click(screen.getByRole('button', { name: 'Comment' }));
    expect(onCommentsChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        target: 'hunk',
        hunkId: 'app/api/chat/route.ts:0',
        side: 'new',
        startLine: 4,
        endLine: 4,
      }),
    ]);
    await user.click(within(hunks()[2]!).getByRole('button', { name: 'Comment on hunk 3' }));
    expect(screen.getByRole('textbox')).toHaveFocus();
  });

  it('cancels with Escape or Cancel, and an empty comment is not saved', async () => {
    const user = userEvent.setup();
    const onCommentsChange = vi.fn();
    render(<DiffReview files={files} onCommentsChange={onCommentsChange} />);
    const first = hunks()[0]!;
    first.focus();
    await user.keyboard('c');
    await user.keyboard('Never mind{Escape}');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(first).toHaveFocus();
    await user.keyboard('c');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.keyboard('c');
    await user.keyboard('   {Control>}{Enter}{/Control}');
    expect(onCommentsChange).not.toHaveBeenCalled();
  });

  it('edits and deletes a comment', async () => {
    const user = userEvent.setup();
    const comment: DiffReviewComment = {
      id: 'c1',
      fileId: 'app/api/chat/route.ts',
      path: 'app/api/chat/route.ts',
      target: 'lines',
      hunkId: 'app/api/chat/route.ts:1',
      side: 'new',
      startLine: 15,
      endLine: 15,
      text: 'Use the real IP header.',
    };
    function Controlled() {
      const [comments, setComments] = useState<DiffReviewComment[]>([comment]);
      return <DiffReview files={files} comments={comments} onCommentsChange={setComments} />;
    }
    render(<Controlled />);
    await user.click(screen.getByRole('button', { name: 'Edit comment on line 15' }));
    const editor = screen.getByRole('textbox', { name: 'Comment on line 15, for the agent' });
    expect(editor).toHaveValue('Use the real IP header.');
    await user.clear(editor);
    await user.type(editor, 'Use x-real-ip.');
    await user.click(screen.getByRole('button', { name: 'Save comment' }));
    expect(screen.getByText('Use x-real-ip.')).toBeInTheDocument();
    expect(status()).toHaveTextContent('Comment updated.');
    await user.click(screen.getByRole('button', { name: 'Delete comment on line 15' }));
    expect(screen.queryByText('Use x-real-ip.')).not.toBeInTheDocument();
    expect(status()).toHaveTextContent('Comment deleted.');
  });

  it('submits again once a comment changes', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<DiffReview files={files} onSubmit={onSubmit} />);
    const apply = () => user.click(screen.getByRole('button', { name: /^Apply/ }));
    await apply();
    await apply();
    hunks()[0]!.focus();
    await user.keyboard('cAlso export it.{Control>}{Enter}{/Control}');
    await apply();
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit.mock.calls[1]![0].comments).toHaveLength(1);
  });

  it('shows comments and no editing controls when read-only', () => {
    const comment: DiffReviewComment = {
      id: 'c1',
      fileId: 'app/api/chat/route.ts',
      path: 'app/api/chat/route.ts',
      target: 'hunk',
      hunkId: 'app/api/chat/route.ts:0',
      side: 'new',
      startLine: 4,
      endLine: 4,
      text: 'Fine as it is.',
    };
    render(<DiffReview files={files} readOnly defaultComments={[comment]} />);
    expect(screen.getByText('Fine as it is.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /comment/i })).not.toBeInTheDocument();
  });

  it('has no axe violations with lines selected, a comment and the editor open', async () => {
    const user = userEvent.setup();
    const { container } = render(<DiffReview files={files} onSubmit={() => {}} />);
    hunks()[1]!.focus();
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}cA comment.{Control>}{Enter}{/Control}');
    hunks()[2]!.focus();
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}c');
    expect(await axe(container)).toHaveNoViolations();
  });
});
