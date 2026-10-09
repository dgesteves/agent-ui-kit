'use client';

import {
  AgentMessage,
  AgentStatus,
  computeReviewResult,
  deriveAgentState,
  DiffReview,
  formatCost,
  formatDuration,
  estimateCost,
  getToolPartName,
  getToolParts,
  parseFileChange,
  RunMeter,
  useRunTiming,
  type DiffReviewResult,
  type FileChange,
  type HunkDecision,
  type ToolPart,
} from '@dgesteves/agent-ui-kit';
import { useChat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
} from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MockAgentTransport, PlaybackClock, type AgentUIMessage, type ReviewOutput } from '@/lib/mock-agent';
import { MODEL, PRICING, PROMPT, REPO } from '@/lib/scenario';
import { toolMeta } from '@/lib/tools';
import { Composer } from './composer';
import { Header } from './header';
import { CompactRunControls, KeyboardCard, RunControls, Sheet } from './controls';

type Mode = 'mock' | 'live';

const CLIENT_TOOLS = ['review_changes'];

function toReviewOutput(result: DiffReviewResult): ReviewOutput {
  return {
    accepted: result.accepted,
    rejected: result.rejected,
    files: result.files.map((f) => ({ path: f.path, content: f.content, accepted: f.accepted, rejected: f.rejected })),
  };
}

function decisionsFrom(output: ReviewOutput | undefined): Record<string, HunkDecision> {
  const decisions: Record<string, HunkDecision> = {};
  for (const file of output?.files ?? []) {
    for (const id of file.accepted) decisions[id] = 'accepted';
    for (const id of file.rejected) decisions[id] = 'rejected';
  }
  return decisions;
}

export function Playground({
  liveAvailable,
  hero,
  children,
}: {
  liveAvailable: boolean;
  /** The headline, rendered on the server, beside the run's sidebar on wide screens. */
  hero: ReactNode;
  /** Sections after the run. */
  children?: ReactNode;
}) {
  const [mode, setMode] = useState<Mode>('mock');
  const [clock] = useState(() => new PlaybackClock());
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [autopilot, setAutopilot] = useState(false);
  const [inspect, setInspect] = useState(false);
  const [runId, setRunId] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    clock.configure({ speed, paused });
  }, [clock, speed, paused]);

  // Read flags such as ?autopilot=1&speed=2 once, for demos and screenshots.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = setTimeout(() => {
      if (params.get('autopilot') === '1') setAutopilot(true);
      if (params.get('inspect') === '1') setInspect(true);
      const s = Number(params.get('speed'));
      if ([0.5, 1, 2, 4].includes(s)) setSpeed(s);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const transport = useMemo(
    () =>
      mode === 'mock' ? new MockAgentTransport(clock) : new DefaultChatTransport<AgentUIMessage>({ api: '/api/chat' }),
    [mode, clock],
  );

  const chat = useChat<AgentUIMessage>({
    id: `playground-${mode}`,
    transport,
    sendAutomaticallyWhen: ({ messages }) =>
      lastAssistantMessageIsCompleteWithApprovalResponses({ messages }) ||
      lastAssistantMessageIsCompleteWithToolCalls({ messages }),
  });
  const { messages, status, sendMessage, setMessages, stop, addToolApprovalResponse, addToolOutput } = chat;

  const startRun = useCallback(() => {
    void stop();
    setMessages([]);
    setPaused(false);
    setRunId((n) => n + 1);
    void sendMessage({ text: PROMPT });
  }, [stop, setMessages, sendMessage]);

  // Follow the run once the reader has scrolled to its end or started a run themselves.
  // Not from the start: on a phone, following the run that starts on load scrolls past the headline.
  const endRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(false);
  const replay = useCallback(() => {
    stickRef.current = true;
    startRun();
  }, [startRun]);

  // The mock run starts on load; live mode waits for a prompt.
  useEffect(() => {
    if (mode !== 'mock') return;
    const id = setTimeout(startRun, 450);
    return () => clearTimeout(id);
  }, [mode, startRun]);

  const lastAssistant = messages.findLast((m) => m.role === 'assistant');
  const userMessage = messages.find((m) => m.role === 'user');
  const derived = deriveAgentState({ status, message: lastAssistant, pendingClientTools: CLIENT_TOOLS });
  // Paused playback counts as idle time, like waiting on the human.
  const timing = useRunTiming(paused ? 'ready' : status, runId);
  const usage = lastAssistant?.metadata?.usage;
  const running = status === 'submitted' || status === 'streaming';
  const writing = derived.state === 'working' && derived.detail === 'Writing response';
  const statusLabel =
    paused && running
      ? 'Paused'
      : derived.state === 'awaiting-approval' && derived.detail === 'review_changes'
        ? 'Waiting for review'
        : writing
          ? 'Writing'
          : undefined;
  const statusDetail =
    paused || writing
      ? undefined
      : derived.state === 'working' && derived.detail
        ? (toolMeta[derived.detail]?.label ?? derived.detail)
        : derived.state === 'awaiting-approval' && derived.detail === 'run_command'
          ? 'run_command'
          : undefined;

  const review = useCallback(
    (part: ToolPart) => {
      if (
        part.type !== 'tool-review_changes' &&
        !(part.type === 'dynamic-tool' && part.toolName === 'review_changes')
      ) {
        return undefined;
      }
      if (part.state === 'input-streaming') return <PreparingChanges />;
      const files = ((part.input as { files?: FileChange[] } | undefined)?.files ?? []) as FileChange[];
      if (part.state === 'input-available') {
        return (
          <ReviewStep
            key={`${runId}-${part.toolCallId}`}
            files={files}
            onSubmit={(result) =>
              void addToolOutput({
                tool: 'review_changes',
                toolCallId: part.toolCallId,
                output: toReviewOutput(result),
              })
            }
          />
        );
      }
      if (part.state === 'output-available') {
        return <AppliedChanges files={files} output={part.output as ReviewOutput} />;
      }
      return null;
    },
    [addToolOutput, runId],
  );

  // Autopilot plays the human: approve the install, then accept everything but the model swap.
  useEffect(() => {
    if (!autopilot || mode !== 'mock' || paused || !lastAssistant) return;
    const tools = getToolParts(lastAssistant.parts);
    const approval = tools.find((p) => getToolPartName(p) === 'run_command' && p.state === 'approval-requested');
    if (approval?.approval) {
      const approvalId = approval.approval.id;
      const id = setTimeout(() => void addToolApprovalResponse({ id: approvalId, approved: true }), 1600 / speed);
      return () => clearTimeout(id);
    }
    const pending = tools.find((p) => getToolPartName(p) === 'review_changes' && p.state === 'input-available');
    if (pending) {
      const files = ((pending.input as { files: FileChange[] }).files ?? []).map((f) => parseFileChange(f));
      const decisions: Record<string, HunkDecision> = {};
      for (const file of files) {
        for (const hunk of file.hunks) {
          const swapsModel = hunk.lines.some((l) => l.type === 'add' && l.content.includes('gpt-4.1-mini'));
          decisions[hunk.id] = swapsModel ? 'rejected' : 'accepted';
        }
      }
      const id = setTimeout(
        () =>
          void addToolOutput({
            tool: 'review_changes',
            toolCallId: pending.toolCallId,
            output: toReviewOutput(computeReviewResult(files, decisions)),
          }),
        2600 / speed,
      );
      return () => clearTimeout(id);
    }
  }, [autopilot, mode, paused, lastAssistant, addToolApprovalResponse, addToolOutput, speed]);

  useEffect(() => {
    // Follow while the end of the run is on screen or just below it, not while the reader is
    // further up in the run or further down the page.
    const onScroll = () => {
      const top = endRef.current?.getBoundingClientRect().top;
      stickRef.current = top !== undefined && top >= 0 && top <= window.innerHeight + 200;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (stickRef.current && running) endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, running]);

  const done = status === 'ready' && derived.state === 'done';
  const cost = usage ? estimateCost(usage, PRICING).total : undefined;

  const controls = {
    speed,
    onSpeedChange: setSpeed,
    paused,
    onPausedChange: setPaused,
    running,
    onReplay: replay,
    autopilot,
    onAutopilotChange: setAutopilot,
    inspect,
    onInspectChange: setInspect,
  };
  const meter = {
    usage,
    pricing: PRICING,
    ttftMs: timing.ttftMs,
    durationMs: timing.startedAt !== undefined ? timing.activeMs : undefined,
    live: running && !paused,
  };

  return (
    <div className="min-h-dvh">
      <Header mode={mode} liveAvailable={liveAvailable} onModeChange={setMode} />
      <div className="grid-backdrop pointer-events-none fixed inset-x-0 top-0 -z-10 h-[70vh]" aria-hidden="true" />

      <main id="main">
        {/*
         * Phones: the headline, a sticky bar with the status and playback, then the conversation; the
         * rest of the controls open in a sheet. Wide screens: the headline and the run on the left, the
         * status, controls and telemetry in a sticky sidebar. Flex on phones so the bar can stick for
         * the whole run (a grid item only sticks within its own row). The sidebar spans both rows; the
         * second row takes its extra height, so the run doesn't move once it outgrows the sidebar.
         */}
        <div
          data-inspect={inspect || undefined}
          className="mx-auto flex w-full max-w-[1320px] flex-col gap-6 px-4 pt-7 sm:px-6 sm:pt-12 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr] lg:gap-x-10 lg:gap-y-8 lg:pt-12"
        >
          <div className="lg:col-start-1 lg:row-start-1">{hero}</div>

          <aside
            className="border-line/80 bg-ink/85 sticky top-14 z-30 -mx-4 border-y px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6 lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:-m-2 lg:flex lg:max-h-[calc(100dvh-6rem)] lg:[scrollbar-width:thin] lg:flex-col lg:gap-4 lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:border-0 lg:bg-transparent lg:p-2 lg:backdrop-blur-none"
            aria-label="Run status and controls"
          >
            <section
              className="lg:border-line lg:bg-raised/70 lg:rounded-xl lg:border lg:p-4 lg:backdrop-blur"
              aria-labelledby="status-heading"
            >
              <div className="mb-3 flex items-center justify-between max-lg:sr-only">
                <h2
                  id="status-heading"
                  className="font-mono text-[10.5px] font-medium tracking-[0.08em] text-[#8b94a0] uppercase"
                >
                  Agent
                </h2>
                <span className="font-mono text-[11px] text-[#8b94a0]">{mode === 'mock' ? MODEL : 'live'}</span>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <AgentStatus
                  state={paused && running ? 'idle' : derived.state}
                  label={statusLabel}
                  detail={statusDetail}
                  elapsedMs={timing.startedAt !== undefined ? timing.activeMs : undefined}
                  // Phones: no room for the tool name next to the playback buttons; the timeline has it.
                  className="min-w-0 max-sm:[&>.truncate]:hidden"
                />
                {mode === 'mock' && (
                  <CompactRunControls
                    className="ml-auto lg:hidden"
                    paused={paused}
                    running={running}
                    onPausedChange={setPaused}
                    onReplay={replay}
                    onOpenControls={() => setSheetOpen(true)}
                    controlsId="run-controls-sheet"
                  />
                )}
              </div>
              {mode === 'mock' && <RunControls className="mt-4 hidden lg:flex" {...controls} />}
            </section>
            <RunMeter
              variant="expanded"
              {...meter}
              model={mode === 'mock' ? MODEL : undefined}
              className="border-line bg-raised/70 hidden backdrop-blur lg:block"
            />
            {/* Shortcuts mean nothing on a touch screen. */}
            <KeyboardCard className="hidden lg:block pointer-coarse:hidden" />
          </aside>

          {/*
           * At least a screen tall, so the sections below start off screen and the run growing into
           * its space doesn't push them around (layout shift).
           */}
          <div className="flex min-h-svh min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-2">
            <div className="flex flex-col gap-3">
              <p className="text-[13px] leading-relaxed text-[#8b94a0]">
                <span className="font-medium text-[#e8eaed]">Live demo, no API key.</span> A scripted coding agent adds
                rate limiting to a Next.js route. Every panel is a kit component.
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="border-line bg-raised/60 hidden items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[11px] text-[#a1a9b4] sm:inline-flex">
                  <span className="bg-cyan size-1.5 rounded-full" aria-hidden="true" />
                  {REPO}
                </span>
                <span className="hidden font-mono text-[11px] text-[#8b94a0] sm:inline">main · next@16 · ai@7</span>
                <div className="max-w-full min-w-0 sm:ml-auto lg:hidden">
                  <RunMeter
                    {...meter}
                    durationMs={timing.activeMs}
                    live={running}
                    // Narrow phones: a size smaller, so the strip fits without scrolling.
                    className="max-[389px]:text-[11px] max-[359px]:[&>span]:px-1.5"
                  />
                </div>
              </div>
            </div>

            {userMessage && (
              <section aria-label="Your request" className="border-line bg-raised/60 rounded-xl border px-4 py-3.5">
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className="flex size-5 items-center justify-center rounded-full bg-[#262b33] font-mono text-[10px] font-semibold text-[#e8eaed]"
                    aria-hidden="true"
                  >
                    DE
                  </span>
                  <span className="text-[13px] font-medium text-[#a1a9b4]">You</span>
                </div>
                <p className="text-[15px] leading-relaxed text-[#e8eaed]">
                  {userMessage.parts.map((p) => (p.type === 'text' ? p.text : '')).join('')}
                </p>
              </section>
            )}

            {lastAssistant ? (
              <section aria-label="Agent run" className="flex min-w-0 flex-col gap-3">
                <div className="flex items-center gap-2 text-[13px] text-[#a1a9b4]" aria-hidden="true">
                  <AgentGlyph />
                  <span className="font-medium text-[#e8eaed]">Agent</span>
                </div>
                <AgentMessage
                  message={lastAssistant}
                  streaming={running}
                  active={derived.state !== 'done' && derived.state !== 'error'}
                  tools={toolMeta}
                  onToolApproval={addToolApprovalResponse}
                  approvalProps={{ autoFocus: !autopilot }}
                  renderTool={review}
                  sourcesVariant="cards"
                />
              </section>
            ) : (
              userMessage && <SkeletonRun />
            )}

            {done && mode === 'mock' && (
              <div className="border-line bg-raised/40 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-[13px] text-[#a1a9b4]">
                <span className="font-medium text-[#e8eaed]">Run complete</span>
                <span className="font-mono text-xs">
                  {formatDuration(timing.activeMs)} active · {cost !== undefined ? formatCost(cost) : '–'}
                </span>
                <button
                  type="button"
                  onClick={replay}
                  className="border-line hover:bg-raised focus-visible:outline-cyan-soft ml-auto inline-flex h-8 cursor-pointer items-center rounded-lg border px-3 text-[13px] font-medium text-[#e8eaed] transition-colors hover:border-[#353c47] focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  Replay run
                </button>
              </div>
            )}

            {mode === 'live' && (
              <Composer
                disabled={running}
                onSend={(text) => {
                  stickRef.current = true;
                  void sendMessage({ text });
                }}
                onStop={() => void stop()}
                running={running}
              />
            )}
            {chat.error && (
              <p
                role="alert"
                className="border-magenta/40 bg-magenta/10 rounded-lg border px-3 py-2 text-[13px] text-[#f472a8]"
              >
                {chat.error.message}
              </p>
            )}
            <div ref={endRef} className="h-px" />
          </div>
        </div>

        {children}
      </main>

      {mode === 'mock' && (
        <Sheet id="run-controls-sheet" open={sheetOpen} onClose={() => setSheetOpen(false)} title="Run controls">
          {sheetOpen && (
            <>
              <RunControls
                {...controls}
                onReplay={() => {
                  setSheetOpen(false);
                  replay();
                }}
              />
              <RunMeter variant="expanded" {...meter} model={MODEL} className="border-line bg-raised/70" />
            </>
          )}
        </Sheet>
      )}
    </div>
  );
}

function ReviewStep({ files, onSubmit }: { files: FileChange[]; onSubmit: (result: DiffReviewResult) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Put the reviewer on the first hunk so J/K/A/R work immediately.
    const first = ref.current?.querySelector<HTMLElement>('[data-slot="diff-hunk"]');
    first?.focus({ preventScroll: true });
  }, []);
  return (
    <div ref={ref}>
      <DiffReview files={files} onSubmit={onSubmit} title="Review proposed changes" />
    </div>
  );
}

function AppliedChanges({ files, output }: { files: FileChange[]; output: ReviewOutput }) {
  const decisions = decisionsFrom(output);
  const parsed = files.map((f) => parseFileChange(f));
  return (
    <div className="border-line bg-raised/60 rounded-xl border">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <svg
          viewBox="0 0 24 24"
          className="text-cyan-soft size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12.5 9.5 17 19 7.5" />
        </svg>
        <span className="text-[13px] font-semibold text-[#e8eaed]">
          Applied {output.accepted} of {output.accepted + output.rejected} hunks
        </span>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-[#a1a9b4]" aria-label="Files">
          {parsed.map((file) => (
            <li key={file.id} className="flex items-center gap-2">
              {file.path}
              <span
                className="flex gap-0.5"
                role="img"
                aria-label={file.hunks.map((h) => decisions[h.id] ?? 'pending').join(', ')}
              >
                {file.hunks.map((h) => (
                  <span
                    key={h.id}
                    className={`size-1.5 rounded-full ${decisions[h.id] === 'accepted' ? 'bg-cyan' : decisions[h.id] === 'rejected' ? 'bg-magenta' : 'bg-[#353c47]'}`}
                  />
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <details className="group border-line border-t">
        <summary className="focus-visible:outline-cyan-soft cursor-pointer list-none rounded-b-xl px-4 py-2 text-xs text-[#a1a9b4] hover:text-[#e8eaed] focus-visible:outline-2 focus-visible:outline-offset-[-2px] [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">Show reviewed diff</span>
          <span className="hidden group-open:inline">Hide reviewed diff</span>
        </summary>
        <div className="px-3 pb-3">
          <DiffReview files={files} readOnly defaultDecisions={decisions} title="Reviewed changes" />
        </div>
      </details>
    </div>
  );
}

function PreparingChanges() {
  return (
    <div
      className="border-line bg-raised/60 flex items-center gap-3 rounded-xl border px-4 py-3.5 text-[13px] text-[#a1a9b4]"
      role="status"
    >
      <span className="relative h-1 w-24 overflow-hidden rounded-full bg-[#1e232a]" aria-hidden="true">
        <span className="bg-cyan motion-safe:animate-aui-indeterminate absolute inset-y-0 w-1/3 rounded-full" />
      </span>
      Preparing changes…
    </div>
  );
}

function SkeletonRun() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <div className="bg-raised h-4 w-40 rounded motion-safe:animate-pulse" />
      <div className="bg-raised h-4 w-3/4 rounded motion-safe:animate-pulse" />
    </div>
  );
}

function AgentGlyph() {
  return (
    <span className="from-cyan/30 to-cyan/5 ring-cyan/40 flex size-5 items-center justify-center rounded-md bg-gradient-to-br ring-1">
      <svg viewBox="0 0 24 24" className="text-cyan-soft size-3" fill="currentColor" aria-hidden="true">
        <path d="M12 3c.6 4.4 2.6 6.9 7.5 8.5-4.9 1.6-6.9 4.1-7.5 8.5-.6-4.4-2.6-6.9-7.5-8.5C9.4 9.9 11.4 7.4 12 3Z" />
      </svg>
    </span>
  );
}
