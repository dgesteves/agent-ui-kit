'use client';

import { useState } from 'react';
import { reviewToolOutput, useDiffReview, type DiffReviewToolOutput, type FileChange } from 'signoff-ui';
import { ROUTE_NEW, ROUTE_OLD } from '@/lib/scenario';

const FILES: FileChange[] = [{ path: 'app/api/chat/route.ts', oldContent: ROUTE_OLD, newContent: ROUTE_NEW }];

const SIGN = { add: '+', del: '-', context: ' ' } as const;

/**
 * The same review in markup of its own: a list of hunks with Keep and Drop buttons, styled with the
 * site's classes and none of the kit's. The hook brings the keyboard, the decisions, the comments
 * and the result.
 */
export function UseDiffReviewDemo() {
  const [summary, setSummary] = useState<DiffReviewToolOutput['summary']>();
  const review = useDiffReview({
    files: FILES,
    onSubmit: (result) => setSummary(reviewToolOutput(result).summary),
  });
  return (
    <section
      aria-label="Review in custom markup"
      {...review.getRootProps()}
      className="border-line bg-surface flex flex-col gap-3 rounded-xl border p-3 font-sans"
    >
      <ol className="flex flex-col gap-2">
        {review.items.map((item, index) => {
          const decision = review.decisions[item.id] ?? 'pending';
          return (
            <li key={item.id}>
              <div
                {...review.getItemProps(index)}
                className="border-line focus-visible:outline-cyan-soft data-[decision=accepted]:border-cyan/50 data-[decision=rejected]:border-magenta/50 rounded-lg border p-2 focus-visible:outline-2"
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-fg-subtle font-mono text-[11px]">{item.hunk?.header}</span>
                  <span className="text-fg-muted ml-auto text-xs">
                    {decision === 'pending' ? 'not decided' : decision}
                  </span>
                  <button
                    {...review.getDecisionProps(index, 'rejected')}
                    className="border-line text-fg-soft hover:text-fg aria-pressed:bg-raised focus-visible:outline-cyan-soft cursor-pointer rounded-md border px-2 py-0.5 text-xs focus-visible:outline-2"
                  >
                    Drop
                  </button>
                  <button
                    {...review.getDecisionProps(index, 'accepted')}
                    className="border-line text-fg-soft hover:text-fg aria-pressed:bg-raised focus-visible:outline-cyan-soft cursor-pointer rounded-md border px-2 py-0.5 text-xs focus-visible:outline-2"
                  >
                    Keep
                  </button>
                </div>
                <pre className="text-fg-soft font-mono text-[12px] leading-5 break-all whitespace-pre-wrap">
                  {item.hunk?.lines
                    .filter((line) => line.type !== 'context')
                    .map((line) => `${SIGN[line.type]} ${line.content}`)
                    .join('\n')}
                </pre>
              </div>
            </li>
          );
        })}
      </ol>
      {review.draft && (
        <label className="text-fg-muted flex flex-col gap-1 text-xs">
          Note for the agent
          <textarea
            {...review.getDraftProps()}
            rows={2}
            className="border-line bg-ink text-fg focus-visible:outline-cyan-soft rounded-md border px-2 py-1.5 text-[13px] focus-visible:outline-2"
          />
        </label>
      )}
      <div className="flex items-center gap-3">
        <p className="text-fg-subtle text-xs">
          J and K move, A and R decide, C writes a note. {summary && <span className="text-fg-soft">{summary}</span>}
        </p>
        <button
          {...review.getSubmitProps()}
          className="bg-cyan text-ink focus-visible:outline-cyan-soft ml-auto cursor-pointer rounded-md px-3 py-1 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Send
        </button>
      </div>
      <p role="status" className="sr-only">
        {review.announcement}
      </p>
    </section>
  );
}
