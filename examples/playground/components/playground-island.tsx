'use client';

import dynamic from 'next/dynamic';

/*
 * The live run loads after the page: the AI SDK, the kit and the scripted agent are most of the
 * home page's JavaScript, and nothing above the fold needs them to paint. Until then, a placeholder
 * of the same shape holds its place in the grid, so nothing moves when the run arrives.
 */

const RunPlaceholder = () => (
  <>
    <div
      aria-hidden="true"
      className="border-line/80 bg-ink/85 sticky top-14 z-30 -mx-4 flex h-[53px] items-center border-y px-4 sm:-mx-6 sm:px-6 lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mx-0 lg:h-auto lg:flex-col lg:items-stretch lg:gap-4 lg:self-start lg:border-0 lg:bg-transparent lg:p-0"
    >
      <span className="bg-raised h-7 w-44 rounded-full lg:hidden" />
      <span className="border-line bg-raised/70 hidden h-[326px] rounded-xl border lg:block" />
      <span className="border-line bg-raised/70 hidden h-[270px] rounded-xl border lg:block" />
    </div>
    <div className="flex min-h-svh min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-2">
      <p className="text-[13px] leading-relaxed text-[#8b94a0]">
        <span className="font-medium text-[#e8eaed]">Live demo, no API key.</span> A scripted coding agent adds rate
        limiting to a Next.js route. Every panel is a kit component.
      </p>
    </div>
  </>
);

const Playground = dynamic(() => import('./playground').then((m) => m.Playground), {
  ssr: false,
  loading: RunPlaceholder,
});

export function PlaygroundIsland({ liveAvailable }: { liveAvailable: boolean }) {
  return <Playground liveAvailable={liveAvailable} />;
}
