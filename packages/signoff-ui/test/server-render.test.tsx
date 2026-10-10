// @vitest-environment node
import { fileURLToPath } from 'node:url';
import type { ChatStatus } from 'ai';
import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentMessage } from '../src/agent-message';
import { AgentStatus } from '../src/agent-status';
import { ApprovalCard } from '../src/approval-card';
import { DiffReview } from '../src/diff-review';
import { useRunTiming } from '../src/lib/hooks';
import { Markdown } from '../src/markdown';
import { Reasoning } from '../src/reasoning';
import { RunMeter } from '../src/run-meter';
import { Sources } from '../src/sources';
import { ToolCallTimeline } from '../src/tool-call-timeline';
import { ROUTE_NEW, ROUTE_OLD } from './fixtures';
import { assistant, toolPart } from './utils';

/*
 * Next.js prerenders Client Components on the server, and with `cacheComponents` (on in new
 * Next.js 16 apps) the build fails when one reads the clock or a random number while rendering:
 * "Route / used `Date.now()` inside a Client Component without a Suspense boundary above it".
 * Clocks must start in the browser.
 */

const source = { type: 'source-url' as const, sourceId: 's1', url: 'https://upstash.com/docs', title: 'Upstash' };
const parts = [
  { type: 'reasoning' as const, text: 'Read the route first.', state: 'done' as const },
  toolPart('output-available', { toolCallId: 'a' }),
  toolPart('input-available', { toolCallId: 'b' }),
  toolPart('output-error', { toolCallId: 'c' }),
  toolPart('approval-requested', { toolCallId: 'd', toolName: 'run_command' }),
  { type: 'text' as const, text: 'Rate limiting goes in the route [1].', state: 'done' as const },
  source,
];

function Timed({ status }: { status: ChatStatus }) {
  const timing = useRunTiming(status);
  return <AgentStatus state="working" elapsedMs={timing.activeMs} />;
}

const cases: Array<[string, ReactElement]> = [
  ['AgentStatus, done', <AgentStatus key="1" state="done" />],
  ['AgentStatus with a live timer', <AgentStatus key="2" state="working" startedAt={1_000} />],
  ['ToolCallTimeline', <ToolCallTimeline key="3" parts={parts} />],
  ['ToolCallTimeline, inactive', <ToolCallTimeline key="4" parts={parts} active={false} />],
  ['AgentMessage', <AgentMessage key="5" message={assistant(parts)} streaming onToolApproval={() => {}} />],
  ['ApprovalCard', <ApprovalCard key="6" toolName="run_command" input={{ command: 'pnpm i' }} risk="high" />],
  ['DiffReview', <DiffReview key="7" files={[{ path: 'route.ts', oldContent: ROUTE_OLD, newContent: ROUTE_NEW }]} />],
  ['RunMeter', <RunMeter key="8" usage={{ inputTokens: 1_000, outputTokens: 200 }} variant="expanded" live />],
  ['Sources', <Sources key="9" sources={[source]} />],
  [
    'Markdown, streaming',
    <Markdown key="10" streaming>
      {'**Done** [1]'}
    </Markdown>,
  ],
  ['Reasoning, streaming', <Reasoning key="11" text="Thinking" streaming />],
  ['useRunTiming', <Timed key="12" status="streaming" />],
];

const src = fileURLToPath(new URL('../src/', import.meta.url));

describe('server rendering', () => {
  const calls: string[] = [];

  beforeEach(() => {
    calls.length = 0;
    // React's development build times its own work with performance.now(); count the calls made
    // from the kit's modules, directly or through a dependency (jsdiff reads the clock, too).
    const trap = <T extends object>(target: T, method: keyof T & string, name: string) => {
      const original = target[method] as (...args: unknown[]) => unknown;
      vi.spyOn(target, method as never).mockImplementation(((...args: unknown[]) => {
        const frame = new Error().stack?.split('\n').find((line) => line.includes(src));
        if (frame) calls.push(`${name} ${frame.trim()}`);
        return original.apply(target, args);
      }) as never);
    };
    trap(Date, 'now', 'Date.now()');
    trap(Math, 'random', 'Math.random()');
    trap(performance, 'now', 'performance.now()');
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(cases)('%s reads no clock and no random number', (_, element) => {
    expect(renderToString(element)).toContain('data-signoff');
    expect(calls).toEqual([]);
  });
});
