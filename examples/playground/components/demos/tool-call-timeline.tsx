'use client';

import { ToolCallTimeline } from '@dgesteves/agent-ui-kit';
import { timelineParts, timelineTimings } from '@/lib/demo-data';
import { toolMeta } from '@/lib/tools';

export function ToolCallTimelineDemo() {
  return <ToolCallTimeline parts={timelineParts} tools={toolMeta} timings={timelineTimings} />;
}
