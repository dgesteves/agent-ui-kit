'use client';

import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import type { RunUsage } from './lib/ai';
import { runMeterLabels, formatLabels, type SignoffLabelsInput } from './lib/labels';
import { useLabels } from './labels';
import { useAnimatedNumber } from './lib/hooks';
import { useScrollRegion } from './lib/scroll-region';
import { ArrowDownIcon, ArrowUpIcon } from './lib/icons';
import { estimateCost, type ModelPricing } from './lib/usage';
import { cn, type HeadingLevel } from './lib/utils';

/** The labels' sections this module reads. */
const LABELS = { runMeter: runMeterLabels, format: formatLabels };

export type { RunUsage };
export type { CostBreakdown, ModelPricing } from './lib/usage';

export interface RunMeterProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'title'> {
  usage?: RunUsage | undefined;
  /** Used to estimate cost when `cost` is not given. */
  pricing?: ModelPricing | undefined;
  /** Explicit cost in USD, e.g. reported by your gateway. */
  cost?: number | undefined;
  /** Time to first token, ms. */
  ttftMs?: number | undefined;
  /** Total (active) run time, ms. */
  durationMs?: number | undefined;
  /** The run is in progress: values are live. */
  live?: boolean;
  model?: string | undefined;
  variant?: 'compact' | 'expanded';
  /** Heading for the expanded variant. Default "Run" (`labels.runMeter.title`). */
  title?: ReactNode;
  /** Heading level for the expanded variant's title. Default 3. */
  headingLevel?: HeadingLevel;
  /** Words to use instead of the English defaults: see `SignoffLabelsProvider`. */
  labels?: SignoffLabelsInput | undefined;
}

function Num({ value, format }: { value: number | undefined; format: (n: number) => string }) {
  const animated = useAnimatedNumber(value ?? 0);
  if (value === undefined) return <>–</>;
  return <>{format(animated)}</>;
}

/**
 * Token usage, estimated cost and latency for an agent run.
 * `compact` is a single inline strip for headers; `expanded` is a card with a
 * token breakdown bar and the prompt-cache hit rate.
 */
export function RunMeter({
  usage,
  pricing,
  cost,
  ttftMs,
  durationMs,
  live = false,
  model,
  variant = 'compact',
  title: titleProp,
  headingLevel = 3,
  labels,
  className,
  ...props
}: RunMeterProps) {
  const L = useLabels(LABELS, labels);
  const { duration: formatDuration, tokens: formatTokens, cost: formatCost } = L.format;
  const M = L.runMeter;
  const title = titleProp ?? M.title;
  const Heading = `h${headingLevel}` as const;
  // The compact strip scrolls sideways in a narrow space; it's already a named group.
  const stripRef = useScrollRegion<HTMLDivElement>();
  const breakdown = pricing ? estimateCost(usage, pricing) : undefined;
  const totalCost = cost ?? breakdown?.total;
  const input = usage?.inputTokens;
  const output = usage?.outputTokens;
  const cached = usage?.inputTokenDetails?.cacheReadTokens;
  const reasoning = usage?.outputTokenDetails?.reasoningTokens;
  // Share of input tokens served from the provider's prompt cache: the main cost lever for agents.
  const cacheHit = input && cached !== undefined ? cached / input : undefined;

  const summary = M.summary({
    input: formatTokens(input),
    output: formatTokens(output),
    cost: totalCost !== undefined ? formatCost(totalCost) : undefined,
    ttft: ttftMs !== undefined ? formatDuration(ttftMs) : undefined,
    total: durationMs !== undefined ? formatDuration(durationMs) : undefined,
  });

  if (variant === 'compact') {
    const item = 'flex items-center gap-1.5 px-2.5 first:pl-0 last:pr-0';
    return (
      <div
        ref={stripRef}
        data-signoff
        data-slot="signoff-run-meter"
        data-variant="compact"
        role="group"
        aria-label={M.metrics(live)}
        className={cn(
          'divide-signoff-border font-signoff-mono text-signoff-fg-muted focus-visible:outline-signoff-ring inline-flex w-fit max-w-full items-center divide-x overflow-x-auto text-xs whitespace-nowrap tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2',
          className,
        )}
        {...props}
      >
        <span className="sr-only">{summary}</span>
        <span aria-hidden="true" className={item} title={M.inputTokens}>
          <ArrowUpIcon size={12} className="text-signoff-chart-input" />
          <span className="text-signoff-fg">
            <Num value={input} format={formatTokens} />
          </span>
        </span>
        <span aria-hidden="true" className={item} title={M.outputTokens}>
          <ArrowDownIcon size={12} className="text-signoff-chart-output" />
          <span className="text-signoff-fg">
            <Num value={output} format={formatTokens} />
          </span>
        </span>
        {totalCost !== undefined && (
          <span aria-hidden="true" className={item} title={M.estimatedCost}>
            <span className="text-signoff-fg">
              <Num value={totalCost} format={formatCost} />
            </span>
          </span>
        )}
        {ttftMs !== undefined && (
          <span aria-hidden="true" className={item} title={M.timeToFirstToken}>
            <span className="text-signoff-fg-subtle">{M.ttft}</span>
            <span className="text-signoff-fg">{formatDuration(ttftMs)}</span>
          </span>
        )}
        {durationMs !== undefined && (
          <span aria-hidden="true" className={item} title={M.totalTime}>
            {live && <span className="bg-signoff-accent size-1.5 rounded-full motion-safe:animate-pulse" />}
            <span className="text-signoff-fg">{formatDuration(durationMs)}</span>
          </span>
        )}
      </div>
    );
  }

  const tokenTotal = (input ?? 0) + (output ?? 0);
  // Keep a non-zero segment visible even when it is a tiny share.
  const inputShare =
    tokenTotal > 0 ? Math.min(97, Math.max((input ?? 0) > 0 ? 3 : 0, ((input ?? 0) / tokenTotal) * 100)) : 0;
  const label = 'text-xs text-signoff-fg-subtle';
  const value = 'text-xl font-semibold tracking-tight text-signoff-fg tabular-nums';

  return (
    <div
      data-signoff
      data-slot="signoff-run-meter"
      data-variant="expanded"
      className={cn(
        'rounded-signoff border-signoff-border bg-signoff-surface font-signoff-sans text-signoff-fg border p-4',
        className,
      )}
      {...props}
    >
      <div className="mb-4 flex items-center gap-2">
        <Heading className="text-signoff-fg text-[13px] font-semibold">{title}</Heading>
        {live && (
          <span className="bg-signoff-accent/10 text-signoff-accent-fg inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium">
            <span className="bg-signoff-accent size-1.5 rounded-full motion-safe:animate-pulse" />
            {M.live}
          </span>
        )}
        {model && (
          <span className="font-signoff-mono text-signoff-fg-subtle ml-auto truncate text-[11px]">{model}</span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
        <div>
          <dt className={label}>{M.tokens}</dt>
          <dd className={value}>
            <Num value={tokenTotal || undefined} format={formatTokens} />
          </dd>
        </div>
        <div>
          <dt className={label}>{M.estCost}</dt>
          <dd className={value}>{totalCost !== undefined ? <Num value={totalCost} format={formatCost} /> : '–'}</dd>
        </div>
      </dl>

      <div className="mt-3">
        <div
          aria-hidden="true"
          className="bg-signoff-surface-2 flex h-2 w-full gap-0.5 overflow-hidden rounded-[4px]"
          title={M.split(formatTokens(input), formatTokens(output))}
        >
          {tokenTotal > 0 && (
            <>
              <span
                className="bg-signoff-chart-input h-full rounded-l-[4px] transition-[width] duration-500 motion-reduce:transition-none"
                style={{ width: `${inputShare}%` }}
              />
              <span className="bg-signoff-chart-output h-full flex-1 rounded-r-[4px]" />
            </>
          )}
        </div>
        <ul className="text-signoff-fg-muted mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label={M.breakdown}>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="bg-signoff-chart-input size-2 rounded-[2px]" />
            {M.input} <span className="font-signoff-mono text-signoff-fg tabular-nums">{formatTokens(input)}</span>
            {cached ? <span className="text-signoff-fg-subtle">{M.cached(formatTokens(cached))}</span> : null}
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="bg-signoff-chart-output size-2 rounded-[2px]" />
            {M.output} <span className="font-signoff-mono text-signoff-fg tabular-nums">{formatTokens(output)}</span>
            {reasoning ? (
              <span className="text-signoff-fg-subtle">{M.reasoningTokens(formatTokens(reasoning))}</span>
            ) : null}
          </li>
        </ul>
      </div>

      <dl className="border-signoff-border mt-4 grid grid-cols-3 gap-x-3 border-t pt-3">
        <div>
          <dt className={label}>{M.ttft}</dt>
          <dd className="font-signoff-mono text-signoff-fg text-sm tabular-nums">{formatDuration(ttftMs)}</dd>
        </div>
        <div>
          <dt className={label}>{M.total}</dt>
          <dd className="font-signoff-mono text-signoff-fg text-sm tabular-nums">{formatDuration(durationMs)}</dd>
        </div>
        <div>
          <dt className={label}>{M.cacheHit}</dt>
          <dd className="font-signoff-mono text-signoff-fg text-sm tabular-nums">
            {cacheHit !== undefined ? L.format.percent(cacheHit) : '–'}
          </dd>
        </div>
      </dl>
      {breakdown && (
        <p className="text-signoff-fg-subtle mt-3 text-[11px]">
          {M.costSplit(
            formatCost(breakdown.input + breakdown.cachedInput + breakdown.cacheWrite),
            formatCost(breakdown.output),
          )}
          {pricing && <> · {M.rates(pricing.input, pricing.output)}</>}
        </p>
      )}
    </div>
  );
}
