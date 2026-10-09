'use client';

import { Markdown } from '@dgesteves/agent-ui-kit';
import { ReplayButton, useStream } from './use-stream';

const TEXT = `The limiter belongs at the **top of the handler**, before \`streamText\` opens the stream:

1. Read the client's IP from \`x-forwarded-for\`.
2. Call \`ratelimit.limit(ip)\` and return a **429** when it fails.

| Window | Requests | Burst |
| --- | --- | --- |
| Sliding, 10 s | 10 | smoothed |
| Fixed, 10 s | 10 | up to 20 at the edge |

\`\`\`ts
const { success } = await limit(ip);
if (!success) return tooMany();
\`\`\``;

export function MarkdownDemo() {
  const { text, streaming, start } = useStream(TEXT);
  return (
    <div className="flex flex-col gap-4">
      <div className="text-aui-fg text-[14px] leading-relaxed">
        <Markdown streaming={streaming}>{text}</Markdown>
      </div>
      <div>
        <ReplayButton onClick={start} disabled={streaming}>
          {streaming ? 'Streaming…' : 'Stream it again'}
        </ReplayButton>
      </div>
    </div>
  );
}
