'use client';

import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import type { AgentState } from './lib/ai';
import { agentStatusLabels, formatLabels, type SignoffLabelsInput } from './lib/labels';
import { useLabels } from './labels';
import { useHydrated, useNow } from './lib/hooks';
import { AlertIcon, CheckIcon, SparkIcon, SpinnerIcon } from './lib/icons';
import { LiveRegion, useDebouncedValue } from './lib/primitives';
import { cn } from './lib/utils';

/** The labels' sections this module reads. */
const LABELS = { agentStatus: agentStatusLabels, format: formatLabels };

export type { AgentState };

export interface AgentStatusProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  state: AgentState;
  /** Overrides the state's name (`labels.agentStatus.states`). */
  label?: string | undefined;
  /** Secondary detail, e.g. the tool being run. */
  detail?: string | undefined;
  /** Epoch ms when the run started. Shows a live elapsed timer while active. */
  startedAt?: number | undefined;
  /** Fixed elapsed time to show (e.g. the final run duration). Takes precedence over `startedAt`. */
  elapsedMs?: number | undefined;
  /** Announce state changes to assistive tech. Default `true`. */
  announce?: boolean;
  size?: 'sm' | 'md';
  /** Words to use instead of the English defaults: see `SignoffLabelsProvider`. */
  labels?: SignoffLabelsInput | undefined;
}

const ACTIVE: AgentState[] = ['thinking', 'working'];

function Indicator({ state }: { state: AgentState }) {
  switch (state) {
    case 'thinking':
      return <SparkIcon size={14} className="text-signoff-accent motion-safe:animate-pulse" />;
    case 'working':
      return <SpinnerIcon size={14} className="text-signoff-accent motion-safe:animate-signoff-spin" />;
    case 'awaiting-approval':
      return (
        <span className="relative flex size-3.5 items-center justify-center">
          <span className="bg-signoff-hot motion-safe:animate-signoff-ping absolute inline-flex size-2 rounded-full" />
          <span className="bg-signoff-hot relative inline-flex size-2 rounded-full" />
        </span>
      );
    case 'done':
      return <CheckIcon size={14} className="text-signoff-accent-fg" />;
    case 'stopped':
      return (
        <span className="flex size-3.5 items-center justify-center">
          <span className="bg-signoff-fg-muted size-2 rounded-[2px]" />
        </span>
      );
    case 'error':
      return <AlertIcon size={14} className="text-signoff-hot-fg" />;
    default:
      return (
        <span className="flex size-3.5 items-center justify-center">
          <span className="bg-signoff-fg-subtle size-2 rounded-full" />
        </span>
      );
  }
}

/**
 * A compact, live status pill for an agent run. State changes are announced
 * through a polite live region (assertive for errors and approval requests),
 * debounced so rapid transitions do not flood screen readers.
 */
export function AgentStatus({
  state,
  label,
  detail,
  startedAt,
  elapsedMs,
  announce = true,
  size = 'md',
  labels,
  className,
  ...props
}: AgentStatusProps) {
  const L = useLabels(LABELS, labels);
  const active = ACTIVE.includes(state);
  const now = useNow(active && startedAt !== undefined && elapsedMs === undefined, 100);
  const hydrated = useHydrated();
  const elapsed = elapsedMs ?? (startedAt !== undefined && hydrated ? Math.max(0, now - startedAt) : undefined);
  const text = label ?? L.agentStatus.states[state];
  const spoken = L.agentStatus.spoken(text, detail);
  const urgent = state === 'error' || state === 'awaiting-approval';
  const debounced = useDebouncedValue(spoken, 350);
  const debouncedUrgent = useDebouncedValue(urgent, 350);

  return (
    <div
      data-signoff
      data-slot="signoff-agent-status"
      data-state={state}
      className={cn(
        'font-signoff-sans inline-flex w-fit max-w-full items-center gap-2 rounded-full border font-medium whitespace-nowrap transition-colors',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
        state === 'awaiting-approval' || state === 'error'
          ? 'border-signoff-hot/40 bg-signoff-hot/10 text-signoff-fg'
          : active
            ? 'border-signoff-accent/30 bg-signoff-accent/[0.07] text-signoff-fg'
            : 'border-signoff-border bg-signoff-surface text-signoff-fg-muted',
        className,
      )}
      {...props}
    >
      <Indicator state={state} />
      <span
        className={cn(
          state === 'thinking' &&
            'motion-safe:animate-signoff-shimmer motion-safe:bg-[linear-gradient(90deg,var(--signoff-fg)_0%,var(--signoff-fg)_40%,var(--signoff-accent-fg)_50%,var(--signoff-fg)_60%,var(--signoff-fg)_100%)] motion-safe:bg-[length:200%_100%] motion-safe:bg-clip-text motion-safe:text-transparent',
        )}
      >
        {text}
      </span>
      {detail && (
        <span className="font-signoff-mono text-signoff-fg-muted min-w-0 truncate text-[0.92em] font-normal">
          {detail}
        </span>
      )}
      {elapsed !== undefined && state !== 'idle' && (
        <span className="font-signoff-mono text-signoff-fg-subtle text-[0.92em] font-normal tabular-nums">
          {L.format.duration(elapsed)}
        </span>
      )}
      {announce && (
        <>
          <LiveRegion>{debouncedUrgent ? '' : debounced}</LiveRegion>
          <LiveRegion politeness="assertive">{debouncedUrgent ? debounced : ''}</LiveRegion>
        </>
      )}
    </div>
  );
}

export function AgentStatusDot({ state, className }: { state: AgentState; className?: string }): ReactNode {
  return (
    <span data-signoff className={cn('inline-flex', className)} aria-hidden="true">
      <Indicator state={state} />
    </span>
  );
}
