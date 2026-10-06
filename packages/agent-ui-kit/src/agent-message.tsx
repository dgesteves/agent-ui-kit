'use client';

import { useMemo, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { ToolApprovalCard, type ApprovalCardProps, type ToolApprovalResponse } from './approval-card';
import { getSourceParts, getToolPartName, isToolPart, type AnyUIPart, type ToolPart, type UIMessage } from './lib/ai';
import { useToolTimings, type ToolTimings } from './lib/hooks';
import { FileIcon } from './lib/icons';
import { cn } from './lib/utils';
import { Markdown } from './markdown';
import { Reasoning } from './reasoning';
import { Sources } from './sources';
import { ToolCallTimeline, type ToolMeta } from './tool-call-timeline';

type DataPart = Extract<AnyUIPart, { type: `data-${string}` }>;
type FilePart = Extract<AnyUIPart, { type: 'file' }>;

export interface AgentMessageProps extends Omit<ComponentPropsWithoutRef<'article'>, 'children'> {
  message: Pick<UIMessage, 'id' | 'role' | 'parts'>;
  /** The message is still being generated. Text parts with an explicit `state` take precedence. */
  streaming?: boolean;
  tools?: Record<string, ToolMeta> | undefined;
  /**
   * Render a tool part yourself. Return `undefined` to use the default timeline,
   * or `null` to render nothing. Custom-rendered parts split the timeline.
   */
  renderTool?: ((part: ToolPart) => ReactNode | undefined) | undefined;
  /** Enables inline approval cards. Pass `useChat().addToolApprovalResponse`. */
  onToolApproval?: ((response: ToolApprovalResponse) => void | PromiseLike<void>) | undefined;
  /** Props forwarded to every approval card, e.g. `{ autoFocus: true }`. */
  approvalProps?: Partial<Omit<ApprovalCardProps, 'toolName' | 'status' | 'onApprove' | 'onDeny'>> | undefined;
  /** Render `data-*` parts. They are skipped when omitted. */
  renderData?: ((part: DataPart) => ReactNode) | undefined;
  showSources?: boolean;
  sourcesVariant?: 'chips' | 'cards';
  /** Externally measured tool timings. Measured client-side when omitted. */
  timings?: ToolTimings | undefined;
}

type Segment =
  | { kind: 'text'; key: string; text: string; streaming: boolean }
  | { kind: 'reasoning'; key: string; text: string; streaming: boolean }
  | { kind: 'tools'; key: string; parts: ToolPart[] }
  | { kind: 'node'; key: string; node: ReactNode }
  | { kind: 'file'; key: string; part: FilePart };

/**
 * Renders an assistant `UIMessage` part by part: streaming markdown, collapsible
 * reasoning, consecutive tool calls grouped into a timeline (with inline approval
 * cards), files, and the message's sources with linked inline citations.
 */
export function AgentMessage({
  message,
  streaming = false,
  tools,
  renderTool,
  onToolApproval,
  approvalProps,
  renderData,
  showSources = true,
  sourcesVariant = 'chips',
  timings: timingsProp,
  className,
  ...props
}: AgentMessageProps) {
  const parts = message.parts;
  const measured = useToolTimings(parts);
  const timings = timingsProp ?? measured;
  const sources = useMemo(() => (showSources ? getSourceParts(parts) : []), [parts, showSources]);
  const sourcePrefix = `${message.id}-source`;

  const segments = useMemo(() => {
    const out: Segment[] = [];
    const lastIndex = parts.length - 1;
    parts.forEach((part, i) => {
      const key = `${i}`;
      if (part.type === 'text') {
        if (!part.text) return;
        out.push({
          kind: 'text',
          key,
          text: part.text,
          streaming: part.state ? part.state === 'streaming' : streaming && i === lastIndex,
        });
      } else if (part.type === 'reasoning') {
        if (!part.text && part.state !== 'streaming') return;
        out.push({
          kind: 'reasoning',
          key,
          text: part.text,
          streaming: part.state ? part.state === 'streaming' : streaming && i === lastIndex,
        });
      } else if (isToolPart(part)) {
        const custom = renderTool?.(part);
        if (custom !== undefined) {
          out.push({ kind: 'node', key: part.toolCallId, node: custom });
          return;
        }
        const prev = out.at(-1);
        if (prev?.kind === 'tools') prev.parts.push(part);
        else out.push({ kind: 'tools', key: part.toolCallId, parts: [part] });
      } else if (part.type === 'file') {
        out.push({ kind: 'file', key, part });
      } else if (part.type.startsWith('data-')) {
        if (renderData)
          out.push({ kind: 'node', key: (part as DataPart).id ?? key, node: renderData(part as DataPart) });
      }
    });
    return out;
  }, [parts, streaming, renderTool, renderData]);

  return (
    <article
      data-aui
      data-slot="agent-message"
      data-role={message.role}
      aria-busy={streaming || undefined}
      className={cn('font-aui-sans text-aui-fg flex min-w-0 flex-col gap-3', className)}
      {...props}
    >
      {segments.map((segment) => {
        switch (segment.kind) {
          case 'text':
            return (
              <Markdown
                key={segment.key}
                streaming={segment.streaming}
                citations={sources.length}
                citationPrefix={sourcePrefix}
              >
                {segment.text}
              </Markdown>
            );
          case 'reasoning':
            return <Reasoning key={segment.key} text={segment.text} streaming={segment.streaming} />;
          case 'tools':
            return (
              <ToolCallTimeline
                key={segment.key}
                parts={segment.parts}
                tools={tools}
                timings={timings}
                renderExtra={
                  onToolApproval
                    ? (part) =>
                        part.approval ? (
                          <ToolApprovalCard
                            part={part}
                            onRespond={onToolApproval}
                            meta={tools?.[getToolPartName(part)]}
                            {...approvalProps}
                          />
                        ) : null
                    : undefined
                }
              />
            );
          case 'file':
            return <FileAttachment key={segment.key} part={segment.part} />;
          case 'node':
            return <div key={segment.key}>{segment.node}</div>;
        }
      })}
      {sources.length > 0 && (
        <Sources sources={sources} variant={sourcesVariant} idPrefix={sourcePrefix} className="mt-1" />
      )}
    </article>
  );
}

function FileAttachment({ part }: { part: FilePart }) {
  const name = part.filename ?? part.mediaType;
  if (part.mediaType.startsWith('image')) {
    return (
      <a
        href={part.url}
        target="_blank"
        rel="noopener noreferrer"
        className="focus-visible:outline-aui-ring block w-fit rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <img
          src={part.url}
          alt={part.filename ?? 'Attached image'}
          className="border-aui-border max-h-64 rounded-lg border"
        />
      </a>
    );
  }
  return (
    <a
      href={part.url}
      target="_blank"
      rel="noopener noreferrer"
      className="border-aui-border bg-aui-surface text-aui-fg hover:bg-aui-surface-2 focus-visible:outline-aui-ring inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-2 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <FileIcon size={14} className="text-aui-fg-subtle" />
      {name}
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
