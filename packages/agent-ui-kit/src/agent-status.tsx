'use client';

import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { AGENT_STATE_LABEL, type AgentState } from './lib/ai';
import { formatDuration } from './lib/format';
import { useHydrated, useNow } from './lib/hooks';
import { AlertIcon, CheckIcon, SparkIcon, SpinnerIcon } from './lib/icons';
import { LiveRegion, useDebouncedValue } from './lib/primitives';
import { cn } from './lib/utils';

export type { AgentState };

export interface AgentStatusProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  state: AgentState;
  /** Overrides the default label for the state. */
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
}

const ACTIVE: AgentState[] = ['thinking', 'working'];

function Indicator({ state }: { state: AgentState }) {
  switch (state) {
    case 'thinking':
      return <SparkIcon size={14} className="text-aui-accent motion-safe:animate-pulse" />;
    case 'working':
      return <SpinnerIcon size={14} className="text-aui-accent motion-safe:animate-aui-spin" />;
    case 'awaiting-approval':
      return (
        <span className="relative flex size-3.5 items-center justify-center">
          <span className="bg-aui-hot motion-safe:animate-aui-ping absolute inline-flex size-2 rounded-full" />
          <span className="bg-aui-hot relative inline-flex size-2 rounded-full" />
        </span>
      );
    case 'done':
      return <CheckIcon size={14} className="text-aui-accent-fg" />;
    case 'error':
      return <AlertIcon size={14} className="text-aui-hot-fg" />;
    default:
      return (
        <span className="flex size-3.5 items-center justify-center">
          <span className="bg-aui-fg-subtle size-2 rounded-full" />
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
  className,
  ...props
}: AgentStatusProps) {
  const active = ACTIVE.includes(state);
  const now = useNow(active && startedAt !== undefined && elapsedMs === undefined, 100);
  const hydrated = useHydrated();
  const elapsed = elapsedMs ?? (startedAt !== undefined && hydrated ? Math.max(0, now - startedAt) : undefined);
  const text = label ?? AGENT_STATE_LABEL[state];
  const spoken = detail ? `${text}: ${detail}` : text;
  const urgent = state === 'error' || state === 'awaiting-approval';
  const debounced = useDebouncedValue(spoken, 350);
  const debouncedUrgent = useDebouncedValue(urgent, 350);

  return (
    <div
      data-aui
      data-slot="agent-status"
      data-state={state}
      className={cn(
        'font-aui-sans inline-flex w-fit max-w-full items-center gap-2 rounded-full border font-medium whitespace-nowrap transition-colors',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
        state === 'awaiting-approval' || state === 'error'
          ? 'border-aui-hot/40 bg-aui-hot/10 text-aui-fg'
          : active
            ? 'border-aui-accent/30 bg-aui-accent/[0.07] text-aui-fg'
            : 'border-aui-border bg-aui-surface text-aui-fg-muted',
        className,
      )}
      {...props}
    >
      <Indicator state={state} />
      <span
        className={cn(
          state === 'thinking' &&
            'motion-safe:animate-aui-shimmer motion-safe:bg-[linear-gradient(90deg,var(--aui-fg)_0%,var(--aui-fg)_40%,var(--aui-accent-fg)_50%,var(--aui-fg)_60%,var(--aui-fg)_100%)] motion-safe:bg-[length:200%_100%] motion-safe:bg-clip-text motion-safe:text-transparent',
        )}
      >
        {text}
      </span>
      {detail && (
        <span className="font-aui-mono text-aui-fg-muted min-w-0 truncate text-[0.92em] font-normal">{detail}</span>
      )}
      {elapsed !== undefined && state !== 'idle' && (
        <span className="font-aui-mono text-aui-fg-subtle text-[0.92em] font-normal tabular-nums">
          {formatDuration(elapsed)}
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
    <span data-aui className={cn('inline-flex', className)} aria-hidden="true">
      <Indicator state={state} />
    </span>
  );
}
