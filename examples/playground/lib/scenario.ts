/**
 * The scripted run the mock agent replays: add rate limiting to a Next.js chat route.
 * File contents are shared with the live-mode tools so both modes see the same repo.
 */

export const REPO = 'acme/chat-app';
export const MODEL = 'mock-agent-1';

export const PROMPT =
  'Add rate limiting to our /api/chat route. Keep streaming intact and don’t break existing clients.';

/** Example pricing used for the cost estimate (USD per 1M tokens). */
export const PRICING = { input: 2.5, cachedInput: 0.25, output: 10 };

export const ROUTE_OLD = `import { convertToModelMessages, streamText, type UIMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { tools } from '@/lib/tools';

export const maxDuration = 30;

const SYSTEM = [
  'You are a coding agent working inside a Next.js repository.',
  'Prefer small, reviewable edits.',
  'Ask before running commands that touch the network.',
].join(' ');

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  if (messages.length === 0) return new Response('Empty conversation', { status: 400 });
  const modelMessages = convertToModelMessages(messages);
  const lastUserMessage = messages.findLast((m) => m.role === 'user');
  console.info('chat', { turns: messages.length, last: lastUserMessage?.id });

  const result = streamText({
    model: openai('gpt-4o'),
    system: SYSTEM,
    messages: modelMessages,
    tools,
  });

  return result.toUIMessageStreamResponse();
}
`;

export const ROUTE_NEW = `import { convertToModelMessages, streamText, type UIMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { tools } from '@/lib/tools';
import { ratelimit } from '@/lib/ratelimit';

export const maxDuration = 30;

const SYSTEM = [
  'You are a coding agent working inside a Next.js repository.',
  'Prefer small, reviewable edits.',
  'Ask before running commands that touch the network.',
].join(' ');

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') ?? 'anonymous';
  const { success, reset } = await ratelimit.limit(ip);
  if (!success) {
    return new Response('Too many requests', {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)) },
    });
  }

  const { messages }: { messages: UIMessage[] } = await req.json();
  if (messages.length === 0) return new Response('Empty conversation', { status: 400 });
  const modelMessages = convertToModelMessages(messages);
  const lastUserMessage = messages.findLast((m) => m.role === 'user');
  console.info('chat', { turns: messages.length, last: lastUserMessage?.id });

  const result = streamText({
    model: openai('gpt-4.1-mini'),
    system: SYSTEM,
    messages: modelMessages,
    tools,
  });

  return result.toUIMessageStreamResponse();
}
`;

export const REDIS = `import { Redis } from '@upstash/redis';

export const redis = Redis.fromEnv();
`;

export const RATELIMIT_UPSTASH = `import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '@/lib/redis';

/** 10 requests per 10 seconds per key, sliding window. */
export const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '10 s'),
  prefix: 'ratelimit:chat',
  analytics: true,
});
`;

/** Used when the install is denied: same API, no new dependency. */
export const RATELIMIT_FIXED_WINDOW = `import { redis } from '@/lib/redis';

const LIMIT = 10;
const WINDOW_SECONDS = 10;

/** Fixed-window limiter on the existing Redis client. */
export const ratelimit = {
  async limit(key: string) {
    const bucket = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
    const id = \`ratelimit:chat:\${key}:\${bucket}\`;
    const count = await redis.incr(id);
    if (count === 1) await redis.expire(id, WINDOW_SECONDS);
    return { success: count <= LIMIT, reset: (bucket + 1) * WINDOW_SECONDS * 1000 };
  },
};
`;

export const FILES: Record<string, string> = {
  'app/api/chat/route.ts': ROUTE_OLD,
  'lib/redis.ts': REDIS,
  'lib/tools.ts': `export { tools } from './tools/index';\n`,
};

export const SEARCH_CODE_OUTPUT = {
  matches: [
    { path: 'app/api/chat/route.ts', line: 14, preview: 'export async function POST(req: Request) {' },
    { path: 'components/chat.tsx', line: 22, preview: "transport: new DefaultChatTransport({ api: '/api/chat' })," },
    { path: 'lib/redis.ts', line: 3, preview: 'export const redis = Redis.fromEnv();' },
  ],
};

export const WEB_RESULTS = [
  {
    url: 'https://upstash.com/docs/redis/sdks/ratelimit-ts/overview',
    title: 'Ratelimit overview · Upstash',
    snippet: 'Connectionless rate limiting for serverless and edge runtimes, backed by Upstash Redis.',
  },
  {
    url: 'https://upstash.com/docs/redis/sdks/ratelimit-ts/algorithms',
    title: 'Ratelimiting algorithms · Upstash',
    snippet: 'Fixed window, sliding window and token bucket, with their trade-offs.',
  },
  {
    url: 'https://nextjs.org/docs/app/building-your-application/routing/route-handlers',
    title: 'Route Handlers · Next.js',
    snippet: 'Return a Response from a route handler, including custom status codes and headers.',
  },
];

export const REASONING = `The user wants rate limiting on the chat endpoint without breaking streaming. The check has to run **before** \`streamText\` starts, otherwise a 429 can't be returned cleanly once the stream is open.

I should read the current route handler, look for existing middleware, and see whether the repo already has a Redis client. Then confirm the limiter API before proposing an edit.`;

export const PLAN = `I'll find the chat route, check for middleware and an existing Redis client, then confirm the limiter API before proposing an edit.`;

export const FINDINGS = `The route streams with \`streamText\` and there is no \`middleware.ts\`, so the check belongs at the top of the handler, before the stream opens. \`lib/redis.ts\` already exports an Upstash client, so the only new dependency is the limiter itself.`;

export const INSTALL_REASON = 'Installs a package from the npm registry and updates package.json and pnpm-lock.yaml.';

export const AFTER_INSTALL = `Installed. The change adds a sliding-window limiter (10 requests per 10 s per IP) that runs before the model call and returns \`429\` with \`Retry-After\`. I also moved the route to a cheaper model; reject that hunk if you'd rather keep it.`;

export const AFTER_DENY = `Understood, no new dependency. I'll use a small fixed-window limiter on the existing Redis client instead. Same call site, same \`429\` behaviour.`;

export function finalAnswer({
  keptModel,
  installed,
  applied,
}: {
  keptModel: boolean;
  installed: boolean;
  applied: number;
}) {
  if (applied === 0) {
    return `No changes were applied. The proposed limiter is still the right shape if you want to revisit it: check the limit before \`streamText\` runs so rejected requests never open a stream [3].`;
  }
  return `## Rate limiting is in place

- **Where:** \`app/api/chat/route.ts\` checks the limit before \`streamText\` runs, so rejected requests never open a stream [3].
- **Policy:** ${installed ? 'sliding window, 10 requests per 10 seconds per IP, using `@upstash/ratelimit` [1]' : 'fixed window, 10 requests per 10 seconds per IP, on the existing Redis client [2]'}.
- **Clients:** over-limit requests get \`429\` with a \`Retry-After\` header. Everything else is unchanged, including the stream format.
- **Model:** ${keptModel ? 'kept `gpt-4o`, as you chose in review.' : 'now `gpt-4.1-mini`.'}

Next, add \`UPSTASH_REDIS_REST_URL\` and \`UPSTASH_REDIS_REST_TOKEN\` to the deployment, and consider keying the limit by user id once auth lands.`;
}
