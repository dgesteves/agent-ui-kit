import type { ChatModelAdapter, ChatModelRunResult, ThreadAssistantMessagePart } from '@assistant-ui/react';
import type { DiffReviewToolOutput, FileChange } from 'signoff-ui';

/*
 * A scripted coding agent instead of a model: no API key, no network. Each run looks at the calls
 * it already made in this message (a local runtime adapter sees its unfinished message through
 * `unstable_getMessage`) and takes the next step:
 *   1. proposes an edit to two files with `review_changes`, which waits for your review;
 *   2. reads the review and asks to run a command behind an approval gate;
 *   3. reports what happened.
 */

const ROUTE_BEFORE = `import { streamText } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();
  const result = streamText({ model: 'openai/gpt-5', messages });
  return result.toUIMessageStreamResponse();
}
`;

const ROUTE_AFTER = `import { streamText } from 'ai';
import { limiter } from '@/lib/rate-limit';

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') ?? 'anonymous';
  const { success } = await limiter.limit(ip);
  if (!success) return new Response('Too many requests', { status: 429 });

  const { messages } = await req.json();
  const result = streamText({ model: 'openai/gpt-5', messages });
  return result.toUIMessageStreamResponse();
}
`;

const LIMITER = `import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export const limiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'),
});
`;

const PROPOSED = [
  { path: 'app/api/chat/route.ts', oldContent: ROUTE_BEFORE, newContent: ROUTE_AFTER },
  { path: 'lib/rate-limit.ts', oldContent: '', newContent: LIMITER },
] satisfies FileChange[];

const COMMAND = 'pnpm add @upstash/ratelimit @upstash/redis';

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });

/** Streams `text` a few words at a time, then the parts after it, then pauses or completes the run. */
async function* say(
  text: string,
  signal: AbortSignal,
  after: ThreadAssistantMessagePart[] = [],
): AsyncGenerator<ChatModelRunResult> {
  const words = text.split(' ');
  for (let i = 1; i <= words.length; i += 3) {
    await sleep(30, signal);
    yield { content: [{ type: 'text', text: words.slice(0, i + 2).join(' ') }] };
  }
  yield {
    content: [{ type: 'text', text }, ...after],
    // A tool call waiting on a person pauses the run until the review or the decision comes back.
    status: after.length ? { type: 'requires-action', reason: 'tool-calls' } : { type: 'complete', reason: 'stop' },
  };
}

let calls = 0;

export const mockModel: ChatModelAdapter = {
  async *run({ abortSignal, unstable_getMessage }) {
    const parts = unstable_getMessage().content;
    const review = parts.find((p) => p.type === 'tool-call' && p.toolName === 'review_changes');
    const command = parts.find((p) => p.type === 'tool-call' && p.toolName === 'run_command');

    if (!review) {
      const id = `call_${++calls}`;
      yield* say(
        'I added a sliding window limiter to the chat route. Review the two files before I go on.',
        abortSignal,
        [
          {
            type: 'tool-call',
            toolCallId: id,
            toolName: 'review_changes',
            args: { files: PROPOSED },
            argsText: JSON.stringify({ files: PROPOSED }),
          },
        ],
      );
      return;
    }

    if (review.type === 'tool-call' && !command) {
      const { summary } = review.result as DiffReviewToolOutput;
      const id = `call_${++calls}`;
      yield* say(`${summary} The limiter needs two packages, so I'd like to install them.`, abortSignal, [
        {
          type: 'tool-call',
          toolCallId: id,
          toolName: 'run_command',
          args: { command: COMMAND },
          argsText: JSON.stringify({ command: COMMAND }),
          approval: { id: `approval_${id}`, prompt: 'Installs two packages from npm.' },
        },
      ]);
      return;
    }

    const approved = command?.type === 'tool-call' && command.approval?.approved;
    yield* say(
      approved
        ? 'Installed @upstash/ratelimit and @upstash/redis. The chat route now answers 429 past 10 requests in 10 seconds.'
        : "I didn't install anything. The limiter needs those packages, so the route won't build until they're added.",
      abortSignal,
    );
  },
};
