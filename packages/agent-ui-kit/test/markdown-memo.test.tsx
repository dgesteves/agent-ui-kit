import { render } from '@testing-library/react';
import type remarkGfmType from 'remark-gfm';
import { beforeEach, expect, it, vi } from 'vitest';
import { AgentMessage } from '../src/agent-message';
import { Markdown } from '../src/markdown';
import { Reasoning } from '../src/reasoning';

// Count parses: react-markdown attaches its remark plugins once per render of a Markdown.
const parses = vi.hoisted(() => ({ count: 0 }));
vi.mock('remark-gfm', async (importOriginal) => {
  const { default: remarkGfm } = await importOriginal<{ default: typeof remarkGfmType }>();
  return {
    default: function countingRemarkGfm(this: unknown, ...args: Parameters<typeof remarkGfm>) {
      parses.count++;
      return remarkGfm.apply(this as never, args);
    },
  };
});

beforeEach(() => {
  parses.count = 0;
});

const message = (tail: string) => ({
  id: 'm',
  role: 'assistant' as const,
  parts: [
    { type: 'text' as const, text: 'Zeroth finished part.', state: 'done' as const },
    { type: 'text' as const, text: 'First finished part.', state: 'done' as const },
    { type: 'text' as const, text: 'Second finished part.', state: 'done' as const },
    { type: 'text' as const, text: `Streaming ${tail}`, state: 'streaming' as const },
  ],
});

it('re-parses only the streaming part when allowedImageHosts is an inline array', () => {
  const ui = (tail: string) => (
    // A new array on every render, as in `allowedImageHosts={['images.example.com']}`.
    <AgentMessage message={message(tail)} allowedImageHosts={['images.example.com', 'self']} />
  );
  const { rerender } = render(ui('a'));
  expect(parses.count).toBe(4);
  for (const tail of ['ab', 'abc', 'abcd']) rerender(ui(tail));
  expect(parses.count).toBe(4 + 3);
});

it('does not re-parse open reasoning when only its container re-renders', () => {
  const ui = (durationMs: number) => (
    <Reasoning text="Planned the change." defaultOpen durationMs={durationMs} allowedImageHosts={['self']} />
  );
  const { rerender } = render(ui(1000));
  rerender(ui(2000));
  expect(parses.count).toBe(1);
});

it('re-renders when the host list changes by value', () => {
  const { container, rerender } = render(
    <Markdown allowedImageHosts={['a.test']}>{'![x](https://b.test/x.png)'}</Markdown>,
  );
  rerender(<Markdown allowedImageHosts={['a.test']}>{'![x](https://b.test/x.png)'}</Markdown>);
  expect(parses.count).toBe(1);
  expect(container.querySelector('img')).toBeNull();
  rerender(<Markdown allowedImageHosts={['a.test', 'b.test']}>{'![x](https://b.test/x.png)'}</Markdown>);
  expect(parses.count).toBe(2);
  expect(container.querySelector('img')).toHaveAttribute('src', 'https://b.test/x.png');
});
