import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { applyPatch } from 'diff';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { DiffReviewResult } from '../src/lib/review';
import { useDiffReview, type UseDiffReviewOptions } from '../src/use-diff-review';
import { axe } from './utils';
import { ROUTE_NEW, ROUTE_OLD } from './fixtures';

/** A review in a team's own markup: plain elements, the hook's getters, and nothing from DiffReview. */
function MyReview(props: UseDiffReviewOptions) {
  const review = useDiffReview(props);
  return (
    <section aria-label="My review" {...review.getRootProps()}>
      <ol>
        {review.items.map((item, index) => (
          <li key={item.id}>
            <div {...review.getItemProps(index)}>
              <pre>{item.hunk?.lines.map((l) => l.content).join('\n')}</pre>
              <button {...review.getDecisionProps(index, 'accepted')}>Keep</button>
              <button {...review.getDecisionProps(index, 'rejected')}>Drop</button>
            </div>
          </li>
        ))}
      </ol>
      {review.draft && (
        <label>
          Note
          <textarea {...review.getDraftProps()} />
        </label>
      )}
      <button {...review.getSubmitProps()}>Send</button>
      <p role="status">{review.announcement}</p>
    </section>
  );
}

const files = [{ path: 'app/route.ts', oldContent: ROUTE_OLD, newContent: ROUTE_NEW }];

describe('useDiffReview', () => {
  it('gives a custom markup the same review: keyboard, decisions, comments and the result', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(result: DiffReviewResult, review: { toPatch: () => string }) => void>();
    render(<MyReview files={files} onSubmit={onSubmit} />);
    const items = screen.getAllByRole('group');
    expect(items.map((i) => i.tabIndex)).toEqual([0, -1, -1]);
    expect(items[0]).toHaveAccessibleName('Hunk 1 of 3, app/route.ts, lines 1 to 7, not reviewed');
    items[0]!.focus();
    await user.keyboard('a');
    expect(items[1]).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Hunk 1 of 3 accepted. 2 remaining.');
    await user.keyboard('r');
    expect(items[1]).toHaveAttribute('data-decision', 'rejected');
    // A comment, written in the custom textarea.
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}c');
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveFocus();
    await user.keyboard('Why 29?{Control>}{Enter}{/Control}');
    await user.click(screen.getAllByRole('button', { name: 'Keep' })[2]!);
    expect(screen.getAllByRole('button', { name: 'Keep' })[2]).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    const [result, review] = onSubmit.mock.calls[0]!;
    expect(result).toMatchObject({ accepted: 2, rejected: 1, pending: 0 });
    expect(result.comments).toMatchObject([{ target: 'lines', text: 'Why 29?' }]);
    expect(applyPatch(ROUTE_OLD, review.toPatch())).toBe(result.files[0]!.content);
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('computes the result on demand, and applies nothing while read-only', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const seen: Array<ReturnType<typeof useDiffReview>> = [];
    function Probe(props: UseDiffReviewOptions) {
      const review = useDiffReview(props);
      useEffect(() => {
        seen.push(review);
      });
      return <MyReview {...props} />;
    }
    render(<Probe files={files} readOnly onSubmit={onSubmit} defaultDecisions={{ 'app/route.ts:0': 'accepted' }} />);
    const latest = () => seen.at(-1)!;
    expect(latest().result().accepted).toBe(1);
    expect(latest().toPatch()).toContain('+import { ratelimit }');
    screen.getAllByRole('group')[0]!.focus();
    await user.keyboard('r{Control>}{Enter}{/Control}');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(latest().decisions).toEqual({ 'app/route.ts:0': 'accepted' });
  });
});
