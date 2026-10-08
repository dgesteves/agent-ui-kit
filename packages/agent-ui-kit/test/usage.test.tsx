import { render } from '@testing-library/react';
import {
  convertToModelMessages,
  jsonSchema,
  readUIMessageStream,
  streamText,
  tool,
  type LanguageModelUsage,
  type UIMessage,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { addUsage } from '../src/lib/usage';
import { RunMeter } from '../src/run-meter';
import { AI_SDK_MAJOR } from './utils';

describe('addUsage', () => {
  it('adds every field, keeping fields that neither side reports undefined', () => {
    const total: LanguageModelUsage = addUsage(
      {
        inputTokens: 1000,
        outputTokens: 100,
        totalTokens: 1100,
        inputTokenDetails: { noCacheTokens: 400, cacheReadTokens: 600 },
        outputTokenDetails: { reasoningTokens: 40, textTokens: 60 },
      },
      {
        inputTokens: 1500,
        outputTokens: 20,
        totalTokens: 1520,
        inputTokenDetails: { noCacheTokens: 300, cacheReadTokens: 1000, cacheWriteTokens: 200 },
        outputTokenDetails: { textTokens: 20 },
      },
    );
    expect(total).toEqual({
      inputTokens: 2500,
      outputTokens: 120,
      totalTokens: 2620,
      inputTokenDetails: { noCacheTokens: 700, cacheReadTokens: 1600, cacheWriteTokens: 200 },
      outputTokenDetails: { reasoningTokens: 40, textTokens: 80 },
    });
    expect(addUsage(undefined, { inputTokens: 5 })).toEqual({
      inputTokens: 5,
      outputTokens: undefined,
      totalTokens: undefined,
      inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined },
      outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
    });
  });
});

/*
 * The README's server recipe, run in-process: a request that stops for an
 * approval, then the continuation that useChat sends once the user approves.
 * readUIMessageStream assembles the message exactly as useChat does.
 */
type Message = UIMessage<{ usage?: LanguageModelUsage }>;

const usage = (input: number, output: number) => ({
  inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: output, text: output, reasoning: 0 },
});
const stream = (chunks: unknown[]) => ({
  stream: new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  }),
});

function createModel() {
  return new MockLanguageModelV4({
    doStream: [
      stream([
        { type: 'stream-start', warnings: [] },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'run_command', input: '{"command":"ls"}' },
        { type: 'finish', finishReason: { unified: 'tool-calls', raw: undefined }, usage: usage(1000, 100) },
      ]),
      stream([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 't' },
        { type: 'text-delta', id: 't', delta: 'Done.' },
        { type: 'text-end', id: 't' },
        { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: usage(1500, 20) },
      ]),
    ] as never,
  });
}

const tools = {
  run_command: tool({
    inputSchema: jsonSchema<{ command: string }>({
      type: 'object',
      properties: { command: { type: 'string' } },
      required: ['command'],
    }),
    execute: async () => ({ ok: true }),
  }),
};

async function runWithApproval(sumUsage: boolean) {
  const model = createModel();
  const respond = async (messages: Message[]) => {
    const result = streamText({
      model,
      messages: await convertToModelMessages(messages, { tools }),
      tools,
      toolApproval: { run_command: { type: 'user-approval', reason: 'Runs a shell command in the repository.' } },
    });
    const last = messages.at(-1);
    const previous = last?.role === 'assistant' ? last.metadata?.usage : undefined;
    return result.toUIMessageStream<Message>({
      originalMessages: messages,
      messageMetadata: ({ part }) =>
        part.type === 'finish'
          ? { usage: sumUsage ? addUsage(previous, part.totalUsage) : part.totalUsage }
          : undefined,
    });
  };
  const read = async (stream: ReadableStream, message?: Message) => {
    let last: Message | undefined;
    for await (const m of readUIMessageStream<Message>({ stream, ...(message ? { message } : {}) })) last = m;
    return last!;
  };

  const user: Message = { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Clean the build' }] };
  const first = await read(await respond([user]));
  expect(first.parts.find((p) => p.type === 'tool-run_command')).toMatchObject({ state: 'approval-requested' });
  expect(first.metadata?.usage).toMatchObject({ inputTokens: 1000, outputTokens: 100 });

  // What addToolApprovalResponse({ id, approved: true }) does to the part.
  const approved: Message = {
    ...first,
    parts: first.parts.map((p) =>
      p.type === 'tool-run_command' && p.state === 'approval-requested'
        ? { ...p, state: 'approval-responded', approval: { ...p.approval, approved: true } }
        : p,
    ) as Message['parts'],
  };
  const final = await read(await respond([user, approved]), approved);
  expect(final.id).toBe(first.id);
  expect(final.parts.at(-1)).toMatchObject({ type: 'text', text: 'Done.' });
  return final.metadata?.usage;
}

// `toolApproval` policies and the V4 mock models are AI SDK 7.
describe.skipIf(AI_SDK_MAJOR < 7)('usage across an approval round trip (README server recipe)', () => {
  it('reports the whole run on the RunMeter, not just the last request', async () => {
    const total = await runWithApproval(true);
    expect(total).toMatchObject({ inputTokens: 2500, outputTokens: 120, totalTokens: 2620 });
    const { container } = render(<RunMeter usage={total} pricing={{ input: 2.5, output: 10 }} />);
    expect(container.querySelector('.sr-only')).toHaveTextContent(
      '2.50k input tokens, 120 output tokens, estimated cost $0.0075',
    );
  });

  it('needs the sum: the client replaces metadata.usage on a continuation', async () => {
    // Guards the recipe against double counting should the SDK ever start merging usage itself.
    expect(await runWithApproval(false)).toMatchObject({ inputTokens: 1500, outputTokens: 20 });
  });
});
