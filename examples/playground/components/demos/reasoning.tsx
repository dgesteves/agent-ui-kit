'use client';

import { Reasoning } from '@dgesteves/agent-ui-kit';
import { ReplayButton, useStream } from './use-stream';

const TEXT =
  'The route streams with `streamText`, so a 429 has to be returned before the stream opens. There is no middleware.ts, and lib/redis.ts already exports an Upstash client, so a sliding-window limiter on the client IP is the smallest change.';

export function ReasoningDemo() {
  const { text, streaming, start } = useStream(TEXT, { chunk: 4, every: 30 });
  return (
    <div className="flex flex-col gap-4">
      <Reasoning text={text} streaming={streaming} durationMs={streaming ? undefined : 1_700} />
      <div>
        <ReplayButton onClick={start} disabled={streaming}>
          {streaming ? 'Thinking…' : 'Think again'}
        </ReplayButton>
      </div>
    </div>
  );
}
