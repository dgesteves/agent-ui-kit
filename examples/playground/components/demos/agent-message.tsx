'use client';

import { AgentMessage } from '@dgesteves/agent-ui-kit';
import { message } from '@/lib/demo-data';
import { toolMeta } from '@/lib/tools';

export function AgentMessageDemo() {
  return <AgentMessage message={message} tools={toolMeta} />;
}
