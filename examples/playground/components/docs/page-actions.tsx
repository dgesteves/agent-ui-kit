'use client';

import { useEffect, useState } from 'react';
import { SITE_URL } from '@/lib/site';
import { ArrowUpRightIcon, CheckIcon, CopyIcon } from '../icons';

/**
 * Copy the page as Markdown, read it as Markdown, or hand it to ChatGPT or Claude. The Markdown is
 * served at `<page>.md`; the chat links pass the public URL, so the assistant reads the same text.
 */
export function PageActions({ markdownPath }: { markdownPath: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (state === 'idle') return;
    const id = setTimeout(() => setState('idle'), 1600);
    return () => clearTimeout(id);
  }, [state]);

  const copy = async () => {
    const text = fetch(markdownPath).then((response) => {
      if (!response.ok) throw new Error(String(response.status));
      return response.text();
    });
    try {
      // Safari only allows the write within the click, so hand it the pending text.
      if (typeof ClipboardItem !== 'undefined' && 'write' in navigator.clipboard) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'text/plain': text.then((t) => new Blob([t], { type: 'text/plain' })) }),
        ]);
      } else {
        await navigator.clipboard.writeText(await text);
      }
      setState('copied');
    } catch {
      setState('failed');
    }
  };

  const prompt = `Read ${SITE_URL}${markdownPath} so I can ask questions about it.`;
  // Phones show the short label; the rest of the name is still read out.
  const links = [
    { verb: 'View as ', label: 'Markdown', href: markdownPath },
    { verb: 'Open in ', label: 'ChatGPT', href: `https://chatgpt.com/?hints=search&q=${encodeURIComponent(prompt)}` },
    { verb: 'Open in ', label: 'Claude', href: `https://claude.ai/new?q=${encodeURIComponent(prompt)}` },
  ];
  const button =
    'focus-visible:outline-cyan-soft inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-[#262b33] bg-[#12151a] px-2.5 text-[12.5px] font-medium text-[#c9d1d9] transition-colors hover:border-[#353c47] hover:text-[#f1f3f5] focus-visible:outline-2 focus-visible:outline-offset-2';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => void copy()} className={button}>
        {state === 'copied' ? <CheckIcon className="text-cyan-soft size-3.5" /> : <CopyIcon className="size-3.5" />}
        {state === 'copied' ? (
          'Copied'
        ) : (
          <span>
            Copy<span className="max-sm:sr-only"> page</span>
            <span className="sr-only"> as Markdown</span>
          </span>
        )}
      </button>
      <span className="sr-only" aria-live="polite">
        {state === 'copied' ? 'Page copied as Markdown' : state === 'failed' ? 'Copying failed' : ''}
      </span>
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          className={button}
          {...(link.href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}
        >
          <span>
            <span className="max-sm:sr-only">{link.verb}</span>
            {link.label}
          </span>
          {link.href.startsWith('http') && (
            <>
              <ArrowUpRightIcon className="size-3 text-[#8b94a0]" />
              <span className="sr-only">(opens in a new tab)</span>
            </>
          )}
        </a>
      ))}
    </div>
  );
}
