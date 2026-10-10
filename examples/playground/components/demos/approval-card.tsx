'use client';

import { ApprovalCard, APPROVAL_DECISIONS, type ApprovalChoice } from 'signoff-ui';
import { useState } from 'react';

export function ApprovalCardDemo() {
  const [choice, setChoice] = useState<ApprovalChoice>();
  const status = !choice ? 'pending' : choice.decision.startsWith('allow') ? 'approved' : 'denied';
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <ApprovalCard
        toolName="run_command"
        title="Run command"
        description="Installs a package from the npm registry and updates package.json and pnpm-lock.yaml."
        input={{ command: 'pnpm add @upstash/ratelimit', cwd: '~/acme/chat-app' }}
        risk="high"
        status={status}
        reason={choice?.reason}
        decision={choice?.decision}
        // Once, for this session or always, the arguments editable first.
        decisions={APPROVAL_DECISIONS}
        editable
        onDecide={setChoice}
      />
      {choice && (
        <p className="text-fg-muted text-xs">
          <code className="font-mono">onDecide</code> got{' '}
          <code className="text-fg-soft font-mono break-all">{JSON.stringify(choice)}</code>.{' '}
          <button
            type="button"
            onClick={() => setChoice(undefined)}
            className="text-signoff-fg-muted hover:text-signoff-fg focus-visible:outline-signoff-ring cursor-pointer rounded-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Reset
          </button>
        </p>
      )}
    </div>
  );
}
