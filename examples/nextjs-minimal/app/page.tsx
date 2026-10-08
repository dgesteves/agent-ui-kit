import { Suspense } from 'react';
import { AgentRun } from './agent-run';

export default function Page() {
  // With cacheComponents (on in new Next.js 16 apps), useChat needs a Suspense boundary:
  // it creates ids with Math.random(), which Next.js does not allow in prerendered output.
  return (
    <Suspense>
      <AgentRun />
    </Suspense>
  );
}
