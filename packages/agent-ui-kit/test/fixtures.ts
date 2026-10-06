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
