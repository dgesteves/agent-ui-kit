'use client';

const GITHUB = 'https://github.com/dgesteves/agent-ui-kit';

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

export function Header({
  page = 'playground',
  mode,
  liveAvailable = false,
  onModeChange,
}: {
  page?: 'playground' | 'components';
  mode?: 'mock' | 'live';
  liveAvailable?: boolean;
  onModeChange?: (mode: 'mock' | 'live') => void;
}) {
  const link = (current: boolean) =>
    `rounded-md px-2 py-1 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-cyan-soft ${current ? 'text-[#e8eaed]' : 'text-[#a1a9b4] hover:text-[#e8eaed]'}`;
  return (
    <header className="border-line/80 bg-ink/80 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-[1320px] items-center gap-3 px-4 sm:px-6">
        <a
          href="/"
          className="focus-visible:outline-cyan-soft flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          <Logo />
          <span className="font-mono text-[13px] font-semibold tracking-tight text-[#e8eaed]">agent-ui-kit</span>
        </a>
        <span className="hidden text-[#353c47] sm:inline" aria-hidden="true">
          /
        </span>
        <nav aria-label="Pages" className="hidden items-center gap-1 sm:flex">
          <a href="/" className={link(page === 'playground')} aria-current={page === 'playground' ? 'page' : undefined}>
            Playground
          </a>
          <a
            href="/gallery"
            className={link(page === 'components')}
            aria-current={page === 'components' ? 'page' : undefined}
          >
            Components
          </a>
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
            href={GITHUB}
            className="border-line focus-visible:outline-cyan-soft inline-flex size-8 items-center justify-center rounded-lg border text-[#a1a9b4] transition-colors hover:text-[#e8eaed] focus-visible:outline-2 focus-visible:outline-offset-2"
            aria-label="Source on GitHub"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
              <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.04 1.78 2.72 1.27 3.38.97.1-.75.4-1.27.74-1.56-2.56-.29-5.25-1.28-5.25-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.27 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
            </svg>
          </a>
        </div>
      </div>
    </header>
  );
}
