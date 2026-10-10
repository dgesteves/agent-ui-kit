'use client';

import * as Collapsible from '@radix-ui/react-collapsible';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  getToolPartName,
  getToolPhase,
  isAutomaticApproval,
  isInterruptibleToolPart,
  isSettledPhase,
  isToolPart,
  type AnyUIPart,
  type ToolPart,
  type ToolPhase,
} from './lib/ai';
import { humanizeToolName, summarizeValue } from './lib/format';
import { toolCallTimelineLabels, formatLabels, type RiskLevel, type SignoffLabelsInput } from './lib/labels';
import { useLabels, WithLabels } from './labels';
import { useActivityWindow, useHydrated, useNow, useToolTimings, type ToolTiming, type ToolTimings } from './lib/hooks';
import { BanIcon, CheckIcon, ChevronIcon, SpinnerIcon, XIcon } from './lib/icons';
import { JsonView, LiveRegion } from './lib/primitives';
import { cn } from './lib/utils';

/** The labels' sections this module reads. */
const LABELS = { toolCallTimeline: toolCallTimelineLabels, format: formatLabels };

export type { RiskLevel };

/** Per-tool presentation. Every field is optional. */
export interface ToolMeta {
  /** Display label. Defaults to the humanized tool name. */
  label?: string;
  icon?: ReactNode;
  /**
   * One-line summary shown next to the label. Defaults to the most descriptive input field.
   * Not called before any input has arrived; while the input streams it can be partial.
   */
  summary?: (input: unknown, part: ToolPart) => ReactNode;
  /** Replace the default JSON output view. Your content, like `AgentMessage`'s `renderTool`. */
  renderOutput?: (output: unknown, part: ToolPart) => ReactNode;
  /** Risk shown on approval requests for this tool. */
  risk?: RiskLevel | ((input: unknown) => RiskLevel);
}

export interface ToolCallTimelineProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  /** Tool parts, or every part of a message: non-tool parts are ignored. */
  parts: readonly AnyUIPart[];
  tools?: Record<string, ToolMeta> | undefined;
  /** Externally measured timings by `toolCallId`. Measured client-side when omitted. */
  timings?: ToolTimings | undefined;
  /** Controlled set of expanded `toolCallId`s. */
  expanded?: readonly string[] | undefined;
  defaultExpanded?: readonly string[] | undefined;
  onExpandedChange?: ((expanded: string[]) => void) | undefined;
  /**
   * Expand calls automatically when they fail. Default `false`: the error
   * message is always shown inline under a failed call, with details on demand.
   */
  expandErrors?: boolean;
  /** Show a per-call waterfall bar relative to the whole timeline. Default `true`. */
  waterfall?: boolean;
  /**
   * Announce completions and failures to screen readers. Default `true`. Calls that settle within
   * moments of each other, such as parallel calls, are announced together.
   */
  announce?: boolean;
  /** Extra content under a call, e.g. an approval card. Your content, like `renderOutput`'s. */
  renderExtra?: ((part: ToolPart) => ReactNode) | undefined;
  /** Accessible name for the list. Default "Tool calls" (`labels.toolCallTimeline.list`). */
  label?: string;
  /**
   * Whether the run can still make progress. Default `true`. Pass `false` once it has ended
   * (stopped, failed, or restored from history): calls still streaming their input or running
   * then read "Stopped" and their clocks stop, instead of counting up forever.
   */
  active?: boolean;
  /** Words to use instead of the English defaults: see `SignoffLabelsProvider`. */
  labels?: SignoffLabelsInput | undefined;
}

const PHASE_TEXT: Record<ToolPhase, string> = {
  streaming: 'text-signoff-fg-muted',
  running: 'text-signoff-accent-fg',
  'awaiting-approval': 'text-signoff-hot-fg',
  success: 'text-signoff-fg-subtle',
  error: 'text-signoff-hot-fg',
  denied: 'text-signoff-fg-subtle',
};

function StatusNode({ phase, interrupted }: { phase: ToolPhase; interrupted: boolean }) {
  const base = 'relative z-10 flex size-6 items-center justify-center rounded-full border';
  if (interrupted) {
    return (
      <span className={cn(base, 'border-signoff-border-strong bg-signoff-surface-2')}>
        <span className="bg-signoff-fg-subtle size-2 rounded-[2px]" />
      </span>
    );
  }
  switch (phase) {
    case 'streaming':
      return (
        <span className={cn(base, 'border-signoff-accent/60 bg-signoff-bg border-dashed')}>
          <span className="bg-signoff-accent size-1.5 rounded-full motion-safe:animate-pulse" />
        </span>
      );
    case 'running':
      return (
        <span className={cn(base, 'border-signoff-accent/40 bg-signoff-bg text-signoff-accent')}>
          <SpinnerIcon size={14} className="motion-safe:animate-signoff-spin" />
        </span>
      );
    case 'awaiting-approval':
      return (
        <span className={cn(base, 'border-signoff-hot/60 bg-signoff-bg')}>
          <span className="border-signoff-hot motion-safe:animate-signoff-ping absolute inset-0 rounded-full border" />
          <span className="font-signoff-mono text-signoff-hot-fg text-[11px] leading-none font-bold">!</span>
        </span>
      );
    case 'success':
      return (
        <span className={cn(base, 'border-signoff-accent/35 bg-signoff-accent/15 text-signoff-accent-fg')}>
          <CheckIcon size={13} strokeWidth={2.5} />
        </span>
      );
    case 'error':
      return (
        <span className={cn(base, 'border-signoff-hot/45 bg-signoff-hot/15 text-signoff-hot-fg')}>
          <XIcon size={12} strokeWidth={2.5} />
        </span>
      );
    case 'denied':
      return (
        <span className={cn(base, 'border-signoff-border-strong bg-signoff-surface-2 text-signoff-fg-subtle')}>
          <BanIcon size={12} />
        </span>
      );
  }
}

function getDuration(t: ToolTiming | undefined, now: number): number | undefined {
  if (!t?.startedAt) return undefined;
  const from = t.runningAt ?? t.startedAt;
  return Math.max(0, (t.endedAt ?? now) - from);
}

/** Calls that settle within this window are announced together, once it has passed. */
const ANNOUNCE_DELAY_MS = 300;

/** When the last of these calls settled, or -Infinity. */
function lastEnd(parts: readonly ToolPart[], timings: ToolTimings): number {
  let last = -Infinity;
  for (const part of parts) last = Math.max(last, timings[part.toolCallId]?.endedAt ?? -Infinity);
  return last;
}

/**
 * A vertical timeline of tool calls with live states, durations, a waterfall,
 * and expandable input/output. Follows the WAI-ARIA disclosure pattern; Arrow
 * Up/Down, Home and End move between calls.
 */
export function ToolCallTimeline({
  parts,
  tools,
  timings: timingsProp,
  expanded: expandedProp,
  defaultExpanded,
  onExpandedChange,
  expandErrors = false,
  waterfall = true,
  announce = true,
  renderExtra,
  label,
  active = true,
  labels,
  className,
  ...props
}: ToolCallTimelineProps) {
  const L = useLabels(LABELS, labels);
  const T = L.toolCallTimeline;
  const toolParts = useMemo(() => parts.filter(isToolPart), [parts]);
  const measured = useToolTimings(toolParts);
  const timings = timingsProp ?? measured;
  const anyActive =
    active && toolParts.some((p) => !isSettledPhase(getToolPhase(p)) && getToolPhase(p) !== 'awaiting-approval');
  const now = useNow(anyActive, 100);
  const hydrated = useHydrated();
  // Unsettled calls freeze when the run stops; restored history (never active here) has no end time.
  const stoppedAt = useActivityWindow(active).endedAt;
  const clock = active ? now : stoppedAt;

  const [uncontrolled, setUncontrolled] = useState<readonly string[]>(defaultExpanded ?? []);
  const userExpanded = expandedProp ?? uncontrolled;
  // Failed calls open automatically unless the user explicitly collapsed them.
  const [collapsedErrors, setCollapsedErrors] = useState<ReadonlySet<string>>(() => new Set());
  const isOpen = useCallback(
    (part: ToolPart) =>
      userExpanded.includes(part.toolCallId) ||
      (expandErrors && part.state === 'output-error' && !collapsedErrors.has(part.toolCallId)),
    [userExpanded, expandErrors, collapsedErrors],
  );
  const setOpen = (part: ToolPart, open: boolean) => {
    const id = part.toolCallId;
    if (!open && part.state === 'output-error') setCollapsedErrors((s) => new Set(s).add(id));
    const next = open ? [...userExpanded.filter((x) => x !== id), id] : userExpanded.filter((x) => x !== id);
    if (expandedProp === undefined) setUncontrolled(next);
    onExpandedChange?.(next);
  };

  // Waterfall bounds span every call that has timing information.
  const bounds = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const part of toolParts) {
      const t = timings[part.toolCallId];
      const end = t?.endedAt ?? clock;
      if (!t?.startedAt || end === undefined) continue;
      min = Math.min(min, t.startedAt);
      max = Math.max(max, end);
    }
    return Number.isFinite(min) && max > min ? { min, span: max - min } : undefined;
  }, [toolParts, timings, clock]);

  // Calls that settled since the last announcement, in the order they settled. Calls settled before
  // the timeline mounted (restored history) are never announced.
  const [announced, setAnnounced] = useState(() => ({ text: '', through: lastEnd(toolParts, timings) }));
  const announcedThrough = announced.through;
  const pending = useMemo(() => {
    const settled: Array<{ part: ToolPart; at: number }> = [];
    for (const part of toolParts) {
      const at = timings[part.toolCallId]?.endedAt;
      if (at !== undefined && at > announcedThrough) settled.push({ part, at });
    }
    settled.sort((a, b) => a.at - b.at);
    const sentences = settled.map(({ part, at }) => {
      const name = tools?.[getToolPartName(part)]?.label ?? humanizeToolName(getToolPartName(part));
      const phase = getToolPhase(part);
      if (phase === 'error') return T.failed(name, part.errorText);
      if (phase === 'denied') return isAutomaticApproval(part.approval) ? T.blockedByPolicy(name) : T.denied(name);
      return T.finished(name, L.format.durationLong(getDuration(timings[part.toolCallId], at)));
    });
    const text =
      sentences.length > 1 ? sentences.map((s) => (/[.!?]$/.test(s) ? s : `${s}.`)).join(' ') : (sentences[0] ?? '');
    return { text, through: settled.at(-1)?.at ?? announcedThrough };
  }, [toolParts, timings, tools, announcedThrough, T, L.format]);
  // Wait a moment, so that calls finishing together (parallel calls) are read out as one.
  const { text: pendingText, through: pendingThrough } = pending;
  useEffect(() => {
    if (!pendingText) return;
    const id = setTimeout(() => setAnnounced({ text: pendingText, through: pendingThrough }), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(id);
  }, [pendingText, pendingThrough]);

  const listRef = useRef<HTMLOListElement>(null);
  const onKeyDown = (event: KeyboardEvent<HTMLOListElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const triggers = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>('[data-slot="signoff-tool-call-trigger"]') ?? [],
    );
    const index = triggers.indexOf(document.activeElement as HTMLButtonElement);
    if (index === -1) return;
    event.preventDefault();
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? triggers.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + triggers.length) % triggers.length;
    triggers[nextIndex]?.focus();
  };

  if (toolParts.length === 0) return null;

  return (
    <WithLabels labels={labels}>
      <div
        data-signoff
        data-slot="signoff-tool-call-timeline"
        className={cn('font-signoff-sans text-signoff-fg @container', className)}
        {...props}
      >
        {/* Arrow-key navigation between the disclosure buttons, as in the WAI-ARIA accordion pattern. */}
        <ol ref={listRef} aria-label={label ?? T.list} onKeyDown={onKeyDown} className="relative flex flex-col">
          {toolParts.map((part, index) => (
            <TimelineItem
              key={part.toolCallId}
              part={part}
              meta={tools?.[getToolPartName(part)]}
              timing={timings[part.toolCallId]}
              clock={clock}
              interrupted={!active && isInterruptibleToolPart(part)}
              bounds={waterfall && hydrated ? bounds : undefined}
              hydrated={hydrated}
              isLast={index === toolParts.length - 1}
              open={isOpen(part)}
              onOpenChange={(open) => setOpen(part, open)}
              extra={renderExtra?.(part)}
            />
          ))}
        </ol>
        {announce && <LiveRegion>{announced.text}</LiveRegion>}
      </div>
    </WithLabels>
  );
}

interface TimelineItemProps {
  part: ToolPart;
  meta: ToolMeta | undefined;
  timing: ToolTiming | undefined;
  /** Current time while the run is active, when it stopped once inactive (undefined if unknown). */
  clock: number | undefined;
  /** The run ended while this call was still preparing or running. */
  interrupted: boolean;
  bounds: { min: number; span: number } | undefined;
  isLast: boolean;
  hydrated: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extra: ReactNode;
}

function TimelineItem({
  part,
  meta,
  timing,
  clock,
  interrupted,
  bounds,
  isLast,
  hydrated,
  open,
  onOpenChange,
  extra,
}: TimelineItemProps) {
  const L = useLabels(LABELS);
  const name = getToolPartName(part);
  const phase = getToolPhase(part);
  const label = meta?.label ?? part.title ?? humanizeToolName(name);
  // The SDK sets `input: undefined` until the first input delta arrives.
  const summary =
    part.input === undefined ? undefined : meta?.summary ? meta.summary(part.input, part) : summarizeValue(part.input);
  const settled = isSettledPhase(phase) || interrupted;
  // Live durations depend on the clock: render them only after hydration.
  const end = timing?.endedAt ?? clock;
  const duration = (settled || hydrated) && end !== undefined ? getDuration(timing, end) : undefined;

  let bar: { left: number; width: number } | undefined;
  if (bounds && timing?.startedAt && end !== undefined) {
    const left = ((timing.startedAt - bounds.min) / bounds.span) * 100;
    bar = { left, width: Math.max(2, ((end - timing.startedAt) / bounds.span) * 100) };
  }

  return (
    <li
      data-slot="signoff-tool-call"
      data-phase={phase}
      data-state={part.state}
      data-interrupted={interrupted || undefined}
      className="group/item motion-safe:animate-signoff-enter relative grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3"
    >
      {!isLast && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-7 bottom-0 left-[11.5px] w-px',
            settled ? 'bg-signoff-border-strong' : 'from-signoff-accent/50 to-signoff-border bg-gradient-to-b',
          )}
        />
      )}
      {/* Decorative: the trigger spells out the state ("Needs approval"), so the node's "!" is not read. */}
      <div aria-hidden="true" className="pt-1.5">
        <StatusNode phase={phase} interrupted={interrupted} />
      </div>
      <Collapsible.Root open={open} onOpenChange={onOpenChange} className={cn('min-w-0', isLast ? 'pb-0' : 'pb-2')}>
        <Collapsible.Trigger
          data-slot="signoff-tool-call-trigger"
          className="group/trigger hover:bg-signoff-surface-2/70 focus-visible:outline-signoff-ring flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-0"
        >
          {meta?.icon && (
            <span aria-hidden="true" className="text-signoff-fg-subtle flex shrink-0 [&_svg]:size-3.5">
              {meta.icon}
            </span>
          )}
          {/* Truncates rather than pushing the row past a narrow container; the full name stays in the button's. */}
          <span className="text-signoff-fg min-w-0 truncate text-[13px] font-medium">{label}</span>
          {summary !== undefined && summary !== null && summary !== '' && (
            // In narrow containers the summary is visually hidden but stays in the button's accessible name.
            <span className="font-signoff-mono text-signoff-fg-muted sr-only min-w-0 text-xs @md:not-sr-only @md:truncate">
              {summary}
            </span>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-2.5 pl-2">
            <span
              className={cn(
                'text-xs font-medium',
                interrupted ? 'text-signoff-fg-subtle' : PHASE_TEXT[phase],
                phase === 'success' && 'sr-only',
              )}
            >
              {interrupted ? L.toolCallTimeline.stopped : L.toolCallTimeline.phases[phase]}
            </span>
            {bar && (
              <span
                aria-hidden="true"
                className="bg-signoff-surface-2 relative hidden h-1 w-16 overflow-hidden rounded-full @sm:block"
              >
                <span
                  className={cn(
                    'absolute inset-y-0 rounded-full',
                    phase === 'error' || phase === 'awaiting-approval'
                      ? 'bg-signoff-hot'
                      : settled
                        ? 'bg-signoff-fg-subtle/70'
                        : 'bg-signoff-accent',
                  )}
                  style={{ left: `${bar.left}%`, width: `${Math.min(bar.width, 100 - bar.left)}%` }}
                />
              </span>
            )}
            <span className="font-signoff-mono text-signoff-fg-subtle w-12 text-right text-[11px] tabular-nums">
              {duration !== undefined && phase !== 'awaiting-approval' ? L.format.duration(duration) : ''}
            </span>
            <ChevronIcon
              size={14}
              className="text-signoff-fg-subtle transition-transform duration-200 group-data-[state=open]/trigger:rotate-90 motion-reduce:transition-none"
            />
          </span>
        </Collapsible.Trigger>
        {part.state === 'output-error' && !open && (
          <p className="font-signoff-mono text-signoff-hot-fg mt-0.5 mb-1 line-clamp-2 px-2 text-xs leading-5 break-words">
            {part.errorText}
          </p>
        )}
        <Collapsible.Content className="data-[state=closed]:motion-safe:animate-signoff-collapse data-[state=open]:motion-safe:animate-signoff-expand overflow-hidden">
          <ToolCallDetails part={part} meta={meta} />
        </Collapsible.Content>
        {extra && (
          <div className="mt-2 mb-1 pl-2" data-signoff-slot>
            {extra}
          </div>
        )}
      </Collapsible.Root>
    </li>
  );
}

/** The expanded body of a tool call: input, output or error, and approval outcome. */
export function ToolCallDetails({
  part,
  meta,
  labels,
}: {
  part: ToolPart;
  meta?: ToolMeta | undefined;
  /** Words to use instead of the English defaults: see `SignoffLabelsProvider`. */
  labels?: SignoffLabelsInput | undefined;
}) {
  const T = useLabels(LABELS, labels).toolCallTimeline;
  const hasInput = part.input !== undefined;
  const sectionLabel =
    'mb-1.5 font-signoff-mono text-[10.5px] font-medium tracking-[0.08em] text-signoff-fg-subtle uppercase';
  return (
    <div data-signoff data-slot="signoff-tool-call-details" className="flex flex-col gap-3 px-2 pt-1.5 pb-3">
      {hasInput && (
        <div>
          <div className={sectionLabel}>{part.state === 'input-streaming' ? T.inputStreaming : T.input}</div>
          <JsonView value={part.input} label={T.input} />
        </div>
      )}
      {part.state === 'output-available' && (
        <div>
          <div className={sectionLabel}>{part.preliminary ? T.outputPartial : T.output}</div>
          {meta?.renderOutput ? (
            <div data-signoff-slot>{meta.renderOutput(part.output, part)}</div>
          ) : (
            <JsonView value={part.output} label={T.output} />
          )}
        </div>
      )}
      {part.state === 'output-error' && (
        <div>
          <div className={sectionLabel}>{T.error}</div>
          <p className="border-signoff-hot/35 bg-signoff-hot/[0.07] font-signoff-mono text-signoff-fg rounded-lg border px-3 py-2 text-xs leading-5 break-words whitespace-pre-wrap">
            {part.errorText}
          </p>
        </div>
      )}
      {(part.state === 'output-denied' || (part.state === 'approval-responded' && !part.approval.approved)) && (
        <p className="text-signoff-fg-muted text-xs">
          {T.deniedBy(isAutomaticApproval(part.approval))}
          {part.approval.reason ? (
            <>
              : <span className="text-signoff-fg">{part.approval.reason}</span>
            </>
          ) : (
            '.'
          )}
        </p>
      )}
      {!hasInput && part.state === 'input-streaming' && (
        <p className="text-signoff-fg-subtle text-xs">{T.waitingForInput}</p>
      )}
    </div>
  );
}
