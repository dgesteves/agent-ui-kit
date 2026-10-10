'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { GITHUB_URL, NPM_URL } from '@/lib/site';
import { ArrowUpRightIcon, CloseIcon, GitHubIcon, MenuIcon } from './icons';
import { ThemeSwitch } from './theme-switch';

export function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-7" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#181c22" stroke="#262b33" />
      <path d="M11 9v14" stroke="#353c47" strokeWidth="2" strokeLinecap="round" />
      <circle cx="11" cy="9" r="2.6" fill="#22d3ee" />
      <circle cx="11" cy="16" r="2.6" fill="#67e8f9" />
      <circle cx="11" cy="23" r="2.6" fill="#f0468a" />
      <path d="M17 9h7M17 16h5M17 23h7" stroke="#e8eaed" strokeWidth="2" strokeLinecap="round" opacity=".5" />
    </svg>
  );
}

type Page = 'docs' | 'components';

// The logo goes home, to the playground.
const PAGES: Array<{ page: Page; href: string; label: string }> = [
  { page: 'docs', href: '/docs', label: 'Docs' },
  { page: 'components', href: '/gallery', label: 'Components' },
];

const MENU_ID = 'site-menu';

export function Header({
  page,
}: {
  /** The section the page belongs to; none on the home page. */
  page?: Page;
}) {
  const link = (active: boolean) =>
    `rounded-md px-2 py-1 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-cyan-soft ${active ? 'text-fg' : 'text-fg-muted hover:text-fg'}`;
  const pathname = usePathname();
  // The section's link is current on any page in it, and "page" on its own page.
  const current = (p: (typeof PAGES)[number]) =>
    page === p.page ? (pathname === p.href ? ('page' as const) : true) : undefined;
  const closeMenu = () => document.getElementById(MENU_ID)?.hidePopover();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const menu = document.getElementById(MENU_ID);
    const onToggle = (event: Event) => setMenuOpen((event as ToggleEvent).newState === 'open');
    menu?.addEventListener('toggle', onToggle);
    return () => menu?.removeEventListener('toggle', onToggle);
  }, []);
  return (
    <header className="border-line/80 bg-ink/80 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-[1320px] items-center gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="focus-visible:outline-cyan-soft flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          <Logo />
          <span className="text-fg font-mono text-[13px] font-semibold tracking-tight max-[359px]:sr-only">
            signoff-ui
          </span>
        </Link>
        <span className="text-line-strong hidden sm:inline" aria-hidden="true">
          /
        </span>
        <nav aria-label="Pages" className="hidden items-center gap-1 sm:flex">
          {PAGES.map((p) => (
            <Link key={p.page} href={p.href} className={link(page === p.page)} aria-current={current(p)}>
              {p.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeSwitch />
          <a
            href={GITHUB_URL}
            className="border-line focus-visible:outline-cyan-soft text-fg-muted hover:border-line-strong hover:text-fg inline-flex size-9 items-center justify-center rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 sm:size-8"
            aria-label="signoff-ui on GitHub"
          >
            <GitHubIcon className="size-4" />
          </a>
          {/* Phones: the pages move into a menu (a native popover: Escape and outside clicks close it). */}
          <button
            type="button"
            popoverTarget={MENU_ID}
            className="border-line focus-visible:outline-cyan-soft text-fg-muted hover:text-fg inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 sm:hidden"
            aria-label="Menu"
            aria-expanded={menuOpen}
            aria-controls={MENU_ID}
          >
            {menuOpen ? <CloseIcon className="size-4" /> : <MenuIcon className="size-4" />}
          </button>
        </div>
      </div>
      <nav
        id={MENU_ID}
        popover="auto"
        aria-label="Pages"
        className="border-line bg-ink text-fg inset-x-0 top-14 bottom-auto m-0 h-auto w-full max-w-none border-0 border-b p-0 shadow-[0_24px_48px_var(--site-shadow)] backdrop:bg-black/40 sm:hidden"
      >
        <ul className="flex flex-col px-2 py-2">
          {PAGES.map((p) => (
            <li key={p.page}>
              <Link
                href={p.href}
                onClick={closeMenu}
                aria-current={current(p)}
                className="focus-visible:outline-cyan-soft text-fg-muted hover:bg-raised hover:text-fg aria-[current]:text-fg flex h-12 items-center rounded-lg px-3 text-[15px] focus-visible:outline-2 focus-visible:-outline-offset-2"
              >
                {p.label}
                {page === p.page && <span className="bg-cyan ml-2 size-1.5 rounded-full" aria-hidden="true" />}
              </Link>
            </li>
          ))}
        </ul>
        <ul className="border-line mx-2 flex flex-col border-t py-2">
          {[
            ['GitHub', GITHUB_URL],
            ['npm', NPM_URL],
          ].map(([label, href]) => (
            <li key={label}>
              <a
                href={href}
                onClick={closeMenu}
                className="focus-visible:outline-cyan-soft text-fg-muted hover:bg-raised hover:text-fg flex h-12 items-center justify-between rounded-lg px-3 text-[15px] focus-visible:outline-2 focus-visible:-outline-offset-2"
              >
                {label}
                <ArrowUpRightIcon className="text-fg-subtle size-4" />
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
