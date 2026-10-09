'use client';

import { useState, type ReactNode } from 'react';

/** A live example on the kit's own background, in its dark or light palette. */
export function Preview({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  return (
    <div className="overflow-hidden rounded-xl border border-[#262b33]">
      <div className="flex items-center justify-between gap-3 border-b border-[#262b33] bg-[#101317] px-3 py-1.5">
        <span className="font-mono text-[11px] text-[#8b94a0]">Live</span>
        <div role="group" aria-label="Example theme" className="flex rounded-md p-0.5">
          {(['dark', 'light'] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={theme === t}
              onClick={() => setTheme(t)}
              className="focus-visible:outline-cyan-soft cursor-pointer rounded px-2 py-0.5 text-[11.5px] text-[#8b94a0] capitalize transition-colors hover:text-[#e8eaed] focus-visible:outline-2 aria-pressed:bg-[#262b33] aria-pressed:text-[#e8eaed]"
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className={`${theme} bg-aui-bg text-aui-fg p-4 sm:p-6`}>{children}</div>
    </div>
  );
}
