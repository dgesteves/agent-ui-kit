'use client';

import { useMemo, useState } from 'react';
import { DiffReview, type FileChange } from 'signoff-ui';
import { RATELIMIT_UPSTASH, ROUTE_NEW, ROUTE_OLD } from '@/lib/scenario';

const FILES = [
  { path: 'lib/ratelimit.ts', oldContent: '', newContent: RATELIMIT_UPSTASH },
  { path: 'app/api/chat/route.ts', oldContent: ROUTE_OLD, newContent: ROUTE_NEW },
];

const rows = (count: number, name: (i: number) => string) =>
  Array.from({ length: count }, (_, i) => name(i)).join('\n') + '\n';

/**
 * What an agent regenerating code produces: a 5,000-line file rewritten top to bottom, which
 * diffs in a worker and goes over the edit limit, and a 3,000-line file with a few local edits.
 */
function largeFiles(): FileChange[] {
  const field = (i: number) => `  field_${i}: z.string().describe('Column ${i} of the export'),`;
  const routes = (i: number) => `router.get('/v1/items/${i}', handler(${i}));`;
  return [
    {
      path: 'src/generated/schema.ts',
      oldContent: rows(5_000, field),
      newContent: rows(5_000, (i) => `  field_${i}: z.string().min(1).describe('Column ${i} of the export'),`),
    },
    {
      path: 'src/server/routes.ts',
      oldContent: rows(3_000, routes),
      newContent: rows(3_000, (i) =>
        i % 400 === 7 ? `router.get('/v2/items/${i}', handler(${i}, { cache: true }));` : routes(i),
      ),
    },
  ];
}

const EXAMPLES = [
  ['two-files', 'Edits to two files'],
  ['large', 'A 5,000-line rewrite'],
] as const;

export function DiffReviewDemo() {
  const [example, setExample] = useState<(typeof EXAMPLES)[number][0]>('two-files');
  const large = useMemo(() => (example === 'large' ? largeFiles() : undefined), [example]);
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Example" className="border-line bg-raised/60 flex w-fit rounded-lg border p-0.5">
        {EXAMPLES.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={example === id}
            onClick={() => setExample(id)}
            className="focus-visible:outline-cyan-soft text-fg-muted hover:text-fg aria-pressed:bg-line aria-pressed:text-fg cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1"
          >
            {label}
          </button>
        ))}
      </div>
      {large ? (
        <DiffReview key="large" files={large} title="Review a regenerated schema" onSubmit={() => {}} />
      ) : (
        <DiffReview
          key="two-files"
          files={FILES}
          defaultDecisions={{ 'lib/ratelimit.ts:0': 'accepted', 'app/api/chat/route.ts:2': 'rejected' }}
          onSubmit={() => {}}
        />
      )}
    </div>
  );
}
