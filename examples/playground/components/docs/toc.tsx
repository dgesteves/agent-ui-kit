'use client';

import { useEffect, useState } from 'react';
import type { Heading } from '@/lib/docs';

/** "On this page": the page's sections, with the one being read marked as you scroll. */
export function TableOfContents({ headings }: { headings: Heading[] }) {
  const [active, setActive] = useState<string | undefined>(undefined);

  useEffect(() => {
    const elements = headings.map((h) => document.getElementById(h.id)).filter((el): el is HTMLElement => el !== null);
    // The section being read is the last heading above a line a fifth of the way down the screen.
    const update = () => {
      const line = window.innerHeight * 0.2 + 56;
      let current: string | undefined;
      for (const el of elements) {
        if (el.getBoundingClientRect().top <= line) current = el.id;
        else break;
      }
      setActive(current ?? elements[0]?.id);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [headings]);

  if (headings.length === 0) return null;
  return (
    <nav aria-labelledby="toc-heading" className="text-[13px]">
      <p
        id="toc-heading"
        className="mb-3 font-mono text-[10.5px] font-medium tracking-[0.08em] text-[#8b94a0] uppercase"
      >
        On this page
      </p>
      <ul className="flex flex-col gap-1 border-l border-[#262b33]">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              aria-current={active === h.id ? 'location' : undefined}
              className={`focus-visible:outline-cyan-soft -ml-px block border-l py-1 leading-snug transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 ${
                h.depth === 3 ? 'pl-6' : 'pl-3'
              } ${
                active === h.id
                  ? 'border-cyan text-[#e8eaed]'
                  : 'border-transparent text-[#8b94a0] hover:text-[#e8eaed]'
              }`}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
