import { openai } from '@ai-sdk/openai';
import { addUsage } from 'signoff-ui/core';
import { convertToModelMessages, stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';
import type { AgentUIMessage } from '@/lib/mock-agent';
import { FILES, SEARCH_CODE_OUTPUT, WEB_RESULTS } from '@/lib/scenario';

export const maxDuration = 60;

const SYSTEM = `You are a coding agent working in the Next.js repository acme/chat-app.
Investigate before editing: search the code, read the relevant files, and look up docs when useful.
Propose edits with the review_changes tool, passing each file's full old and new contents.
Keep edits small and explain the plan briefly before calling tools. Cite web results as [n].`;

/*
 * The same tools the scripted agent uses, backed by the scenario's in-memory repo.
 * Nothing touches the real filesystem or shell.
 */
const tools = {
  search_code: tool({
    description: 'Search the repository for code matching a query.',
    inputSchema: z.object({ query: z.string() }),
    execute: async () => SEARCH_CODE_OUTPUT,
  }),
  read_file: tool({
    description: 'Read a file from the repository.',
    inputSchema: z.object({ path: z.string() }),
    execute: async ({ path }) => {
      const content = FILES[path];
      if (content === undefined) throw new Error(`ENOENT: no such file or directory, open '${path}'`);
      return { path, content };
    },
  }),
  web_search: tool({
    description: 'Search the web for documentation.',
    inputSchema: z.object({ query: z.string() }),
    execute: async () => ({ results: WEB_RESULTS }),
  }),
  run_command: tool({
    description: 'Run a shell command in the repository, e.g. to install a dependency.',
    inputSchema: z.object({ command: z.string(), cwd: z.string().optional() }),
    execute: async ({ command }) => ({ exitCode: 0, stdout: `(simulated) ${command}\nDone.` }),
  }),
  // No `execute`: the client renders a DiffReview and returns the result with addToolOutput.
  review_changes: tool({
    description: 'Propose file edits for the user to review hunk by hunk.',
    inputSchema: z.object({
      files: z.array(z.object({ path: z.string(), oldContent: z.string(), newContent: z.string() })),
    }),
  }),
};

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: 'Live mode needs OPENAI_API_KEY on the server.' }, { status: 501 });
  }
  const { messages }: { messages: AgentUIMessage[] } = await req.json();
  const model = process.env.OPENAI_MODEL ?? 'gpt-5.4-mini';

  const result = streamText({
    model: openai(model),
    system: SYSTEM,
    messages: await convertToModelMessages(messages, { tools }),
    tools,
    toolApproval: {
      run_command: { type: 'user-approval', reason: 'Runs a shell command in the repository.' },
    },
    stopWhen: stepCountIs(12),
  });

  // After an approval or a review, the run continues the same message in a new request whose
  // totalUsage starts from zero, and the client replaces metadata.usage: add what came before.
  const last = messages.at(-1);
  const previous = last?.role === 'assistant' ? last.metadata?.usage : undefined;

  return result.toUIMessageStreamResponse<AgentUIMessage>({
    originalMessages: messages,
    sendSources: true,
    messageMetadata: ({ part }) => {
      if (part.type === 'start') return { model };
      if (part.type === 'finish') return { model, usage: addUsage(previous, part.totalUsage) };
      return undefined;
    },
  });
}
