import type { RunUsage } from '@dgesteves/agent-ui-kit';
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import {
  AFTER_DENY,
  AFTER_INSTALL,
  FILES,
  FINDINGS,
  finalAnswer,
  INSTALL_REASON,
  MODEL,
  PLAN,
  RATELIMIT_FIXED_WINDOW,
  RATELIMIT_UPSTASH,
  REASONING,
  ROUTE_NEW,
  ROUTE_OLD,
  SEARCH_CODE_OUTPUT,
  WEB_RESULTS,
} from './scenario';

export type RunMetadata = { model?: string; usage?: RunUsage };
export type AgentUIMessage = UIMessage<RunMetadata>;

export interface ReviewOutput {
  accepted: number;
  rejected: number;
  files: Array<{ path: string; content?: string | undefined; accepted: string[]; rejected: string[] }>;
}

/**
 * Playback clock for the scripted run. Speed and pause can change mid-sleep:
 * sleeps advance in small ticks scaled by the current speed.
 */
export class PlaybackClock {
  private speed = 1;
  private paused = false;

  /** Update playback; takes effect on the next tick of any in-flight sleep. */
  configure({ speed, paused }: { speed: number; paused: boolean }) {
    this.speed = speed;
    this.paused = paused;
  }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason);
      let elapsed = 0;
      let last = performance.now();
      const id = setInterval(() => {
        const now = performance.now();
        if (!this.paused) elapsed += (now - last) * this.speed;
        last = now;
        if (elapsed >= ms) {
          clearInterval(id);
          signal?.removeEventListener('abort', onAbort);
          resolve();
        }
      }, 16);
      const onAbort = () => {
        clearInterval(id);
        reject(signal?.reason);
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}

type Emit = (chunk: UIMessageChunk) => void;

interface Ctx {
  emit: Emit;
  sleep: (ms: number) => Promise<void>;
  usage: Required<Pick<RunUsage, 'inputTokens' | 'outputTokens'>> & {
    cached: number;
    reasoning: number;
  };
}

const tokensOf = (text: string) => Math.max(1, Math.round(text.length / 4));

function publishUsage(ctx: Ctx) {
  const u = ctx.usage;
  ctx.emit({
    type: 'message-metadata',
    messageMetadata: {
      model: MODEL,
      usage: {
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        totalTokens: u.inputTokens + u.outputTokens,
        inputTokenDetails: { cacheReadTokens: u.cached, noCacheTokens: u.inputTokens - u.cached, cacheWriteTokens: 0 },
        outputTokenDetails: { reasoningTokens: u.reasoning, textTokens: u.outputTokens - u.reasoning },
      },
    } satisfies RunMetadata,
  });
}

/** A model call: charges the context as input tokens (part of it cached). */
async function startStep(ctx: Ctx, input: number, cached: number) {
  ctx.emit({ type: 'start-step' });
  ctx.usage.inputTokens += input;
  ctx.usage.cached += cached;
  publishUsage(ctx);
  await ctx.sleep(260);
}

/** Split text into word-ish deltas of 1–3 words, the way models stream. */
function deltas(text: string): string[] {
  const words = text.match(/\S+\s*|\s+/g) ?? [];
  const out: string[] = [];
  for (let i = 0; i < words.length;) {
    const n = 1 + ((i * 7) % 3);
    out.push(words.slice(i, i + n).join(''));
    i += n;
  }
  return out;
}

async function streamText(
  ctx: Ctx,
  id: string,
  text: string,
  kind: 'text' | 'reasoning' = 'text',
  wordsPerSecond = 38,
) {
  ctx.emit({ type: `${kind}-start`, id });
  for (const delta of deltas(text)) {
    ctx.emit({ type: `${kind}-delta`, id, delta });
    const tokens = tokensOf(delta);
    ctx.usage.outputTokens += tokens;
    if (kind === 'reasoning') ctx.usage.reasoning += tokens;
    publishUsage(ctx);
    await ctx.sleep((delta.split(/\s+/).filter(Boolean).length / wordsPerSecond) * 1000);
  }
  ctx.emit({ type: `${kind}-end`, id });
}

async function toolInput(ctx: Ctx, toolCallId: string, toolName: string, input: unknown, streamMs = 500) {
  ctx.emit({ type: 'tool-input-start', toolCallId, toolName });
  const json = JSON.stringify(input);
  const pieces = Math.max(2, Math.min(8, Math.round(json.length / 12)));
  const size = Math.ceil(json.length / pieces);
  for (let i = 0; i < json.length; i += size) {
    ctx.emit({ type: 'tool-input-delta', toolCallId, inputTextDelta: json.slice(i, i + size) });
    await ctx.sleep(streamMs / pieces);
  }
  ctx.usage.outputTokens += tokensOf(json);
  publishUsage(ctx);
  ctx.emit({ type: 'tool-input-available', toolCallId, toolName, input });
}

/** Phase 1: plan, research, and ask to install a dependency. */
async function research(ctx: Ctx) {
  await startStep(ctx, 3_240, 0);
  await streamText(ctx, 'reasoning-1', REASONING, 'reasoning', 46);
  await streamText(ctx, 'text-plan', PLAN);
  await toolInput(ctx, 'call_search', 'search_code', { query: 'api/chat route handler' }, 420);
  await ctx.sleep(720);
  ctx.emit({ type: 'tool-output-available', toolCallId: 'call_search', output: SEARCH_CODE_OUTPUT });
  ctx.emit({ type: 'finish-step' });

  await startStep(ctx, 4_020, 3_100);
  await toolInput(ctx, 'call_read_route', 'read_file', { path: 'app/api/chat/route.ts' }, 320);
  await ctx.sleep(380);
  ctx.emit({
    type: 'tool-output-available',
    toolCallId: 'call_read_route',
    output: { path: 'app/api/chat/route.ts', content: FILES['app/api/chat/route.ts'] },
  });
  // Two reads issued together: they overlap in the waterfall.
  await toolInput(ctx, 'call_read_mw', 'read_file', { path: 'middleware.ts' }, 260);
  await toolInput(ctx, 'call_read_redis', 'read_file', { path: 'lib/redis.ts' }, 260);
  await ctx.sleep(240);
  ctx.emit({
    type: 'tool-output-error',
    toolCallId: 'call_read_mw',
    errorText: "ENOENT: no such file or directory, open 'middleware.ts'",
  });
  await ctx.sleep(260);
  ctx.emit({
    type: 'tool-output-available',
    toolCallId: 'call_read_redis',
    output: { path: 'lib/redis.ts', content: FILES['lib/redis.ts'] },
  });
  ctx.emit({ type: 'finish-step' });

  await startStep(ctx, 5_960, 3_900);
  await toolInput(
    ctx,
    'call_web',
    'web_search',
    { query: 'upstash ratelimit sliding window next.js route handler' },
    480,
  );
  await ctx.sleep(1_250);
  ctx.emit({ type: 'tool-output-available', toolCallId: 'call_web', output: { results: WEB_RESULTS } });
  WEB_RESULTS.forEach((r, i) => ctx.emit({ type: 'source-url', sourceId: `src_${i + 1}`, url: r.url, title: r.title }));
  ctx.emit({ type: 'finish-step' });

  await startStep(ctx, 7_420, 5_900);
  await streamText(ctx, 'text-findings', FINDINGS);
  await toolInput(
    ctx,
    'call_install',
    'run_command',
    { command: 'pnpm add @upstash/ratelimit', cwd: '~/acme/chat-app' },
    520,
  );
  ctx.emit({
    type: 'tool-approval-request',
    approvalId: 'approval_install',
    toolCallId: 'call_install',
    reason: INSTALL_REASON,
  });
  ctx.emit({ type: 'finish-step' });
}

/** Phase 2: run (or skip) the install, then propose the edit for review. */
async function propose(ctx: Ctx, approved: boolean) {
  if (approved) {
    await ctx.sleep(1_650);
    ctx.emit({
      type: 'tool-output-available',
      toolCallId: 'call_install',
      output: {
        exitCode: 0,
        stdout: 'Packages: +2\n+ @upstash/ratelimit 2.0.6\n+ @upstash/core-analytics 0.0.10\nDone in 1.8s',
      },
    });
  } else {
    ctx.emit({ type: 'tool-output-denied', toolCallId: 'call_install' });
  }
  await startStep(ctx, 8_640, 7_300);
  await streamText(ctx, 'text-proposal', approved ? AFTER_INSTALL : AFTER_DENY);
  ctx.emit({ type: 'tool-input-start', toolCallId: 'call_review', toolName: 'review_changes' });
  await ctx.sleep(1_100);
  const files = [
    { path: 'lib/ratelimit.ts', oldContent: '', newContent: approved ? RATELIMIT_UPSTASH : RATELIMIT_FIXED_WINDOW },
    { path: 'app/api/chat/route.ts', oldContent: ROUTE_OLD, newContent: ROUTE_NEW },
  ];
  ctx.usage.outputTokens += tokensOf(JSON.stringify(files));
  publishUsage(ctx);
  ctx.emit({ type: 'tool-input-available', toolCallId: 'call_review', toolName: 'review_changes', input: { files } });
  ctx.emit({ type: 'finish-step' });
}

/** Phase 3: summarize what was applied. */
async function summarize(ctx: Ctx, review: ReviewOutput, installed: boolean) {
  await startStep(ctx, 10_380, 8_600);
  const route = review.files.find((f) => f.path === 'app/api/chat/route.ts');
  const keptModel = !route?.content || route.content.includes("openai('gpt-4o')");
  await streamText(ctx, 'text-final', finalAnswer({ keptModel, installed, applied: review.accepted }), 'text', 44);
  ctx.emit({ type: 'finish-step' });
}

type Part = AgentUIMessage['parts'][number];
const findTool = (parts: readonly Part[], type: string) =>
  parts.find((p): p is Extract<Part, { toolCallId: string }> => p.type === type);

/**
 * A `ChatTransport` that replays a scripted agent run. It returns real
 * `UIMessageChunk` streams, so `useChat` builds message parts exactly as it
 * would from a server, including approvals and client-side tool results.
 */
export class MockAgentTransport implements ChatTransport<AgentUIMessage> {
  constructor(private readonly clock: PlaybackClock) {}

  async sendMessages({ messages, abortSignal }: Parameters<ChatTransport<AgentUIMessage>['sendMessages']>[0]) {
    const clock = this.clock;
    const last = messages.at(-1);
    const prior = last?.role === 'assistant' ? last.metadata?.usage : undefined;
    const parts = last?.role === 'assistant' ? last.parts : [];
    const install = findTool(parts, 'tool-run_command');
    const review = findTool(parts, 'tool-review_changes');

    return new ReadableStream<UIMessageChunk>({
      async start(controller) {
        const ctx: Ctx = {
          emit: (chunk) => controller.enqueue(chunk),
          sleep: (ms) => clock.sleep(ms, abortSignal),
          usage: {
            inputTokens: prior?.inputTokens ?? 0,
            outputTokens: prior?.outputTokens ?? 0,
            cached: prior?.inputTokenDetails?.cacheReadTokens ?? 0,
            reasoning: prior?.outputTokenDetails?.reasoningTokens ?? 0,
          },
        };
        try {
          // Time to first byte: the model "thinks" before anything streams.
          await ctx.sleep(last?.role === 'user' ? 680 : 420);
          ctx.emit(last?.role === 'user' ? { type: 'start', messageMetadata: { model: MODEL } } : { type: 'start' });
          if (review?.state === 'output-available') {
            await summarize(ctx, review.output as ReviewOutput, install?.approval?.approved === true);
          } else if (install?.state === 'approval-responded') {
            await propose(ctx, install.approval.approved);
          } else {
            await research(ctx);
          }
          ctx.emit({ type: 'finish', finishReason: 'stop' });
          controller.close();
        } catch (error) {
          // Replay/stop aborts mid-run; the consumer has already stopped reading.
          try {
            if (abortSignal?.aborted) controller.close();
            else controller.error(error);
          } catch {
            /* stream already cancelled */
          }
        }
      },
    });
  }

  async reconnectToStream() {
    return null;
  }
}
