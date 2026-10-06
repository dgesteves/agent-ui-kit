import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Markdown } from '../src/markdown';
import { axe } from './utils';

describe('Markdown', () => {
  it('renders GFM: headings, lists, tables, inline and block code', () => {
    const { container } = render(
      <Markdown>
        {'## Plan\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nUse `ratelimit`.\n\n```ts\nconst x = 1;\n```'}
      </Markdown>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Plan' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('ratelimit').tagName).toBe('CODE');
    expect(container.querySelector('pre')).toHaveTextContent('const x = 1;');
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument();
  });

  it('closes unterminated syntax while streaming and shows a caret', () => {
    const { container } = render(<Markdown streaming>{'This is **important'}</Markdown>);
    expect(container.querySelector('strong')).toHaveTextContent('important');
    expect(container.querySelector('[class*="animate-aui-blink"]')).not.toBeNull();
    expect(container).not.toHaveTextContent('**');
  });

  it('does not render raw HTML or javascript: URLs', () => {
    const { container } = render(
      <Markdown>{'<script>alert(1)</script>\n\nInline <b>x</b> and [click](javascript:alert(1))'}</Markdown>,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText('click').closest('a')?.getAttribute('href') ?? '').not.toContain('javascript');
  });

  it('opens external links in a new tab', () => {
    render(<Markdown>{'[docs](https://ai-sdk.dev)'}</Markdown>);
    expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute('target', '_blank');
  });

  it('turns [n] markers into citation links, but not inside code', () => {
    const { container } = render(
      <Markdown citations={2} citationPrefix="m1-source">
        {'Sliding windows work well [1][2]. Arrays use `a[1]`. Out of range [3].'}
      </Markdown>,
    );
    expect(screen.getByRole('link', { name: 'Source 1' })).toHaveAttribute('href', '#m1-source-1');
    expect(screen.getByRole('link', { name: 'Source 2' })).toHaveAttribute('href', '#m1-source-2');
    expect(screen.queryByRole('link', { name: 'Source 3' })).not.toBeInTheDocument();
    expect(container.querySelector('code')).toHaveTextContent('a[1]');
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <Markdown citations={1}>{'# Title\n\nText [1] with [a link](https://x.dev).\n\n```sh\npnpm i\n```'}</Markdown>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
