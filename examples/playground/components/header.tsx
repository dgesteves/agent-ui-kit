'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { GITHUB_URL, NPM_URL } from '@/lib/site';
import { ArrowUpRightIcon, CloseIcon, GitHubIcon, MenuIcon } from './icons';

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
  mode,
  liveAvailable = false,
  onModeChange,
}: {
  /** The section the page belongs to; none on the home page. */
  page?: Page;
  mode?: 'mock' | 'live';
  liveAvailable?: boolean;
  onModeChange?: (mode: 'mock' | 'live') => void;
}) {
  const link = (active: boolean) =>
    `rounded-md px-2 py-1 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-cyan-soft ${active ? 'text-[#e8eaed]' : 'text-[#a1a9b4] hover:text-[#e8eaed]'}`;
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
          <span className="font-mono text-[13px] font-semibold tracking-tight text-[#e8eaed]">agent-ui-kit</span>
        </Link>
        <span className="hidden text-[#353c47] sm:inline" aria-hidden="true">
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
          {/* Live mode exists only when the server has a model key (OPENAI_API_KEY); otherwise there is no choice to offer. */}
          {mode && onModeChange && liveAvailable && (
            <div role="radiogroup" aria-label="Agent" className="border-line bg-raised/60 flex rounded-lg border p-0.5">
              {(['mock', 'live'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => onModeChange(m)}
                  className="focus-visible:outline-cyan-soft cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium text-[#a1a9b4] transition-colors hover:text-[#e8eaed] focus-visible:outline-2 focus-visible:outline-offset-1 aria-checked:bg-[#262b33] aria-checked:text-[#e8eaed]"
                >
                  {m === 'mock' ? 'Scripted' : 'Live'}
                </button>
              ))}
            </div>
          )}
          <a
            href={GITHUB_URL}
            className="border-line focus-visible:outline-cyan-soft inline-flex size-9 items-center justify-center rounded-lg border text-[#a1a9b4] transition-colors hover:border-[#353c47] hover:text-[#e8eaed] focus-visible:outline-2 focus-visible:outline-offset-2 sm:size-8"
            aria-label="agent-ui-kit on GitHub"
          >
            <GitHubIcon className="size-4" />
          </a>
          {/* Phones: the pages move into a menu (a native popover: Escape and outside clicks close it). */}
          <button
            type="button"
            popoverTarget={MENU_ID}
            className="border-line focus-visible:outline-cyan-soft inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border text-[#a1a9b4] transition-colors hover:text-[#e8eaed] focus-visible:outline-2 focus-visible:outline-offset-2 sm:hidden"
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
        className="border-line bg-ink inset-x-0 top-14 bottom-auto m-0 h-auto w-full max-w-none border-0 border-b p-0 text-[#e8eaed] shadow-[0_24px_48px_rgb(0_0_0/0.5)] backdrop:bg-black/40 sm:hidden"
      >
        <ul className="flex flex-col px-2 py-2">
          {PAGES.map((p) => (
            <li key={p.page}>
              <Link
                href={p.href}
                onClick={closeMenu}
                aria-current={current(p)}
                className="focus-visible:outline-cyan-soft flex h-12 items-center rounded-lg px-3 text-[15px] text-[#a1a9b4] hover:bg-[#181c22] hover:text-[#e8eaed] focus-visible:outline-2 focus-visible:-outline-offset-2 aria-[current]:text-[#e8eaed]"
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
                className="focus-visible:outline-cyan-soft flex h-12 items-center justify-between rounded-lg px-3 text-[15px] text-[#a1a9b4] hover:bg-[#181c22] hover:text-[#e8eaed] focus-visible:outline-2 focus-visible:-outline-offset-2"
              >
                {label}
                <ArrowUpRightIcon className="size-4 text-[#8b94a0]" />
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
