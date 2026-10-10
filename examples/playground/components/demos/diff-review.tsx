'use client';

import { DiffReview } from 'signoff-ui';
import { RATELIMIT_UPSTASH, ROUTE_NEW, ROUTE_OLD } from '@/lib/scenario';

const FILES = [
  { path: 'lib/ratelimit.ts', oldContent: '', newContent: RATELIMIT_UPSTASH },
  { path: 'app/api/chat/route.ts', oldContent: ROUTE_OLD, newContent: ROUTE_NEW },
];

export function DiffReviewDemo() {
  return (
    <DiffReview
      files={FILES}
      defaultDecisions={{ 'lib/ratelimit.ts:0': 'accepted', 'app/api/chat/route.ts:2': 'rejected' }}
      onSubmit={() => {}}
    />
  );
}
