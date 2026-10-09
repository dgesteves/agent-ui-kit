'use client';

import { ApprovalCard } from '@dgesteves/agent-ui-kit';
import { useState } from 'react';

export function ApprovalCardDemo() {
  const [status, setStatus] = useState<'pending' | 'approved' | 'denied'>('pending');
  const [reason, setReason] = useState<string>();
  return (
    <div className="max-w-2xl">
      <ApprovalCard
        toolName="run_command"
        title="Run command"
        description="Installs a package from the npm registry and updates package.json and pnpm-lock.yaml."
        input={{ command: 'pnpm add @upstash/ratelimit', cwd: '~/acme/chat-app' }}
        risk="high"
        status={status}
        reason={reason}
        onApprove={() => setStatus('approved')}
        onDeny={(why) => {
          setReason(why);
          setStatus('denied');
        }}
      />
      {status !== 'pending' && (
        <button
          type="button"
          onClick={() => {
            setStatus('pending');
            setReason(undefined);
          }}
          className="text-aui-fg-muted hover:text-aui-fg focus-visible:outline-aui-ring mt-3 cursor-pointer rounded-sm text-xs underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Reset
        </button>
      )}
    </div>
  );
}
