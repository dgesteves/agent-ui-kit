'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import type { NavGroup, SearchIndex } from '@/lib/docs';
import { Sheet } from '../controls';
import { MenuIcon } from '../icons';

/*
 * The docs navigation: a sticky sidebar on wide screens, a bar with a menu button on phones. Both
 * have the search box, a filter over page and section titles. ⌘K or Ctrl+K focuses it.
 */

/** Lowercase words, with common endings dropped, so "theme" finds "Theming" and "approvals" "approval". */
function terms(text: string) {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((word) => (word.length > 4 ? word.replace(/(ing|es|s|e)$/, '') : word));
}

/** Every query term starts a word in the text. */
function hit(query: string[], text: string) {
  const words = terms(text);
  return query.every((q) => words.some((word) => word.startsWith(q)));
}

function matches(query: string, index: SearchIndex) {
  const q = terms(query);
  if (q.length === 0) return [];
  const results: Array<{ title: string; page?: string; href: string }> = [];
  for (const page of index) {
    if (hit(q, `${page.title} ${page.description}`)) results.push({ title: page.title, href: page.href });
    for (const section of page.sections) {
      if (hit(q, section.title)) results.push({ title: section.title, page: page.title, href: section.href });
    }
  }
  return results.slice(0, 40);
}

function NavLinks({
  nav,
  index,
  onNavigate,
  autoFocusSearch = false,
}: {
  nav: NavGroup[];
  index: SearchIndex;
  onNavigate?: () => void;
  autoFocusSearch?: boolean;
}) {
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const results = matches(query, index);

  useEffect(() => {
    if (autoFocusSearch) inputRef.current?.focus();
  }, [autoFocusSearch]);

  const link = (active: boolean) =>
    `focus-visible:outline-cyan-soft relative flex items-center rounded-md px-2.5 py-1.5 text-[13.5px] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 ${
      active
        ? 'bg-[#181c22] font-medium text-[#f1f3f5] before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-cyan'
        : 'text-[#a1a9b4] hover:bg-[#14181d] hover:text-[#e8eaed]'
    }`;

  return (
    <div className="flex flex-col gap-6">
      <div role="search" className="relative">
        <label htmlFor={`${id}-search`} className="sr-only">
          Search the docs
        </label>
        <input
          ref={inputRef}
          id={`${id}-search`}
          data-docs-search
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setQuery('');
          }}
          placeholder="Search docs"
          autoComplete="off"
          className="border-line focus-visible:outline-cyan-soft h-9 w-full rounded-lg border bg-[#101317] pr-12 pl-3 text-[13.5px] text-[#e8eaed] placeholder:text-[#8b94a0] focus-visible:border-transparent focus-visible:outline-2 [&::-webkit-search-cancel-button]:hidden"
        />
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border border-[#353c47] px-1.5 font-mono text-[10.5px] text-[#8b94a0] lg:block pointer-coarse:hidden"
        >
          ⌘K
        </kbd>
      </div>

      {query.trim() ? (
        <div>
          <p className="sr-only" aria-live="polite">
            {results.length === 1 ? '1 result' : `${results.length} results`}
          </p>
          {results.length ? (
            <ul className="flex flex-col gap-0.5" aria-label="Search results">
              {results.map((result) => (
                <li key={result.href}>
                  <Link href={result.href} onClick={onNavigate} className={`${link(false)} flex-col items-start`}>
                    {result.page && <span className="font-mono text-[10.5px] text-[#8b94a0]">{result.page}</span>}
                    <span>{result.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2.5 text-[13px] text-[#8b94a0]">Nothing matches “{query.trim()}”.</p>
          )}
        </div>
      ) : (
        nav.map((group, g) => (
          <div key={group.title}>
            <p
              id={`${id}-group-${g}`}
              className="mb-1.5 px-2.5 font-mono text-[10.5px] font-medium tracking-[0.08em] text-[#8b94a0] uppercase"
            >
              {group.title}
            </p>
            <ul className="flex flex-col gap-0.5" aria-labelledby={`${id}-group-${g}`}>
              {group.items.map((item) => {
                const active = item.href === pathname;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={link(active)}
                    >
                      {item.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}

export function DocsSidebar({ nav, index }: { nav: NavGroup[]; index: SearchIndex }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = nav.flatMap((group) => group.items).find((item) => item.href === pathname);

  // ⌘K / Ctrl+K: the search box, in the sidebar or, on phones, in the menu.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      const input = [...document.querySelectorAll<HTMLInputElement>('[data-docs-search]')].find(
        (el) => el.offsetParent !== null,
      );
      if (input) input.focus();
      else setOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      {/* Phones and tablets: the current page and a menu button, under the site header. */}
      <div className="border-line/80 bg-ink/85 sticky top-14 z-30 -mx-4 flex h-12 items-center gap-3 border-b px-4 backdrop-blur-md sm:-mx-6 sm:px-6 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-controls="docs-menu"
          className="focus-visible:outline-cyan-soft -ml-1.5 inline-flex h-9 min-w-0 cursor-pointer items-center gap-2.5 rounded-md px-1.5 text-[13.5px] text-[#a1a9b4] hover:text-[#e8eaed] focus-visible:outline-2"
        >
          <MenuIcon className="size-4 shrink-0" />
          <span className="text-[#8b94a0]">Docs</span>
          {current && (
            <>
              <span aria-hidden="true" className="text-[#353c47]">
                /
              </span>
              <span className="truncate font-medium text-[#e8eaed]">{current.title}</span>
            </>
          )}
        </button>
      </div>
      <Sheet id="docs-menu" open={open} onClose={() => setOpen(false)} title="Docs">
        {open && <NavLinks nav={nav} index={index} onNavigate={() => setOpen(false)} />}
      </Sheet>

      {/* Wide screens: a sticky sidebar. */}
      <nav
        aria-label="Docs"
        className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] [scrollbar-width:thin] overflow-y-auto overscroll-contain py-8 pr-2 lg:block"
      >
        <NavLinks nav={nav} index={index} />
      </nav>
    </>
  );
}
