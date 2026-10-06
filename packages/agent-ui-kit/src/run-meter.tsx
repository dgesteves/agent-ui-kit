import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import type { RunUsage } from './lib/ai';
import { formatCost, formatDuration, formatRate, formatTokens } from './lib/format';
import { useAnimatedNumber } from './lib/hooks';
import { ArrowDownIcon, ArrowUpIcon } from './lib/icons';
import { cn } from './lib/utils';

export type { RunUsage };

/** USD per million tokens. */
export interface ModelPricing {
  input: number;
  output: number;
  /** Price for cache-read input tokens. Defaults to `input`. */
  cachedInput?: number | undefined;
}

export interface CostBreakdown {
  input: number;
  cachedInput: number;
  output: number;
  total: number;
}

/** Estimate the cost of a run from AI SDK usage and per-million-token pricing. */
export function estimateCost(usage: RunUsage | undefined, pricing: ModelPricing): CostBreakdown {
  const inputTokens = usage?.inputTokens ?? 0;
  const cached = Math.min(usage?.inputTokenDetails?.cacheReadTokens ?? 0, inputTokens);
  const fresh = inputTokens - cached;
  const output = usage?.outputTokens ?? 0;
  const c = {
    input: (fresh * pricing.input) / 1e6,
    cachedInput: (cached * (pricing.cachedInput ?? pricing.input)) / 1e6,
    output: (output * pricing.output) / 1e6,
  };
  return { ...c, total: c.input + c.cachedInput + c.output };
}

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
  /** Heading for the expanded variant. Default "Run". */
  title?: ReactNode;
}

function Num({ value, format }: { value: number | undefined; format: (n: number) => string }) {
  const animated = useAnimatedNumber(value ?? 0);
  if (value === undefined) return <>–</>;
  return <>{format(animated)}</>;
}

/**
 * Token usage, estimated cost and latency for an agent run.
 * `compact` is a single inline strip for headers; `expanded` is a card with a
 * token breakdown bar and derived throughput.
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
  title = 'Run',
  className,
  ...props
}: RunMeterProps) {
  const breakdown = pricing ? estimateCost(usage, pricing) : undefined;
  const totalCost = cost ?? breakdown?.total;
  const input = usage?.inputTokens;
  const output = usage?.outputTokens;
  const cached = usage?.inputTokenDetails?.cacheReadTokens;
  const reasoning = usage?.outputTokenDetails?.reasoningTokens;
  const generationMs = durationMs !== undefined && ttftMs !== undefined ? durationMs - ttftMs : undefined;
  const throughput = output && generationMs && generationMs > 250 ? output / (generationMs / 1000) : undefined;

  const summary = [
    `${formatTokens(input)} input tokens`,
    `${formatTokens(output)} output tokens`,
    totalCost !== undefined ? `estimated cost ${formatCost(totalCost)}` : undefined,
    ttftMs !== undefined ? `time to first token ${formatDuration(ttftMs)}` : undefined,
    durationMs !== undefined ? `total ${formatDuration(durationMs)}` : undefined,
  ]
    .filter(Boolean)
    .join(', ');

  if (variant === 'compact') {
    const item = 'flex items-center gap-1.5 px-2.5 first:pl-0 last:pr-0';
    return (
      <div
        data-aui
        data-slot="run-meter"
        data-variant="compact"
        role="group"
        aria-label={`Run metrics${live ? ' (live)' : ''}`}
        className={cn(
          'divide-aui-border font-aui-mono text-aui-fg-muted inline-flex max-w-full items-center divide-x overflow-x-auto text-xs whitespace-nowrap tabular-nums',
          className,
        )}
        {...props}
      >
        <span className="sr-only">{summary}</span>
        <span aria-hidden="true" className={item} title="Input tokens">
          <ArrowUpIcon size={12} className="text-aui-chart-input" />
          <span className="text-aui-fg">
            <Num value={input} format={formatTokens} />
          </span>
        </span>
        <span aria-hidden="true" className={item} title="Output tokens">
          <ArrowDownIcon size={12} className="text-aui-chart-output" />
          <span className="text-aui-fg">
            <Num value={output} format={formatTokens} />
          </span>
        </span>
        {totalCost !== undefined && (
          <span aria-hidden="true" className={item} title="Estimated cost">
            <span className="text-aui-fg">
              <Num value={totalCost} format={formatCost} />
            </span>
          </span>
        )}
        {ttftMs !== undefined && (
          <span aria-hidden="true" className={item} title="Time to first token">
            <span className="text-aui-fg-subtle">TTFT</span>
            <span className="text-aui-fg">{formatDuration(ttftMs)}</span>
          </span>
        )}
        {durationMs !== undefined && (
          <span aria-hidden="true" className={item} title="Total time">
            {live && <span className="bg-aui-accent size-1.5 rounded-full motion-safe:animate-pulse" />}
            <span className="text-aui-fg">{formatDuration(durationMs)}</span>
          </span>
        )}
      </div>
    );
  }

  const tokenTotal = (input ?? 0) + (output ?? 0);
  const inputShare = tokenTotal > 0 ? ((input ?? 0) / tokenTotal) * 100 : 0;
  const label = 'text-xs text-aui-fg-subtle';
  const value = 'text-xl font-semibold tracking-tight text-aui-fg tabular-nums';

  return (
    <div
      data-aui
      data-slot="run-meter"
      data-variant="expanded"
      className={cn('rounded-aui border-aui-border bg-aui-surface font-aui-sans text-aui-fg border p-4', className)}
      {...props}
    >
      <div className="mb-4 flex items-center gap-2">
        <h3 className="text-aui-fg text-[13px] font-semibold">{title}</h3>
        {live && (
          <span className="bg-aui-accent/10 text-aui-accent-fg inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium">
            <span className="bg-aui-accent size-1.5 rounded-full motion-safe:animate-pulse" />
            Live
          </span>
        )}
        {model && <span className="font-aui-mono text-aui-fg-subtle ml-auto truncate text-[11px]">{model}</span>}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
        <div>
          <dt className={label}>Tokens</dt>
          <dd className={value}>
            <Num value={tokenTotal || undefined} format={formatTokens} />
          </dd>
        </div>
        <div>
          <dt className={label}>Est. cost</dt>
          <dd className={value}>{totalCost !== undefined ? <Num value={totalCost} format={formatCost} /> : '–'}</dd>
        </div>
      </dl>

      <div className="mt-3">
        <div
          aria-hidden="true"
          className="bg-aui-surface-2 flex h-2 w-full gap-0.5 overflow-hidden rounded-[4px]"
          title={`Input ${formatTokens(input)} · Output ${formatTokens(output)}`}
        >
          {tokenTotal > 0 && (
            <>
              <span
                className="bg-aui-chart-input h-full rounded-l-[4px] transition-[width] duration-500 motion-reduce:transition-none"
                style={{ width: `${inputShare}%` }}
              />
              <span className="bg-aui-chart-output h-full flex-1 rounded-r-[4px]" />
            </>
          )}
        </div>
        <ul className="text-aui-fg-muted mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Token breakdown">
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="bg-aui-chart-input size-2 rounded-[2px]" />
            Input <span className="font-aui-mono text-aui-fg tabular-nums">{formatTokens(input)}</span>
            {cached ? <span className="text-aui-fg-subtle">({formatTokens(cached)} cached)</span> : null}
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="bg-aui-chart-output size-2 rounded-[2px]" />
            Output <span className="font-aui-mono text-aui-fg tabular-nums">{formatTokens(output)}</span>
            {reasoning ? <span className="text-aui-fg-subtle">({formatTokens(reasoning)} reasoning)</span> : null}
          </li>
        </ul>
      </div>

      <dl className="border-aui-border mt-4 grid grid-cols-3 gap-x-3 border-t pt-3">
        <div>
          <dt className={label}>TTFT</dt>
          <dd className="font-aui-mono text-aui-fg text-sm tabular-nums">{formatDuration(ttftMs)}</dd>
        </div>
        <div>
          <dt className={label}>Total</dt>
          <dd className="font-aui-mono text-aui-fg text-sm tabular-nums">{formatDuration(durationMs)}</dd>
        </div>
        <div>
          <dt className={label}>Output tok/s</dt>
          <dd className="font-aui-mono text-aui-fg text-sm tabular-nums">{formatRate(throughput)}</dd>
        </div>
      </dl>
      {breakdown && (
        <p className="text-aui-fg-subtle mt-3 text-[11px]">
          {formatCost(breakdown.input + breakdown.cachedInput)} input · {formatCost(breakdown.output)} output
          {pricing && (
            <>
              {' '}
              · ${pricing.input}/${pricing.output} per 1M
            </>
          )}
        </p>
      )}
    </div>
  );
}
