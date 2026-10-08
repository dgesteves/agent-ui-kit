import Link from 'next/link';
import { AUTHOR, GITHUB_URL, MORE_BY_AUTHOR, NPM_URL } from '@/lib/site';
import { Logo } from './header';

const link =
  'focus-visible:outline-cyan-soft rounded-sm text-[13px] text-[#a1a9b4] transition-colors hover:text-[#e8eaed] focus-visible:outline-2 focus-visible:outline-offset-2';

export function Footer() {
  return (
    <footer className="border-line/80 border-t bg-[#0b0d10]">
      <div className="mx-auto grid w-full max-w-[1320px] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.2fr_0.8fr_1.4fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="font-mono text-[13px] font-semibold tracking-tight text-[#e8eaed]">agent-ui-kit</span>
          </div>
          <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-[#8b94a0]">
            Accessible React components for agent runs. MIT licensed, by{' '}
            <a
              href={AUTHOR.url}
              className={`${link} underline decoration-[#8b94a0]/50 underline-offset-[3px] hover:decoration-[#e8eaed]`}
            >
              {AUTHOR.name}
            </a>
            .
          </p>
        </div>
        <nav aria-label="Project">
          <h2 className="font-mono text-[11px] font-medium tracking-[0.08em] text-[#8b94a0] uppercase">Project</h2>
          <ul className="mt-3 flex flex-col gap-2">
            <li>
              <Link href="/gallery" className={link}>
                Components
              </Link>
            </li>
            <li>
              <a href={GITHUB_URL} className={link}>
                GitHub
              </a>
            </li>
            <li>
              <a href={NPM_URL} className={link}>
                npm
              </a>
            </li>
            <li>
              <a href={`${GITHUB_URL}/blob/main/packages/agent-ui-kit/CHANGELOG.md`} className={link}>
                Changelog
              </a>
            </li>
            <li>
              <a href="/llms.txt" className={link}>
                llms.txt
              </a>
            </li>
          </ul>
        </nav>
        <nav aria-label={`More by ${AUTHOR.name}`}>
          <h2 className="font-mono text-[11px] font-medium tracking-[0.08em] text-[#8b94a0] uppercase">
            More by {AUTHOR.name}
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {MORE_BY_AUTHOR.map((project) => (
              <li key={project.name}>
                <a href={project.url} className={`${link} font-mono text-[#e8eaed]`}>
                  {project.name}
                </a>
                <p className="mt-0.5 text-[13px] leading-relaxed text-[#8b94a0]">{project.description}</p>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
