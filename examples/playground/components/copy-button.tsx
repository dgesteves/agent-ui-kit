'use client';

import { useEffect, useState } from 'react';
import { CheckIcon, CopyIcon } from './icons';

/**
 * Copies `text` and says so: the icon turns into a check, and a live region announces it.
 * `label` names the button for screen readers ("Copy the install command").
 */
export function CopyButton({ text, label, className = '' }: { text: string; label: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (state === 'idle') return;
    const id = setTimeout(() => setState('idle'), 1600);
    return () => clearTimeout(id);
  }, [state]);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => {
          navigator.clipboard.writeText(text).then(
            () => setState('copied'),
            () => setState('failed'),
          );
        }}
        className={`focus-visible:outline-cyan-soft inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-[#a1a9b4] transition-colors hover:bg-[#262b33] hover:text-[#e8eaed] focus-visible:outline-2 focus-visible:outline-offset-1 ${className}`}
      >
        {state === 'copied' ? <CheckIcon className="text-cyan-soft size-4" /> : <CopyIcon className="size-4" />}
      </button>
      <span className="sr-only" aria-live="polite">
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copying failed: select the text instead' : ''}
      </span>
    </>
  );
}

/** A one-line shell command with a copy button, e.g. the install command. */
export function CommandLine({
  command,
  label,
  className = '',
}: {
  command: string;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={`border-line flex h-11 min-w-0 items-center gap-2 rounded-lg border bg-[#101317] pr-1.5 pl-3.5 ${className}`}
    >
      <span className="font-mono text-[13px] text-[#8b94a0] select-none" aria-hidden="true">
        $
      </span>
      <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-[#e8eaed]">{command}</code>
      <CopyButton text={command} label={label} />
    </div>
  );
}
