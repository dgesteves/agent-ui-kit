import kit from '@dgesteves/agent-ui-kit/package.json';
import Link from 'next/link';
import { GET_STARTED_URL, GITHUB_URL, INSTALL_COMMAND } from '@/lib/site';
import { CommandLine } from './copy-button';
import { ArrowRightIcon, GitHubIcon } from './icons';

export const primaryButton =
  'bg-cyan text-ink hover:bg-cyan-soft focus-visible:outline-[#e8eaed] inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-[14px] font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2';
export const secondaryButton =
  'border-line bg-raised/70 focus-visible:outline-cyan-soft inline-flex h-11 items-center justify-center gap-2 rounded-lg border px-4 text-[14px] font-medium whitespace-nowrap text-[#e8eaed] transition-colors hover:border-[#353c47] hover:bg-[#1e232a] focus-visible:outline-2 focus-visible:outline-offset-2';

/** Install, read the quickstart, star the repository: the three things a visitor can do next. */
export function CallsToAction() {
  return (
    // The buttons wrap under the install command when the row is too narrow for both.
    <div className="flex flex-wrap items-center gap-3">
      <CommandLine
        command={INSTALL_COMMAND}
        label="Copy the install command"
        className="w-full shrink-0 sm:w-[21.5rem]"
      />
      <div className="flex flex-auto flex-wrap gap-3 sm:flex-none">
        <Link href={GET_STARTED_URL} className={`${primaryButton} flex-auto sm:flex-none`}>
          Get started
          <ArrowRightIcon className="size-4" />
        </Link>
        <a href={GITHUB_URL} className={`${secondaryButton} flex-auto sm:flex-none`}>
          <GitHubIcon className="size-4" />
          Star on GitHub
        </a>
      </div>
    </div>
  );
}

/** What the kit is and who it's for, in one line, then how to get it. */
export function Hero() {
  return (
    <div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12px] text-[#8b94a0]">
        <span className="text-cyan-soft">v{kit.version}</span>
        <span aria-hidden="true">·</span>
        <span>MIT</span>
        <span aria-hidden="true">·</span>
        <span>React 18 &amp; 19</span>
      </p>
      <h1 className="mt-3 text-[28px] leading-[1.12] font-semibold tracking-[-0.025em] text-balance text-[#f1f3f5] sm:mt-4 sm:text-[38px] xl:text-[42px]">
        Accessible React components for agent runs
      </h1>
      <p className="mt-4 max-w-[42rem] text-[15px] leading-relaxed text-pretty text-[#a1a9b4] sm:text-[17px]">
        Tool call timelines, human-in-the-loop approvals, per-hunk diff review and run telemetry, for{' '}
        <span className="text-[#e8eaed]">AI SDK 6 &amp; 7</span> and <span className="text-[#e8eaed]">AG-UI</span>{' '}
        agents (LangGraph, CrewAI, Mastra).
      </p>
      <div className="mt-6 sm:mt-7">
        <CallsToAction />
      </div>
    </div>
  );
}
