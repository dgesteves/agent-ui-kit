import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { estimateCost, RunMeter } from '../src/run-meter';
import { axe } from './utils';

const usage = {
  inputTokens: 16_200,
  outputTokens: 2_150,
  inputTokenDetails: { cacheReadTokens: 9_000, cacheWriteTokens: undefined, noCacheTokens: 7_200 },
  outputTokenDetails: { reasoningTokens: 640, textTokens: 1_510 },
};
const pricing = { input: 2.5, cachedInput: 0.25, output: 10 };

describe('estimateCost', () => {
  it('prices fresh input, cached input and output separately', () => {
    const cost = estimateCost(usage, pricing);
    expect(cost.input).toBeCloseTo((7_200 * 2.5) / 1e6);
    expect(cost.cachedInput).toBeCloseTo((9_000 * 0.25) / 1e6);
    expect(cost.output).toBeCloseTo((2_150 * 10) / 1e6);
    expect(cost.total).toBeCloseTo(0.018 + 0.00225 + 0.0215);
  });

  it('falls back to the input price for cached tokens and handles missing usage', () => {
    expect(
      estimateCost({ inputTokens: 1e6, inputTokenDetails: { cacheReadTokens: 5e5 } }, { input: 1, output: 2 }).total,
    ).toBe(1);
    expect(estimateCost(undefined, pricing).total).toBe(0);
  });
});

describe('RunMeter', () => {
  it('compact: shows tokens, cost and latency, with a spoken summary', () => {
    render(<RunMeter usage={usage} pricing={pricing} ttftMs={412} durationMs={8_240} />);
    const group = screen.getByRole('group', { name: 'Run metrics' });
    expect(group).toHaveTextContent('16.2k');
    expect(group).toHaveTextContent('2.15k');
    expect(group).toHaveTextContent('$0.042');
    expect(group).toHaveTextContent('412ms');
    expect(group).toHaveTextContent('8.24s');
    expect(
      screen.getByText(
        '16.2k input tokens, 2.15k output tokens, estimated cost $0.042, time to first token 412ms, total 8.24s',
      ),
    ).toBeInTheDocument();
  });

  it('compact: labels live runs', () => {
    render(<RunMeter usage={usage} live durationMs={1_000} />);
    expect(screen.getByRole('group', { name: 'Run metrics (live)' })).toBeInTheDocument();
  });

  it('expanded: shows totals, breakdown and cache hit rate', () => {
    render(
      <RunMeter
        variant="expanded"
        usage={usage}
        pricing={pricing}
        ttftMs={400}
        durationMs={4_700}
        model="mock-1"
        live
      />,
    );
    expect(screen.getByRole('heading', { name: 'Run' })).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText('mock-1')).toBeInTheDocument();
    expect(screen.getByText('18.4k')).toBeInTheDocument();
    expect(screen.getByText('(9.00k cached)')).toBeInTheDocument();
    expect(screen.getByText('(640 reasoning)')).toBeInTheDocument();
    // 9,000 of 16,200 input tokens came from the prompt cache.
    expect(screen.getByText('56%')).toBeInTheDocument();
  });

  it('prefers an explicit cost over the estimate', () => {
    render(<RunMeter usage={usage} pricing={pricing} cost={1.5} />);
    expect(screen.getByRole('group')).toHaveTextContent('$1.50');
  });

  it('has no axe violations in either variant', async () => {
    const { container, rerender } = render(
      <RunMeter usage={usage} pricing={pricing} ttftMs={412} durationMs={8_240} />,
    );
    expect(await axe(container)).toHaveNoViolations();
    rerender(<RunMeter variant="expanded" usage={usage} pricing={pricing} ttftMs={412} durationMs={8_240} live />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
