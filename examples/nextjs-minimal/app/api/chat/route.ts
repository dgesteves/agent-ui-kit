import { addUsage } from 'signoff-ui/core';
import { convertToModelMessages, stepCountIs, streamText, tool, type LanguageModelUsage, type UIMessage } from 'ai';
import { z } from 'zod';
import { mockModel } from '@/lib/mock-model';

type Message = UIMessage<{ usage?: LanguageModelUsage }>;

// A pretend repository, so nothing touches your disk or shell.
const FILES: Record<string, string> = {
  'app/api/chat/route.ts': 'export async function POST(req: Request) {\n  // ...\n}\n',
};

const tools = {
  read_file: tool({
    description: 'Read a file from the repository.',
    inputSchema: z.object({ path: z.string() }),
    execute: async ({ path }) => {
      const content = FILES[path];
      if (content === undefined) throw new Error(`ENOENT: no such file or directory, open '${path}'`);
      return { path, content };
    },
  }),
  // No execute: the page answers it with a DiffReview, and the result holds each file as applied.
  review_changes: tool({
    description: 'Propose edits to files. The user reviews them hunk by hunk before anything is written.',
    inputSchema: z.object({
      files: z.array(z.object({ path: z.string(), oldContent: z.string().optional(), newContent: z.string() })),
    }),
  }),
  run_command: tool({
    description: 'Run a shell command in the repository.',
    inputSchema: z.object({ command: z.string() }),
    execute: async ({ command }) => ({ exitCode: 0, stdout: `(simulated) ${command}` }),
  }),
};

export async function POST(req: Request) {
  const { messages }: { messages: Message[] } = await req.json();
  const result = streamText({
    model: mockModel, // Scripted, no API key needed. For a real run: openai('gpt-5.4-mini') from @ai-sdk/openai.
    messages: await convertToModelMessages(messages, { tools }),
    tools,
    // Ask before running commands. The reason shows on the approval card.
    toolApproval: { run_command: { type: 'user-approval', reason: 'Runs a shell command in the repository.' } },
    // Keep going after tool calls: the AI SDK stops after the first step by default.
    stopWhen: stepCountIs(10),
  });

  // After the review and the approval, the run continues the same message in a new request whose
  // totalUsage starts from zero, and useChat replaces metadata.usage. Add the usage the message already has
  // (it comes back from the client, so it is fine for display but not for billing).
  const last = messages.at(-1);
  const previous = last?.role === 'assistant' ? last.metadata?.usage : undefined;

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    sendSources: true,
    messageMetadata: ({ part }) =>
      part.type === 'finish' ? { usage: addUsage(previous, part.totalUsage) } : undefined,
    // Failed tool calls show this text. The default hides every error as "An error occurred.".
    onError: (error) => (error instanceof Error ? error.message : 'An error occurred.'),
  });
}
