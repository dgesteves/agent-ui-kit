'use client';

import * as Collapsible from '@radix-ui/react-collapsible';
import { useState, type ComponentPropsWithoutRef } from 'react';
import { formatDuration } from './lib/format';
import { useActivityWindow } from './lib/hooks';
import { ChevronIcon, SparkIcon } from './lib/icons';
import { cn } from './lib/utils';
import { Markdown } from './markdown';

export interface ReasoningProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  text: string;
  /** The model is still reasoning. The panel opens while streaming and closes when done. */
  streaming?: boolean;
  /** Known reasoning duration in ms. Measured client-side when omitted. */
  durationMs?: number | undefined;
  defaultOpen?: boolean;
  open?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  /** Where images in the reasoning may load from: host names, `'self'` or `'*'`. See `MarkdownProps.allowedImageHosts`. */
  allowedImageHosts?: readonly string[] | undefined;
}

/**
 * Collapsible model reasoning. Opens automatically while the model thinks and
 * collapses to a one-line "Thought for 3.2s" summary when it finishes, unless
 * the user has toggled it.
 */
export function Reasoning({
  text,
  streaming = false,
  durationMs,
  defaultOpen,
  open: openProp,
  onOpenChange,
  allowedImageHosts,
  className,
  ...props
}: ReasoningProps) {
  const [openState, setOpenState] = useState(defaultOpen ?? streaming);
  const [touched, setTouched] = useState(false);
  const [prevStreaming, setPrevStreaming] = useState(streaming);
  // Follow the stream (adjusting state during render, not in an effect).
  if (prevStreaming !== streaming) {
    setPrevStreaming(streaming);
    if (!touched) setOpenState(streaming);
  }
  const open = openProp ?? openState;
  const activity = useActivityWindow(streaming);
  const measured =
    activity.startedAt !== undefined && activity.endedAt !== undefined
      ? activity.endedAt - activity.startedAt
      : undefined;
  const duration = durationMs ?? measured;
  const label = streaming
    ? 'Thinking'
    : duration !== undefined
      ? `Thought for ${formatDuration(duration)}`
      : 'Reasoning';

  return (
    <Collapsible.Root
      data-signoff
      data-slot="signoff-reasoning"
      data-streaming={streaming || undefined}
      open={open}
      onOpenChange={(next) => {
        setTouched(true);
        if (openProp === undefined) setOpenState(next);
        onOpenChange?.(next);
      }}
      className={cn('font-signoff-sans', className)}
      {...props}
    >
      <Collapsible.Trigger className="group/trigger text-signoff-fg-muted hover:text-signoff-fg focus-visible:outline-signoff-ring inline-flex cursor-pointer items-center gap-1.5 rounded-md py-1 pr-1.5 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2">
        <SparkIcon size={14} className={cn('text-signoff-accent', streaming && 'motion-safe:animate-pulse')} />
        <span
          className={cn(
            'font-medium',
            streaming &&
              'motion-safe:animate-signoff-shimmer motion-safe:bg-[linear-gradient(90deg,var(--signoff-fg-muted)_0%,var(--signoff-fg-muted)_40%,var(--signoff-accent-fg)_50%,var(--signoff-fg-muted)_60%,var(--signoff-fg-muted)_100%)] motion-safe:bg-[length:200%_100%] motion-safe:bg-clip-text motion-safe:text-transparent',
          )}
        >
          {label}
        </span>
        <ChevronIcon
          size={13}
          className="transition-transform duration-200 group-data-[state=open]/trigger:rotate-90 motion-reduce:transition-none"
        />
      </Collapsible.Trigger>
      <Collapsible.Content className="data-[state=closed]:motion-safe:animate-signoff-collapse data-[state=open]:motion-safe:animate-signoff-expand overflow-hidden">
        <div className="border-signoff-border-strong mt-1.5 mb-1 border-l-2 py-0.5 pl-3.5">
          <Markdown
            streaming={streaming}
            allowedImageHosts={allowedImageHosts}
            className="text-signoff-fg-muted text-[13px] leading-relaxed"
          >
            {text}
          </Markdown>
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
