'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { THEME_KEY, type ThemeChoice } from '@/lib/theme';
import { MonitorIcon, MoonIcon, SunIcon } from './icons';

const CHOICES: Array<{ value: ThemeChoice; label: string; Icon: typeof SunIcon }> = [
  { value: 'system', label: 'System', Icon: MonitorIcon },
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
];

const DARK_QUERY = '(prefers-color-scheme: dark)';
const listeners = new Set<() => void>();

function read(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Storage unavailable: follow the OS.
  }
  return 'system';
}

/** Puts the theme on <html>: what the script in app/layout.tsx does before paint, after a change. */
function apply(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'system' && window.matchMedia(DARK_QUERY).matches);
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.classList.toggle('light', !dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
}

function choose(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Not remembered, still applied.
  }
  apply(choice);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changed it.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_KEY) return;
    apply(read());
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** System, Light or Dark: a radio group of three icon buttons, arrow keys between them. */
export function ThemeSwitch({ className = '' }: { className?: string }) {
  const choice = useSyncExternalStore(subscribe, read, () => 'system' as ThemeChoice);
  const group = useRef<HTMLDivElement>(null);

  // On System, follow the OS while the page is open.
  useEffect(() => {
    if (choice !== 'system') return;
    const query = window.matchMedia(DARK_QUERY);
    const onChange = () => apply('system');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [choice]);

  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label="Theme"
      className={`border-line bg-raised/60 flex items-center rounded-lg border p-0.5 ${className}`}
    >
      {CHOICES.map(({ value, label, Icon }, i) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={choice === value}
          aria-label={label}
          title={label}
          tabIndex={choice === value ? 0 : -1}
          onClick={() => choose(value)}
          onKeyDown={(event) => {
            const step = ['ArrowRight', 'ArrowDown'].includes(event.key)
              ? 1
              : ['ArrowLeft', 'ArrowUp'].includes(event.key)
                ? -1
                : 0;
            if (!step) return;
            event.preventDefault();
            const next = CHOICES[(i + step + CHOICES.length) % CHOICES.length]!;
            choose(next.value);
            group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[CHOICES.indexOf(next)]?.focus();
          }}
          className="focus-visible:outline-cyan-soft text-fg-muted hover:text-fg aria-checked:bg-line aria-checked:text-fg inline-flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
