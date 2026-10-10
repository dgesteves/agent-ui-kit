'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Replays `text` a few characters at a time, the way a model streams it. */
export function useStream(text: string, { chunk = 3, every = 24 } = {}) {
  const [length, setLength] = useState(text.length);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const streaming = length < text.length;

  const start = useCallback(() => {
    clearInterval(timer.current);
    setLength(0);
    timer.current = setInterval(() => {
      setLength((n) => {
        const next = Math.min(text.length, n + chunk);
        if (next === text.length) clearInterval(timer.current);
        return next;
      });
    }, every);
  }, [text, chunk, every]);

  useEffect(() => () => clearInterval(timer.current), []);
  return { text: text.slice(0, length), streaming, start };
}

export function ReplayButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="border-signoff-border text-signoff-fg-muted hover:text-signoff-fg focus-visible:outline-signoff-ring inline-flex h-7 cursor-pointer items-center rounded-md border px-2.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default disabled:opacity-50"
    >
      {children}
    </button>
  );
}
