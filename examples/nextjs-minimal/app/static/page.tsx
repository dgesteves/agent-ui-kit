import { AgentMessage, AgentStatus, ApprovalCard, DiffReview, RunMeter, Sources, ToolCallTimeline } from 'signoff-ui';
import type { UIMessage } from 'ai';

/*
 * A finished run, rendered from a Server Component with no Suspense boundary. `next build`
 * prerenders this page, and with cacheComponents it fails if a component reads the clock or a
 * random number while rendering, so CI catches it.
 */

const message: UIMessage = {
  id: 'run',
  role: 'assistant',
  parts: [
    { type: 'reasoning', text: 'Rate limiting belongs in the route.', state: 'done' },
    {
      type: 'tool-read_file',
      toolCallId: 'call_read_route',
      state: 'output-available',
      input: { path: 'app/api/chat/route.ts' },
      output: { path: 'app/api/chat/route.ts', content: 'export async function POST() {}' },
    },
    {
      type: 'tool-read_file',
      toolCallId: 'call_read_middleware',
      state: 'output-error',
      input: { path: 'middleware.ts' },
      errorText: "ENOENT: no such file or directory, open 'middleware.ts'",
    },
    {
      type: 'tool-run_command',
      toolCallId: 'call_install',
      state: 'output-available',
      input: { command: 'pnpm add @upstash/ratelimit' },
      output: { exitCode: 0 },
      approval: { id: 'approval_install', approved: true },
    },
    { type: 'text', text: 'Done. The route uses a sliding window limiter [1].', state: 'done' },
    { type: 'source-url', sourceId: 's1', url: 'https://upstash.com/docs/redis/sdks/ratelimit-ts/overview' },
  ],
};

export default function StaticPage() {
  return (
    <div className="bg-signoff-bg text-signoff-fg mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <AgentStatus state="done" elapsedMs={4_210} />
      <AgentMessage message={message} active={false} />
      <ToolCallTimeline parts={message.parts} active={false} />
      <ApprovalCard toolName="run_command" input={{ command: 'pnpm add @upstash/ratelimit' }} risk="high" />
      <DiffReview
        files={[{ path: 'lib/ratelimit.ts', oldContent: '', newContent: 'export const limit = 10;\n' }]}
        readOnly
      />
      <Sources sources={message.parts.filter((part) => part.type === 'source-url')} variant="cards" />
      <RunMeter usage={{ inputTokens: 15_700, outputTokens: 530 }} variant="expanded" />
    </div>
  );
}
