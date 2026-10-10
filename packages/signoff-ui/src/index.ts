// No 'use client' here: components and hooks carry the directive in their own
// modules, so the pure helpers re-exported from ./core stay callable on the server.
export { AgentMessage, type AgentMessageProps } from './agent-message';
export { AgentStatus, AgentStatusDot, type AgentStatusProps } from './agent-status';
export {
  ApprovalCard,
  ToolApprovalCard,
  type ApprovalCardProps,
  type ToolApprovalCardProps,
  type ToolApprovalResponse,
} from './approval-card';
export { DiffReview, type DiffReviewProps, type DiffViewMode, type DiffWorkerFactory } from './diff-review';
export {
  useDiffReview,
  type DiffReviewDraft,
  type DiffReviewFileState,
  type DiffReviewSelection,
  type ShownContext,
  type UseDiffReviewOptions,
  type UseDiffReviewResult,
} from './use-diff-review';
export { Markdown, type MarkdownProps } from './markdown';
export { Reasoning, type ReasoningProps } from './reasoning';
export { RunMeter, type RunMeterProps } from './run-meter';
export { Sources, type SourcesProps } from './sources';
export {
  ToolCallDetails,
  ToolCallTimeline,
  type RiskLevel,
  type ToolCallTimelineProps,
  type ToolMeta,
} from './tool-call-timeline';
export { JsonView, type JsonViewProps } from './lib/primitives';
export {
  useActivityWindow,
  useHydrated,
  usePrefersReducedMotion,
  useRunTiming,
  useToolTimings,
  type RunTiming,
  type RunTimingMessage,
} from './lib/hooks';

export * from './core';
