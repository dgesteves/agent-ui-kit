'use client';

import { AgentStatus } from '@dgesteves/agent-ui-kit';

export function AgentStatusDemo() {
  return (
    <div className="flex flex-wrap gap-3">
      <AgentStatus state="thinking" announce={false} />
      <AgentStatus state="working" detail="read_file" elapsedMs={3_420} announce={false} />
      <AgentStatus state="awaiting-approval" detail="run_command" announce={false} />
      <AgentStatus state="done" elapsedMs={21_800} announce={false} />
      <AgentStatus state="error" label="Rate limited by provider" announce={false} />
    </div>
  );
}
