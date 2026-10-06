import { Collapsible } from 'radix-ui';
import {
  useCallback,
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
  isSettledPhase,
  isToolPart,
  TOOL_PHASE_LABEL,
  type AnyUIPart,
  type ToolPart,
  type ToolPhase,
} from './lib/ai';
import { formatDuration, formatDurationLong, humanizeToolName, summarizeValue } from './lib/format';
import { useHydrated, useNow, useToolTimings, type ToolTiming, type ToolTimings } from './lib/hooks';
import { BanIcon, CheckIcon, ChevronIcon, SpinnerIcon, XIcon } from './lib/icons';
import { JsonView, LiveRegion } from './lib/primitives';
import { cn } from './lib/utils';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** Per-tool presentation. Every field is optional. */
export interface ToolMeta {
  /** Display label. Defaults to the humanized tool name. */
  label?: string;
  icon?: ReactNode;
  /** One-line summary shown next to the label. Defaults to the most descriptive input field. */
  summary?: (input: unknown, part: ToolPart) => ReactNode;
  /** Replace the default JSON output view. */
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
  /** Announce completions and failures to screen readers. Default `true`. */
  announce?: boolean;
  /** Extra content under a call, e.g. an approval card. */
  renderExtra?: ((part: ToolPart) => ReactNode) | undefined;
  /** Accessible name for the list. Default "Tool calls". */
  label?: string;
}

const PHASE_TEXT: Record<ToolPhase, string> = {
  streaming: 'text-aui-fg-muted',
  running: 'text-aui-accent-fg',
  'awaiting-approval': 'text-aui-hot-fg',
  success: 'text-aui-fg-subtle',
  error: 'text-aui-hot-fg',
  denied: 'text-aui-fg-subtle',
};

function StatusNode({ phase }: { phase: ToolPhase }) {
  const base = 'relative z-10 flex size-6 items-center justify-center rounded-full border';
  switch (phase) {
    case 'streaming':
      return (
        <span className={cn(base, 'border-aui-accent/60 bg-aui-bg border-dashed')}>
          <span className="bg-aui-accent size-1.5 rounded-full motion-safe:animate-pulse" />
        </span>
      );
    case 'running':
      return (
        <span className={cn(base, 'border-aui-accent/40 bg-aui-bg text-aui-accent')}>
          <SpinnerIcon size={14} className="motion-safe:animate-aui-spin" />
        </span>
      );
    case 'awaiting-approval':
      return (
        <span className={cn(base, 'border-aui-hot/60 bg-aui-bg')}>
          <span className="border-aui-hot motion-safe:animate-aui-ping absolute inset-0 rounded-full border" />
          <span className="font-aui-mono text-aui-hot-fg text-[11px] leading-none font-bold">!</span>
        </span>
      );
    case 'success':
      return (
        <span className={cn(base, 'border-aui-accent/35 bg-aui-accent/15 text-aui-accent-fg')}>
          <CheckIcon size={13} strokeWidth={2.5} />
        </span>
      );
    case 'error':
      return (
        <span className={cn(base, 'border-aui-hot/45 bg-aui-hot/15 text-aui-hot-fg')}>
          <XIcon size={12} strokeWidth={2.5} />
        </span>
      );
    case 'denied':
      return (
        <span className={cn(base, 'border-aui-border-strong bg-aui-surface-2 text-aui-fg-subtle')}>
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
  label = 'Tool calls',
  className,
  ...props
}: ToolCallTimelineProps) {
  const toolParts = useMemo(() => parts.filter(isToolPart), [parts]);
  const measured = useToolTimings(toolParts);
  const timings = timingsProp ?? measured;
  const anyActive = toolParts.some((p) => !isSettledPhase(getToolPhase(p)) && getToolPhase(p) !== 'awaiting-approval');
  const now = useNow(anyActive, 100);
  const hydrated = useHydrated();

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
      if (!t?.startedAt) continue;
      min = Math.min(min, t.startedAt);
      max = Math.max(max, t.endedAt ?? now);
    }
    return Number.isFinite(min) && max > min ? { min, span: max - min } : undefined;
  }, [toolParts, timings, now]);

  // The most recently settled call drives the live announcement.
  const announcement = useMemo(() => {
    let latest: { part: ToolPart; at: number } | undefined;
    for (const part of toolParts) {
      const at = timings[part.toolCallId]?.endedAt;
      if (at !== undefined && (!latest || at >= latest.at)) latest = { part, at };
    }
    if (!latest) return '';
    const { part } = latest;
    const name = tools?.[getToolPartName(part)]?.label ?? humanizeToolName(getToolPartName(part));
    const phase = getToolPhase(part);
    if (phase === 'error') return `${name} failed: ${part.errorText ?? 'unknown error'}`;
    if (phase === 'denied') return `${name} was denied`;
    return `${name} finished in ${formatDurationLong(getDuration(timings[part.toolCallId], latest.at))}`;
  }, [toolParts, timings, tools]);

  const listRef = useRef<HTMLOListElement>(null);
  const onKeyDown = (event: KeyboardEvent<HTMLOListElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const triggers = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>('[data-slot="tool-call-trigger"]') ?? [],
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
    <div data-aui data-slot="tool-call-timeline" className={cn('font-aui-sans text-aui-fg', className)} {...props}>
      {/* Arrow-key navigation between the disclosure buttons, as in the WAI-ARIA accordion pattern. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <ol ref={listRef} aria-label={label} onKeyDown={onKeyDown} className="relative flex flex-col">
        {toolParts.map((part, index) => (
          <TimelineItem
            key={part.toolCallId}
            part={part}
            meta={tools?.[getToolPartName(part)]}
            timing={timings[part.toolCallId]}
            now={now}
            bounds={waterfall && hydrated ? bounds : undefined}
            hydrated={hydrated}
            isLast={index === toolParts.length - 1}
            open={isOpen(part)}
            onOpenChange={(open) => setOpen(part, open)}
            extra={renderExtra?.(part)}
          />
        ))}
      </ol>
      {announce && <LiveRegion>{announcement}</LiveRegion>}
    </div>
  );
}

interface TimelineItemProps {
  part: ToolPart;
  meta: ToolMeta | undefined;
  timing: ToolTiming | undefined;
  now: number;
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
  now,
  bounds,
  isLast,
  hydrated,
  open,
  onOpenChange,
  extra,
}: TimelineItemProps) {
  const name = getToolPartName(part);
  const phase = getToolPhase(part);
  const label = meta?.label ?? part.title ?? humanizeToolName(name);
  const summary = meta?.summary ? meta.summary(part.input, part) : summarizeValue(part.input);
  const settled = isSettledPhase(phase);
  // Live durations depend on the clock: render them only after hydration.
  const duration = settled || hydrated ? getDuration(timing, now) : undefined;

  let bar: { left: number; width: number } | undefined;
  if (bounds && timing?.startedAt) {
    const left = ((timing.startedAt - bounds.min) / bounds.span) * 100;
    const end = timing.endedAt ?? now;
    bar = { left, width: Math.max(2, ((end - timing.startedAt) / bounds.span) * 100) };
  }

  return (
    <li
      data-slot="tool-call"
      data-phase={phase}
      data-state={part.state}
      className="group/item motion-safe:animate-aui-enter relative grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3"
    >
      {!isLast && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-7 bottom-0 left-[11.5px] w-px',
            settled ? 'bg-aui-border-strong' : 'from-aui-accent/50 to-aui-border bg-gradient-to-b',
          )}
        />
      )}
      <div className="pt-1.5">
        <StatusNode phase={phase} />
      </div>
      <Collapsible.Root open={open} onOpenChange={onOpenChange} className={cn('min-w-0', isLast ? 'pb-0' : 'pb-2')}>
        <Collapsible.Trigger
          data-slot="tool-call-trigger"
          className="group/trigger hover:bg-aui-surface-2/70 focus-visible:outline-aui-ring flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-0"
        >
          {meta?.icon && (
            <span aria-hidden="true" className="text-aui-fg-subtle flex shrink-0 [&_svg]:size-3.5">
              {meta.icon}
            </span>
          )}
          <span className="text-aui-fg shrink-0 text-[13px] font-medium">{label}</span>
          {summary !== undefined && summary !== null && summary !== '' && (
            <span className="font-aui-mono text-aui-fg-muted min-w-0 truncate text-xs">{summary}</span>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-2.5 pl-2">
            <span className={cn('text-xs font-medium', PHASE_TEXT[phase], phase === 'success' && 'sr-only')}>
              {TOOL_PHASE_LABEL[phase]}
            </span>
            {bar && (
              <span
                aria-hidden="true"
                className="bg-aui-surface-2 relative hidden h-1 w-16 overflow-hidden rounded-full sm:block"
              >
                <span
                  className={cn(
                    'absolute inset-y-0 rounded-full',
                    phase === 'error' || phase === 'awaiting-approval'
                      ? 'bg-aui-hot'
                      : settled
                        ? 'bg-aui-fg-subtle/70'
                        : 'bg-aui-accent',
                  )}
                  style={{ left: `${bar.left}%`, width: `${Math.min(bar.width, 100 - bar.left)}%` }}
                />
              </span>
            )}
            <span className="font-aui-mono text-aui-fg-subtle w-12 text-right text-[11px] tabular-nums">
              {duration !== undefined && phase !== 'awaiting-approval' ? formatDuration(duration) : ''}
            </span>
            <ChevronIcon
              size={14}
              className="text-aui-fg-subtle transition-transform duration-200 group-data-[state=open]/trigger:rotate-90 motion-reduce:transition-none"
            />
          </span>
        </Collapsible.Trigger>
        {part.state === 'output-error' && !open && (
          <p className="font-aui-mono text-aui-hot-fg mt-0.5 mb-1 line-clamp-2 px-2 text-xs leading-5 break-words">
            {part.errorText}
          </p>
        )}
        <Collapsible.Content className="data-[state=closed]:motion-safe:animate-aui-collapse data-[state=open]:motion-safe:animate-aui-expand overflow-hidden">
          <ToolCallDetails part={part} meta={meta} />
        </Collapsible.Content>
        {extra && <div className="mt-2 mb-1 pl-2">{extra}</div>}
      </Collapsible.Root>
    </li>
  );
}

/** The expanded body of a tool call: input, output or error, and approval outcome. */
export function ToolCallDetails({ part, meta }: { part: ToolPart; meta?: ToolMeta | undefined }) {
  const hasInput = part.input !== undefined;
  const sectionLabel = 'mb-1.5 font-aui-mono text-[10.5px] font-medium tracking-[0.08em] text-aui-fg-subtle uppercase';
  return (
    <div className="flex flex-col gap-3 px-2 pt-1.5 pb-3">
      {hasInput && (
        <div>
          <div className={sectionLabel}>{part.state === 'input-streaming' ? 'Input (streaming)' : 'Input'}</div>
          <JsonView value={part.input} label="Input" />
        </div>
      )}
      {part.state === 'output-available' && (
        <div>
          <div className={sectionLabel}>{part.preliminary ? 'Output (partial)' : 'Output'}</div>
          {meta?.renderOutput ? meta.renderOutput(part.output, part) : <JsonView value={part.output} label="Output" />}
        </div>
      )}
      {part.state === 'output-error' && (
        <div>
          <div className={sectionLabel}>Error</div>
          <p className="border-aui-hot/35 bg-aui-hot/[0.07] font-aui-mono text-aui-fg rounded-lg border px-3 py-2 text-xs leading-5 break-words whitespace-pre-wrap">
            {part.errorText}
          </p>
        </div>
      )}
      {(part.state === 'output-denied' || (part.state === 'approval-responded' && !part.approval.approved)) && (
        <p className="text-aui-fg-muted text-xs">
          Denied by user
          {part.approval.reason ? (
            <>
              : <span className="text-aui-fg">{part.approval.reason}</span>
            </>
          ) : (
            '.'
          )}
        </p>
      )}
      {!hasInput && part.state === 'input-streaming' && (
        <p className="text-aui-fg-subtle text-xs">Waiting for input…</p>
      )}
    </div>
  );
}
