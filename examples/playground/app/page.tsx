import { Footer } from '@/components/footer';
import { Header } from '@/components/header';
import { Hero } from '@/components/hero';
import { Landing } from '@/components/landing';
import { PlaygroundIsland } from '@/components/playground-island';

export default function Page() {
  return (
    <div className="min-h-dvh">
      <Header />
      <div className="grid-backdrop pointer-events-none fixed inset-x-0 top-0 -z-10 h-[70vh]" aria-hidden="true" />
      <main id="main">
        {/*
         * Phones: the headline, a sticky bar with the status and playback, then the conversation; the
         * rest of the controls open in a sheet. Wide screens: the headline and the run on the left, the
         * status, controls and telemetry in a sticky sidebar. Flex on phones so the bar can stick for
         * the whole run (a grid item only sticks within its own row). The sidebar spans both rows; the
         * second row takes its extra height, so the run doesn't move once it outgrows the sidebar.
         */}
        <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-6 px-4 pt-7 sm:px-6 sm:pt-12 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr] lg:gap-x-10 lg:gap-y-8 lg:pt-12">
          <div className="lg:col-start-1 lg:row-start-1">
            <Hero />
          </div>
          {/* Live mode is offered only when the server has a key; the scripted run is always the default. */}
          <PlaygroundIsland liveAvailable={Boolean(process.env.OPENAI_API_KEY)} />
        </div>
        <Landing />
      </main>
      <Footer />
    </div>
  );
}
