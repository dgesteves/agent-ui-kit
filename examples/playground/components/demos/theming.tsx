'use client';

import { AgentStatus, ToolCallTimeline } from '@dgesteves/agent-ui-kit';
import type { CSSProperties } from 'react';
import { timelineParts, timelineTimings } from '@/lib/demo-data';
import { toolMeta } from '@/lib/tools';

const FRAMES = [
  ['Dark', { className: 'dark bg-[#0d0f12]' }],
  ['Light', { 'data-theme': 'light', className: 'bg-white' }],
  [
    'Custom tokens',
    {
      className: 'dark bg-[#0f1210]',
      style: {
        '--aui-accent': '#a3e635',
        '--aui-accent-fg': '#bef264',
        '--aui-ring': '#bef264',
        '--aui-hot': '#fb923c',
        '--aui-hot-fg': '#fdba74',
        '--aui-radius': '4px',
      } as CSSProperties,
    },
  ],
] as const;

/** The same components in the dark and light palettes, and with a few tokens overridden. */
export function ThemingDemo() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {FRAMES.map(([name, props]) => (
        <figure key={name} {...props} className={`${props.className} min-w-0 rounded-xl border border-[#262b33] p-4`}>
          <figcaption className="text-aui-fg-subtle mb-3 font-mono text-[11px]">{name}</figcaption>
          <div className="flex flex-col gap-3">
            <AgentStatus state="awaiting-approval" detail="run_command" announce={false} size="sm" />
            <ToolCallTimeline
              parts={timelineParts.slice(0, 3)}
              tools={toolMeta}
              timings={timelineTimings}
              waterfall={false}
              announce={false}
            />
          </div>
        </figure>
      ))}
    </div>
  );
}
