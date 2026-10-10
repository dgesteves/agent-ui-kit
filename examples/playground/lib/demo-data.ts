import type { ToolPart } from 'signoff-ui';
import type { UIMessage } from 'ai';
import { ROUTE_OLD, WEB_RESULTS } from './scenario';

/*
 * Message parts for the component demos (the components page and each component's docs page):
 * a timeline mid-run, a finished message with reasoning and citations, and its sources.
 */

const now = Date.now();

export const timelineParts = [
  {
    type: 'tool-search_code',
    toolCallId: 'g1',
    state: 'output-available',
    input: { query: 'api/chat route handler' },
    output: { matches: [{ path: 'app/api/chat/route.ts', line: 14 }] },
  },
  {
    type: 'tool-read_file',
    toolCallId: 'g2',
    state: 'output-error',
    input: { path: 'middleware.ts' },
    errorText: "ENOENT: no such file or directory, open 'middleware.ts'",
  },
  {
    type: 'tool-read_file',
    toolCallId: 'g3',
    state: 'output-available',
    input: { path: 'lib/redis.ts' },
    output: {
      path: 'lib/redis.ts',
      content: "import { Redis } from '@upstash/redis';\n\nexport const redis = Redis.fromEnv();\n",
    },
  },
  {
    type: 'tool-web_search',
    toolCallId: 'g4',
    state: 'input-available',
    input: { query: 'upstash ratelimit sliding window' },
  },
  {
    type: 'tool-run_command',
    toolCallId: 'g5',
    state: 'approval-requested',
    input: { command: 'pnpm add @upstash/ratelimit' },
    approval: { id: 'a5' },
  },
] as unknown as ToolPart[];

export const timelineTimings = {
  g1: { startedAt: now - 4_200, runningAt: now - 4_000, endedAt: now - 3_280 },
  g2: { startedAt: now - 3_100, runningAt: now - 3_000, endedAt: now - 2_760 },
  g3: { startedAt: now - 3_050, runningAt: now - 2_950, endedAt: now - 2_500 },
  g4: { startedAt: now - 2_300, runningAt: now - 2_100 },
  g5: { startedAt: now - 600 },
};

export const sources = WEB_RESULTS.map((r, i) => ({
  type: 'source-url' as const,
  sourceId: `s${i}`,
  url: r.url,
  title: r.title,
}));

export const message: UIMessage = {
  id: 'gallery-msg',
  role: 'assistant',
  parts: [
    {
      type: 'reasoning',
      text: 'The limit has to be checked before `streamText` starts, otherwise a 429 cannot be returned once the stream is open.',
      state: 'done',
    },
    { type: 'text', text: 'I’ll check the route handler and confirm the limiter API first.', state: 'done' },
    {
      type: 'tool-read_file',
      toolCallId: 'm1',
      state: 'output-available',
      input: { path: 'app/api/chat/route.ts' },
      output: { path: 'app/api/chat/route.ts', content: ROUTE_OLD },
    },
    {
      type: 'tool-web_search',
      toolCallId: 'm2',
      state: 'output-available',
      input: { query: 'upstash ratelimit sliding window' },
      output: { results: WEB_RESULTS.slice(0, 2) },
    },
    {
      type: 'text',
      text: 'A **sliding window** smooths bursts better than a fixed window [1], and the check belongs at the top of the handler [3].',
      state: 'done',
    },
    ...sources,
  ],
};
