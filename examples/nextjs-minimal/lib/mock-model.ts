import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

/*
 * A scripted model, so the example runs end to end without an API key. It reads two files (one
 * read fails), proposes an edit across two files for review, asks to run a command, which needs
 * approval, and answers with sources once the command has run. app/api/chat/route.ts executes the
 * real tools; only the model is scripted.
 */

type DoStream = MockLanguageModelV4['doStream'];
type Prompt = Parameters<DoStream>[0]['prompt'];
type Stream = Awaited<ReturnType<DoStream>>['stream'];
type Chunk = Stream extends ReadableStream<infer T> ? T : never;

const usage = (input: number, cached: number, output: number) => ({
  inputTokens: { total: input, noCache: input - cached, cacheRead: cached, cacheWrite: undefined },
  outputTokens: { total: output, text: output, reasoning: undefined },
});

function text(id: string, value: string): Chunk[] {
  const words = value.split(/(?<= )/);
  return [
    { type: 'text-start', id },
    ...words.map((delta): Chunk => ({ type: 'text-delta', id, delta })),
    { type: 'text-end', id },
  ];
}

const toolCall = (toolCallId: string, toolName: string, input: object): Chunk => ({
  type: 'tool-call',
  toolCallId,
  toolName,
  input: JSON.stringify(input),
});

const ROUTE = 'export async function POST(req: Request) {\n  // ...\n}\n';
const LIMITED = [
  "import { ratelimit } from '@/lib/ratelimit';",
  '',
  'export async function POST(req: Request) {',
  "  const { success } = await ratelimit.limit(req.headers.get('x-forwarded-for') ?? 'anonymous');",
  "  if (!success) return new Response('Too many requests', { status: 429 });",
  '  // ...',
  '}',
  '',
].join('\n');
const LIMITER = [
  "import { Ratelimit } from '@upstash/ratelimit';",
  "import { Redis } from '@upstash/redis';",
  '',
  '/** 10 requests per 10 seconds per caller, sliding window. */',
  'export const ratelimit = new Ratelimit({',
  '  redis: Redis.fromEnv(),',
  "  limiter: Ratelimit.slidingWindow(10, '10 s'),",
  '});',
  '',
].join('\n');

/** Results the model has seen so far, by tool name. */
function toolResults(prompt: Prompt) {
  return prompt.flatMap((message) =>
    message.role === 'tool' ? message.content.filter((part) => part.type === 'tool-result') : [],
  );
}

function script(prompt: Prompt): Chunk[] {
  const results = toolResults(prompt);
  const review = results.find((part) => part.toolName === 'review_changes');
  const command = results.find((part) => part.toolName === 'run_command');

  if (!results.some((part) => part.toolName === 'read_file')) {
    return [
      { type: 'reasoning-start', id: 'r1' },
      { type: 'reasoning-delta', id: 'r1', delta: 'Rate limiting belongs in the route. Read it, and any middleware.' },
      { type: 'reasoning-end', id: 'r1' },
      ...text('t1', 'I will read the **chat route** and the middleware first.'),
      toolCall('call_read_route', 'read_file', { path: 'app/api/chat/route.ts' }),
      toolCall('call_read_middleware', 'read_file', { path: 'middleware.ts' }),
      { type: 'finish', usage: usage(4_200, 0, 180), finishReason: { unified: 'tool-calls', raw: undefined } },
    ];
  }

  if (!review) {
    return [
      ...text('t2', 'There is no middleware, so the limit goes in the route. Here is the change, for you to review.'),
      toolCall('call_review', 'review_changes', {
        files: [
          { path: 'app/api/chat/route.ts', oldContent: ROUTE, newContent: LIMITED },
          { path: 'lib/ratelimit.ts', newContent: LIMITER },
        ],
      }),
      { type: 'finish', usage: usage(5_100, 4_000, 420), finishReason: { unified: 'tool-calls', raw: undefined } },
    ];
  }

  const applied = review.output.type === 'json' ? (review.output.value as { accepted?: number }).accepted : 0;
  if (!applied) {
    return [
      ...text('t3', 'Nothing was applied, so the route stays as it is.'),
      { type: 'finish', usage: usage(5_600, 4_800, 40), finishReason: { unified: 'stop', raw: undefined } },
    ];
  }

  if (!command) {
    return [
      ...text(
        't3',
        `The ${applied === 1 ? 'hunk you accepted is' : `${applied} hunks you accepted are`} applied. The limiter needs two packages.`,
      ),
      toolCall('call_install', 'run_command', { command: 'pnpm add @upstash/ratelimit @upstash/redis' }),
      { type: 'finish', usage: usage(5_900, 5_000, 90), finishReason: { unified: 'tool-calls', raw: undefined } },
    ];
  }

  if (command.output.type === 'execution-denied') {
    return [
      ...text('t4', 'Understood, I will not install anything. The edit is applied, without the package.'),
      { type: 'finish', usage: usage(5_300, 4_800, 40), finishReason: { unified: 'stop', raw: undefined } },
    ];
  }

  return [
    {
      type: 'source',
      sourceType: 'url',
      id: 's1',
      url: 'https://upstash.com/docs/redis/sdks/ratelimit-ts/overview',
      title: 'Upstash Ratelimit',
    },
    {
      type: 'source',
      sourceType: 'url',
      id: 's2',
      url: 'https://nextjs.org/docs/app/api-reference/file-conventions/route',
      title: 'Next.js route handlers',
    },
    ...text(
      't5',
      'Done. The route can now use a sliding window limiter [1], checked in the route handler itself [2].\n\n' +
        '- `@upstash/ratelimit` and `@upstash/redis` installed\n- `app/api/chat/route.ts` returns **429** when limited',
    ),
    { type: 'finish', usage: usage(6_400, 5_000, 260), finishReason: { unified: 'stop', raw: undefined } },
  ];
}

export const mockModel = new MockLanguageModelV4({
  doStream: async ({ prompt }) => ({
    stream: simulateReadableStream({
      chunks: [{ type: 'stream-start', warnings: [] }, ...script(prompt)],
      initialDelayInMs: 300,
      chunkDelayInMs: 40,
    }),
  }),
});
