'use client';

import { useEffect, useState, type ReactNode } from 'react';

type Theme = 'dark' | 'light';

/**
 * The components page's palette switch. The kit's tokens follow a `.dark` or `.light` ancestor, so
 * one class on the wrapper re-themes every frame; the page's own chrome doesn't use the tokens.
 */
export function GalleryTheme({ intro, children }: { intro: ReactNode; children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark');
  // ?theme=light opens the page on the light palette, for screenshots.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('theme') !== 'light') return;
    const id = setTimeout(() => setTheme('light'), 0);
    return () => clearTimeout(id);
  }, []);
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">{intro}</div>
        <div
          role="radiogroup"
          aria-label="Component theme"
          className="border-line bg-raised/60 flex rounded-lg border p-0.5"
        >
          {(['dark', 'light'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={theme === t}
              tabIndex={theme === t ? 0 : -1}
              onClick={() => setTheme(t)}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
                event.preventDefault();
                const next = t === 'dark' ? 'light' : 'dark';
                setTheme(next);
                (
                  event.currentTarget.parentElement?.querySelector(`[data-theme-option="${next}"]`) as HTMLElement
                )?.focus();
              }}
              data-theme-option={t}
              className="focus-visible:outline-cyan-soft cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium text-[#a1a9b4] capitalize transition-colors hover:text-[#e8eaed] focus-visible:outline-2 focus-visible:outline-offset-1 aria-checked:bg-[#262b33] aria-checked:text-[#e8eaed]"
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className={`${theme} mt-14 flex flex-col gap-16`}>{children}</div>
    </>
  );
}
