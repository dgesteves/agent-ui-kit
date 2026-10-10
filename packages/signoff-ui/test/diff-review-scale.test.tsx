import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiffReview, type DiffReviewResult } from '../src/diff-review';
import { resetDiffWorkers } from '../src/lib/diff-async';
import { answerDiffRequest, type DiffWorkerRequest } from '../src/lib/diff-worker';
import { axe } from './utils';

const lines = (count: number, prefix: string) =>
  Array.from({ length: count }, (_, i) => `export const ${prefix}${i} = compute(${i});`);
const text = (rows: string[]) => rows.join('\n') + '\n';

/** 100 small hunks, 797 lines: diffed while rendering (few edits), virtualized (many rows). */
const localEdit = () => {
  const rows = lines(5_000, 'a');
  return {
    path: 'src/big.ts',
    oldContent: text(rows),
    newContent: text(rows.map((l, i) => (i % 50 === 0 ? l.replace('compute', 'measure') : l))),
  };
};
/** 800 lines changed: more than a render may diff, so it is diffed in the background. */
const rewrite = (n = 400) => ({
  path: 'src/rewrite.ts',
  oldContent: text(lines(n, 'a')),
  newContent: text(lines(n, 'b')),
});

const hunks = () => screen.getAllByRole('group', { name: /^Hunk/ });
const chunks = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>('[data-slot="signoff-diff-chunk"]'),
];

/** An IntersectionObserver the test drives: `report` says which chunks are near the viewport. */
class FakeObserver {
  static current: FakeObserver[] = [];
  targets = new Set<Element>();
  constructor(readonly callback: IntersectionObserverCallback) {
    FakeObserver.current.push(this);
  }
  observe(el: Element) {
    this.targets.add(el);
  }
  unobserve(el: Element) {
    this.targets.delete(el);
  }
  disconnect() {
    this.targets.clear();
  }
  static report(el: Element, near: boolean, height = 0) {
    for (const observer of FakeObserver.current) {
      if (!observer.targets.has(el)) continue;
      const entry = { target: el, isIntersecting: near, boundingClientRect: { height } } as IntersectionObserverEntry;
      act(() => observer.callback([entry], observer as unknown as IntersectionObserver));
    }
  }
}

describe('DiffReview at scale', () => {
  describe('with IntersectionObserver', () => {
    beforeEach(() => {
      FakeObserver.current = [];
      vi.stubGlobal('IntersectionObserver', FakeObserver);
    });
    afterEach(() => vi.unstubAllGlobals());

    it('renders the rows near the screen and keeps the rest as text with their height', () => {
      const { container } = render(<DiffReview files={[localEdit()]} />);
      expect(hunks()).toHaveLength(100);
      const all = chunks(container);
      const rendered = all.filter((c) => c.hasAttribute('data-rendered'));
      // The first 100 rows render before anything is measured; the rest wait for the viewport.
      expect(rendered.length).toBeGreaterThan(0);
      expect(rendered.length).toBeLessThan(all.length / 4);
      const far = all.at(-1)!;
      expect(far.querySelector('[data-line]')).toBeNull();
      // Eight lines of 20px: a change with three lines of context on each side.
      expect(far.style.height).toBe(`${8 * 20}px`);
      // A screen reader still reads every line, with what happened to it.
      expect(far.textContent).toBe(
        [
          'export const a4947 = compute(4947);',
          'export const a4948 = compute(4948);',
          'export const a4949 = compute(4949);',
          'Removed: export const a4950 = compute(4950);',
          'Added: export const a4950 = measure(4950);',
          'export const a4951 = compute(4951);',
          'export const a4952 = compute(4952);',
          'export const a4953 = compute(4953);',
        ].join('\n'),
      );
    });

    it('renders a chunk as it comes near, and keeps its measured height once it leaves', () => {
      const { container } = render(<DiffReview files={[localEdit()]} />);
      const far = chunks(container).at(-1)!;
      FakeObserver.report(far, true);
      expect(far.querySelectorAll('[data-line]')).toHaveLength(8);
      FakeObserver.report(far, false, 333);
      expect(far.querySelector('[data-line]')).toBeNull();
      expect(far.style.height).toBe('333px');
    });

    it('keeps a chunk that holds focus rendered', () => {
      const { container } = render(<DiffReview files={[localEdit()]} />);
      const first = chunks(container)[0]!;
      const row = first.querySelector<HTMLElement>('[data-line]')!;
      row.tabIndex = -1;
      row.focus();
      FakeObserver.report(first, false, 200);
      expect(first.querySelector('[data-line]')).not.toBeNull();
    });

    // A hundred hunks in jsdom: slow on shared CI runners, so these two get time.
    it('moves through every hunk from the keyboard, rendered or not', { timeout: 30_000 }, async () => {
      const user = userEvent.setup();
      render(<DiffReview files={[localEdit()]} autoAdvance={false} />);
      const all = hunks();
      all[0]!.focus();
      for (let i = 0; i < 98; i++) fireEvent.keyDown(document.activeElement!, { key: 'j' });
      await user.keyboard('j');
      expect(all[99]).toHaveFocus();
      await user.keyboard('a');
      expect(all[99]).toHaveAttribute('data-decision', 'accepted');
      expect(all[99]).toHaveAccessibleName('Hunk 100 of 100, src/big.ts, lines 4948 to 4954, accepted');
    });

    it('virtualizes split view too, reading each line once', () => {
      const { container } = render(<DiffReview files={[localEdit()]} view="split" />);
      const far = chunks(container).at(-1)!;
      expect(far.querySelector('[data-line]')).toBeNull();
      // The removed and added line share a row: 7 rows, 8 lines read.
      expect(far.style.height).toBe(`${7 * 20}px`);
      expect(far.textContent!.split('\n')).toHaveLength(8);
      FakeObserver.report(far, true);
      expect(far.querySelectorAll('[data-line]')).toHaveLength(14);
    });

    it('has no axe violations with chunks off screen', { timeout: 30_000 }, async () => {
      const { container } = render(<DiffReview files={[localEdit()]} onSubmit={() => {}} />);
      expect(await axe(container)).toHaveNoViolations();
    });
  });

  it('renders every row once mounted where there is no IntersectionObserver', async () => {
    const { container } = render(<DiffReview files={[localEdit()]} />);
    await waitFor(() => expect(chunks(container).every((c) => c.hasAttribute('data-rendered'))).toBe(true));
    expect(container.querySelectorAll('[data-line]')).toHaveLength(797);
  });

  it('does not virtualize a small review', () => {
    const { container } = render(<DiffReview files={[{ path: 'a.ts', oldContent: 'a\nb\n', newContent: 'a\nB\n' }]} />);
    expect(chunks(container)).toEqual([]);
  });

  it('shows a large file as being compared, then its hunks, with Apply waiting for it', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(result: DiffReviewResult) => void>();
    // A worker that answers when the test says so.
    const held: Array<() => void> = [];
    class HeldWorker extends EventTarget {
      postMessage(request: DiffWorkerRequest) {
        held.push(() => this.dispatchEvent(new MessageEvent('message', { data: answerDiffRequest(request) })));
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', HeldWorker);
    const small = { path: 'a.ts', oldContent: 'a\n', newContent: 'A\n' };
    render(<DiffReview files={[small, rewrite()]} onSubmit={onSubmit} diffWorker={() => new Worker('held')} />);
    const busy = () => document.querySelector('[aria-busy="true"]');
    expect(screen.getByText('Comparing changes…').closest('[data-slot="signoff-diff-file"]')).toBe(busy());
    expect(screen.getByText(/2 files · 1 hunk so far/)).toBeInTheDocument();
    // The file already compared can be reviewed; applying waits for the rest.
    expect(hunks()).toHaveLength(1);
    const apply = screen.getByRole('button', { name: /^Apply/ });
    expect(apply).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Accept all' })).toHaveAttribute('aria-disabled', 'true');
    await user.click(apply);
    await user.click(screen.getByRole('button', { name: 'Accept all' }));
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Accept hunk 1' }));
    // Decisions are announced meanwhile: nothing busy holds the live region back.
    expect(screen.getByRole('status')).toHaveTextContent('Hunk 1 of 1 accepted. All hunks reviewed.');
    expect(screen.getByRole('status').closest('[aria-busy="true"]')).toBeNull();
    await waitFor(() => expect(held).toHaveLength(1));
    act(() => held[0]!());
    await waitFor(() => expect(busy()).toBeNull());
    expect(screen.queryByText('Comparing changes…')).not.toBeInTheDocument();
    expect(hunks()).toHaveLength(2);
    expect(apply).not.toHaveAttribute('aria-disabled');
    await user.click(apply);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ accepted: 1, pending: 1 });
    vi.unstubAllGlobals();
    resetDiffWorkers();
  });

  it('says so when a file falls back to one replacing hunk', async () => {
    render(<DiffReview files={[rewrite()]} maxEditLength={500} diffWorker={false} />);
    await screen.findByText(/Too many changes to compare line by line/);
    expect(hunks()).toHaveLength(1);
    expect(screen.getByText(/1 file · 1 hunk/)).toBeInTheDocument();
    expect(document.querySelector('[data-slot="signoff-diff-file"]')).toHaveAttribute('data-fallback', 'replace');
  });

  it('drops a background result for a file that changed meanwhile', async () => {
    const { rerender } = render(<DiffReview files={[rewrite(400)]} diffWorker={false} />);
    rerender(<DiffReview files={[rewrite(401)]} diffWorker={false} />);
    await waitFor(() => expect(hunks()).toHaveLength(1));
    expect(hunks()[0]).toHaveAccessibleName(/lines 1 to 401/);
  });

  it('renders the same on the server and the client, so hydration keeps the page', async () => {
    const files = [localEdit(), rewrite()];
    const html = renderToString(<DiffReview files={files} />);
    expect(html).toContain('Comparing changes…');
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const root = await act(async () => hydrateRoot(container, <DiffReview files={files} diffWorker={false} />));
    await waitFor(() => expect(container.textContent).not.toContain('Comparing changes…'));
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
    act(() => root.unmount());
    container.remove();
  });
});
