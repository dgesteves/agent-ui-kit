'use client';

import { useState } from 'react';
import {
  APPROVAL_DECISIONS,
  ApprovalCard,
  DiffReview,
  SignoffLabelsProvider,
  type ApprovalChoice,
  type FileChange,
} from 'signoff-ui';
import { pt } from '@/lib/labels-pt';
import { ROUTE_NEW, ROUTE_OLD } from '@/lib/scenario';

const FILES: FileChange[] = [{ path: 'app/api/chat/route.ts', oldContent: ROUTE_OLD, newContent: ROUTE_NEW }];

/**
 * The review and an approval in European Portuguese: one provider with every label translated,
 * the visible words and what screen readers hear alike. `lang` tells them which language it is.
 */
export function LabelsDemo() {
  const [choice, setChoice] = useState<ApprovalChoice>();
  const status = !choice ? 'pending' : choice.decision.startsWith('allow') ? 'approved' : 'denied';
  return (
    <div lang="pt-PT" className="flex flex-col gap-4">
      <SignoffLabelsProvider labels={pt}>
        <ApprovalCard
          toolName="run_command"
          title="Executar comando"
          description="Instala um pacote do registo npm e atualiza o package.json."
          input={{ command: 'pnpm add @upstash/ratelimit', cwd: '~/acme/chat-app' }}
          risk="high"
          status={status}
          decision={choice?.decision}
          reason={choice?.reason}
          decisions={APPROVAL_DECISIONS}
          onDecide={setChoice}
        />
        <DiffReview files={FILES} onSubmit={() => {}} />
      </SignoffLabelsProvider>
    </div>
  );
}
