'use client';

import { Collapsible } from 'radix-ui';
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
  /** Hosts that images in the reasoning may load from. See `MarkdownProps.allowedImageHosts`. */
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
      data-aui
      data-slot="reasoning"
      data-streaming={streaming || undefined}
      open={open}
      onOpenChange={(next) => {
        setTouched(true);
        if (openProp === undefined) setOpenState(next);
        onOpenChange?.(next);
      }}
      className={cn('font-aui-sans', className)}
      {...props}
    >
      <Collapsible.Trigger className="group/trigger text-aui-fg-muted hover:text-aui-fg focus-visible:outline-aui-ring inline-flex cursor-pointer items-center gap-1.5 rounded-md py-1 pr-1.5 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2">
        <SparkIcon size={14} className={cn('text-aui-accent', streaming && 'motion-safe:animate-pulse')} />
        <span
          className={cn(
            'font-medium',
            streaming &&
              'motion-safe:animate-aui-shimmer motion-safe:bg-[linear-gradient(90deg,var(--aui-fg-muted)_0%,var(--aui-fg-muted)_40%,var(--aui-accent-fg)_50%,var(--aui-fg-muted)_60%,var(--aui-fg-muted)_100%)] motion-safe:bg-[length:200%_100%] motion-safe:bg-clip-text motion-safe:text-transparent',
          )}
        >
          {label}
        </span>
        <ChevronIcon
          size={13}
          className="transition-transform duration-200 group-data-[state=open]/trigger:rotate-90 motion-reduce:transition-none"
        />
      </Collapsible.Trigger>
      <Collapsible.Content className="data-[state=closed]:motion-safe:animate-aui-collapse data-[state=open]:motion-safe:animate-aui-expand overflow-hidden">
        <div className="border-aui-border-strong mt-1.5 mb-1 border-l-2 py-0.5 pl-3.5">
          <Markdown
            streaming={streaming}
            allowedImageHosts={allowedImageHosts}
            className="text-aui-fg-muted text-[13px] leading-relaxed"
          >
            {text}
          </Markdown>
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
