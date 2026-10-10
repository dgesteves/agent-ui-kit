'use client';

import { AgentMessage } from 'signoff-ui';
import { message } from '@/lib/demo-data';
import { toolMeta } from '@/lib/tools';

export function AgentMessageDemo() {
  return <AgentMessage message={message} tools={toolMeta} />;
}
