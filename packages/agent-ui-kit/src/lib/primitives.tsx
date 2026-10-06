'use client';

import { useEffect, useMemo, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { CheckIcon, CopyIcon } from './icons';
import { safeStringify } from './format';
import { TOKEN_CLASS, tokenizeLine } from './highlight';
import { cn } from './utils';

/** Keyboard key hint. Purely visual: shortcuts are also described in text for assistive tech. */
export function Kbd({ className, ...props }: ComponentPropsWithoutRef<'kbd'>) {
  return (
    <kbd
      className={cn(
        'border-aui-border-strong bg-aui-bg/40 font-aui-mono text-aui-fg-muted inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border px-1 text-[11px] leading-none font-medium',
        className,
      )}
      {...props}
    />
  );
}

/** A visually hidden live region. Render it unconditionally so updates are announced. */
export function LiveRegion({
  children,
  politeness = 'polite',
}: {
  children?: ReactNode;
  politeness?: 'polite' | 'assertive';
}) {
  return (
    <div
      className="sr-only"
      role={politeness === 'assertive' ? 'alert' : 'status'}
      aria-live={politeness}
      aria-atomic="true"
    >
      {children}
    </div>
  );
}

/** Returns `value` after it has been stable for `delayMs`. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function CopyButton({ text, label = 'Copy', className }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard can be unavailable (permissions, insecure context); fail quietly.
        }
      }}
      aria-label={copied ? 'Copied' : label}
      className={cn(
        'text-aui-fg-subtle hover:bg-aui-surface-2 hover:text-aui-fg focus-visible:outline-aui-ring inline-flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-1',
        className,
      )}
    >
      {copied ? <CheckIcon size={14} className="text-aui-accent-fg" /> : <CopyIcon size={14} />}
    </button>
  );
}

/** Syntax-tinted, line-tokenized code. */
export function CodeLines({ code, language }: { code: string; language: string }) {
  const lines = useMemo(() => code.split('\n'), [code]);
  return (
    <code>
      {lines.map((line, i) => (
        <span key={i} className="block min-h-[1lh]">
          {tokenizeLine(line, language).map((t, j) => (
            <span key={j} className={TOKEN_CLASS[t.kind] || undefined}>
              {t.text}
            </span>
          ))}
        </span>
      ))}
    </code>
  );
}

export interface JsonViewProps {
  value: unknown;
  /** Accessible name for the code block, e.g. "Input". */
  label: string;
  /** Lines shown before "Show all" collapses the rest. */
  collapseAfter?: number;
  className?: string;
}

/** Read-only JSON with light syntax tinting, a copy button and long-output folding. */
export function JsonView({ value, label, collapseAfter = 24, className }: JsonViewProps) {
  const text = useMemo(() => (typeof value === 'string' ? value : safeStringify(value)), [value]);
  const language = typeof value === 'string' ? 'text' : 'json';
  const lineCount = useMemo(() => text.split('\n').length, [text]);
  const [showAll, setShowAll] = useState(false);
  const folded = !showAll && lineCount > collapseAfter;
  const shown = folded ? text.split('\n').slice(0, collapseAfter).join('\n') : text;
  return (
    <div data-slot="json-view" className={cn('group/json relative', className)}>
      <pre
        role="group"
        aria-label={label}
        tabIndex={0}
        className="border-aui-border bg-aui-bg/60 font-aui-mono text-aui-fg focus-visible:outline-aui-ring max-h-80 overflow-auto rounded-lg border px-3 py-2.5 text-xs leading-5 whitespace-pre focus-visible:outline-2 focus-visible:outline-offset-1"
      >
        <CodeLines code={shown} language={language} />
      </pre>
      <div className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-focus-within/json:opacity-100 group-hover/json:opacity-100 [@media(hover:none)]:opacity-100">
        <CopyButton text={text} label={`Copy ${label.toLowerCase()}`} />
      </div>
      {lineCount > collapseAfter && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="font-aui-mono text-aui-fg-subtle hover:text-aui-fg focus-visible:outline-aui-ring mt-1.5 cursor-pointer rounded text-[11px] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-1"
        >
          {showAll ? 'Show less' : `Show all ${lineCount} lines`}
        </button>
      )}
    </div>
  );
}

export const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aui-ring';
