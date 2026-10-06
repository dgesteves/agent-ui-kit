import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DiffReview, type HunkDecision } from '../src/diff-review';
import * as diff from '../src/lib/diff';
import { ROUTE_NEW, ROUTE_OLD } from './fixtures';

vi.mock('../src/lib/diff', async (importOriginal) => {
  const actual = await importOriginal<typeof diff>();
  return { ...actual, parseFileChange: vi.fn(actual.parseFileChange) };
});

describe('DiffReview parsing', () => {
  it('does not re-parse unchanged files when the parent re-renders with a new files array', async () => {
    const user = userEvent.setup();
    function Controlled({ newContent }: { newContent: string }) {
      const [decisions, setDecisions] = useState<Record<string, HunkDecision>>({});
      return (
        <DiffReview
          // A new array (and new objects) on every render, as an inline literal gives.
          files={[
            { path: 'app/api/chat/route.ts', oldContent: ROUTE_OLD, newContent },
            { path: 'lib/ratelimit.ts', oldContent: '', newContent: 'export const limit = 10;\n' },
          ]}
          decisions={decisions}
          onDecisionsChange={setDecisions}
        />
      );
    }
    const parse = vi.mocked(diff.parseFileChange);
    const { rerender } = render(<Controlled newContent={ROUTE_NEW} />);
    expect(parse).toHaveBeenCalledTimes(2);
    const [first] = screen.getAllByRole('group', { name: /^Hunk/ });
    first!.focus();
    await user.keyboard('aaa');
    expect(screen.getAllByRole('group', { name: /^Hunk/ }).map((h) => h.dataset.decision)).toEqual([
      'accepted',
      'accepted',
      'accepted',
      'pending',
    ]);
    expect(parse).toHaveBeenCalledTimes(2);
    // Changed contents are parsed again, and only the file that changed.
    rerender(<Controlled newContent={ROUTE_NEW.replace('429', '503')} />);
    expect(parse).toHaveBeenCalledTimes(3);
    expect(parse.mock.calls[2]![0].path).toBe('app/api/chat/route.ts');
  });
});
