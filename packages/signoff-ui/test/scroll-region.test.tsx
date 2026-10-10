import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApprovalCard } from '../src/approval-card';
import { DiffReview } from '../src/diff-review';
import { Markdown } from '../src/markdown';
import { RunMeter } from '../src/run-meter';
import { axe } from './utils';

/*
 * Horizontal scrollers join the tab order, named, only while their content overflows, so the
 * arrow keys can scroll them (WCAG 2.1.1). jsdom has no layout, so widths and ResizeObserver are
 * stubbed: `contentWidth` is how wide every scroller's content is, in a 300px box.
 */
let contentWidth = 800;
const observers: Array<() => void> = [];

beforeEach(() => {
  contentWidth = 800;
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(300);
  vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(() => contentWidth);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        observers.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  observers.length = 0;
});

const LONG = `export const limiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '10 s'), prefix: 'chat' });`;

describe('scrollable regions', () => {
  it('DiffReview: an overflowing hunk’s code is a named group in the tab order', async () => {
    const { container } = render(
      <DiffReview files={[{ path: 'lib/ratelimit.ts', oldContent: '', newContent: `${LONG}\n` }]} />,
    );
    const code = screen.getByRole('group', { name: 'Hunk 1 code, lib/ratelimit.ts' });
    expect(code).toHaveAttribute('tabindex', '0');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Markdown: a wide code block and a wide table are named groups in the tab order', () => {
    render(<Markdown>{`\`\`\`ts\n${LONG}\n\`\`\`\n\n| a | b |\n| --- | --- |\n| ${LONG} | x |`}</Markdown>);
    expect(screen.getByRole('group', { name: 'Code, ts' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('group', { name: 'Table' })).toHaveAttribute('tabindex', '0');
  });

  it('ApprovalCard: a long command preview is reachable', () => {
    render(<ApprovalCard toolName="run_command" input={{ command: LONG }} shortcuts={false} />);
    expect(screen.getByRole('group', { name: 'Command' })).toHaveAttribute('tabindex', '0');
  });

  it('RunMeter: the compact strip joins the tab order and keeps its own name', () => {
    render(<RunMeter usage={{ inputTokens: 38_660, outputTokens: 2_412 }} ttftMs={684} durationMs={21_800} />);
    const strip = screen.getByRole('group', { name: 'Run metrics' });
    expect(strip).toHaveAttribute('tabindex', '0');
  });

  it('adds no tab stop while everything fits, and leaves the tab order once it fits again', () => {
    contentWidth = 300;
    render(<Markdown>{`\`\`\`ts\nconst a = 1;\n\`\`\``}</Markdown>);
    const pre = document.querySelector('pre')!;
    expect(pre).not.toHaveAttribute('tabindex');
    expect(pre).not.toHaveAttribute('role');

    contentWidth = 800;
    act(() => observers.forEach((callback) => callback()));
    expect(pre).toHaveAttribute('tabindex', '0');
    expect(pre).toHaveAttribute('aria-label', 'Code, ts');

    contentWidth = 300;
    act(() => observers.forEach((callback) => callback()));
    expect(pre).not.toHaveAttribute('tabindex');
    expect(pre).not.toHaveAttribute('aria-label');
  });
});
