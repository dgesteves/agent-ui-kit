'use client';

import { RunMeter } from 'signoff-ui';
import { PRICING } from '@/lib/scenario';

const USAGE = {
  inputTokens: 38_660,
  outputTokens: 2_412,
  inputTokenDetails: { cacheReadTokens: 28_800 },
  outputTokenDetails: { reasoningTokens: 96 },
};

export function RunMeterDemo() {
  return (
    // Side by side only where the frame is wide enough for both (a container query, not the screen).
    <div className="@container">
      <div className="grid items-start gap-6 @3xl:grid-cols-[minmax(0,22rem)_1fr]">
        <figure>
          <figcaption className="text-signoff-fg-subtle mb-2 font-mono text-[11px]">
            variant=&quot;expanded&quot;
          </figcaption>
          <RunMeter
            variant="expanded"
            usage={USAGE}
            pricing={PRICING}
            ttftMs={684}
            durationMs={21_800}
            model="mock-agent-1"
          />
        </figure>
        <figure className="min-w-0">
          <figcaption className="text-signoff-fg-subtle mb-2 font-mono text-[11px]">
            variant=&quot;compact&quot;
          </figcaption>
          {/* A size smaller in a phone-width frame, so the strip fits without scrolling. */}
          <RunMeter
            usage={USAGE}
            pricing={PRICING}
            ttftMs={684}
            durationMs={21_800}
            className="@max-sm:text-[11px] @max-sm:[&>span]:px-1.5"
          />
          <p className="text-signoff-fg-muted mt-4 max-w-sm text-[13px] leading-relaxed">
            Pass <code className="text-signoff-fg font-mono text-[12px]">totalUsage</code> from{' '}
            <code className="text-signoff-fg font-mono text-[12px]">streamText</code> through message metadata, and
            timing from <code className="text-signoff-fg font-mono text-[12px]">useRunTiming(status, messages)</code>.
            Cost is an estimate from the pricing you supply.
          </p>
        </figure>
      </div>
    </div>
  );
}
