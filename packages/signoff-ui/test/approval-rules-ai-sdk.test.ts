import { convertToModelMessages, jsonSchema, readUIMessageStream, streamText, tool, type UIMessage } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { setToolInput, toToolApproval, type ApprovalRule } from '../src/lib/policy';
import { AI_SDK_MAJOR } from './utils';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

/** A model that asks to run `command` first, then answers in text once the result is in. */
function model(command: string) {
  let calls = 0;
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: new ReadableStream({
        start(c) {
          c.enqueue({ type: 'stream-start', warnings: [] });
          if (calls++ === 0)
            c.enqueue({
              type: 'tool-call',
              toolCallId: 'c1',
              toolName: 'run_command',
              input: JSON.stringify({ command }),
            });
          else {
            c.enqueue({ type: 'text-start', id: 't' });
            c.enqueue({ type: 'text-delta', id: 't', delta: 'Done.' });
            c.enqueue({ type: 'text-end', id: 't' });
          }
          c.enqueue({
            type: 'finish',
            finishReason: { unified: calls === 1 ? 'tool-calls' : 'stop', raw: undefined },
            usage,
          });
          c.close();
        },
      }),
    }),
  });
}

function setup(rules: ApprovalRule[], command: string) {
  const ran: string[] = [];
  const tools = {
    run_command: tool({
      inputSchema: jsonSchema<{ command: string }>({
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      }),
      execute: async ({ command }) => {
        ran.push(command);
        return { exitCode: 0 };
      },
    }),
  };
  const llm = model(command);
  const run = async (messages: UIMessage[]) => {
    const stream = streamText({
      model: llm,
      messages: await convertToModelMessages(messages, { tools }),
      tools,
      toolApproval: toToolApproval(rules),
    }).toUIMessageStream({ originalMessages: messages });
    let last: UIMessage | undefined;
    for await (const message of readUIMessageStream({ stream })) last = message;
    return last!;
  };
  return { ran, run };
}

const user: UIMessage = { id: 'u', role: 'user', parts: [{ type: 'text', text: 'clean up' }] };

/** What `addToolApprovalResponse` does to the part: the approval, answered. */
function approve(message: UIMessage): UIMessage {
  return {
    ...message,
    parts: message.parts.map((part) =>
      'approval' in part && part.approval
        ? ({ ...part, state: 'approval-responded', approval: { ...part.approval, approved: true } } as typeof part)
        : part,
    ),
  };
}

// toolApproval and the V4 mock models are AI SDK 7.
describe.skipIf(AI_SDK_MAJOR < 7)('approval rules with AI SDK 7', () => {
  it('approves on the server what an allow rule covers, without asking anyone', async () => {
    const { ran, run } = setup(
      [{ id: 'r', tool: 'run_command', args: { command: 'npm test*' }, effect: 'allow', scope: 'always' }],
      'npm test',
    );
    const message = await run([user]);
    const part = message.parts.find((p) => p.type === 'tool-run_command') as {
      state: string;
      approval?: { isAutomatic?: boolean; reason?: string };
    };
    expect(part.state).toBe('output-available');
    expect(part.approval).toMatchObject({
      isAutomatic: true,
      reason: 'Allowed by a rule: run_command with command npm test*',
    });
    expect(ran).toEqual(['npm test']);
  });

  it('denies on the server what a deny rule covers', async () => {
    const { ran, run } = setup(
      [{ id: 'r', tool: 'run_command', args: { command: 'rm *' }, effect: 'deny', scope: 'always' }],
      'rm -rf /',
    );
    const message = await run([user]);
    expect(message.parts.find((p) => p.type === 'tool-run_command')).toMatchObject({ state: 'output-denied' });
    expect(ran).toEqual([]);
  });

  it('runs the arguments a person edited before approving', async () => {
    const { ran, run } = setup([], 'rm -rf build');
    const asked = await run([user]);
    expect(asked.parts.find((p) => p.type === 'tool-run_command')).toMatchObject({ state: 'approval-requested' });
    // In the app: setMessages((m) => setToolInput(m, id, input)), then addToolApprovalResponse.
    const [edited] = setToolInput([asked], 'c1', { command: 'rm -rf build/cache' });
    await run([user, approve(edited!)]);
    // The server ran the call with the input in the messages, after checking it against the tool's schema.
    expect(ran).toEqual(['rm -rf build/cache']);
  });

  it('checks the rules again on edited arguments: a deny rule stops an edit it covers', async () => {
    const rules: ApprovalRule[] = [
      { id: 'r', tool: 'run_command', args: { command: 'rm -rf /*' }, effect: 'deny', scope: 'always' },
    ];
    const { ran, run } = setup(rules, 'rm -rf build');
    const asked = await run([user]);
    const [edited] = setToolInput([asked], 'c1', { command: 'rm -rf /' });
    await run([user, approve(edited!)]);
    expect(ran).toEqual([]);
  });
});
