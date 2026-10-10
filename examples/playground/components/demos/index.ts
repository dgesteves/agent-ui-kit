import type { ComponentType } from 'react';
import { AgUiDemo } from './ag-ui';
import { AgentMessageDemo } from './agent-message';
import { AgentStatusDemo } from './agent-status';
import { ApprovalCardDemo } from './approval-card';
import { DiffReviewDemo } from './diff-review';
import { MarkdownDemo } from './markdown';
import { ReasoningDemo } from './reasoning';
import { RunMeterDemo } from './run-meter';
import { SourcesDemo } from './sources';
import { ToolCallTimelineDemo } from './tool-call-timeline';
import { UseDiffReviewDemo } from './use-diff-review';
import { UseApprovalPolicyDemo } from './use-approval-policy';

/** Each component's live example, by docs slug. A page loads only the one it renders. */
export const DEMOS: Record<string, ComponentType> = {
  'agent-message': AgentMessageDemo,
  'tool-call-timeline': ToolCallTimelineDemo,
  'approval-card': ApprovalCardDemo,
  'use-approval-policy': UseApprovalPolicyDemo,
  'diff-review': DiffReviewDemo,
  'use-diff-review': UseDiffReviewDemo,
  'run-meter': RunMeterDemo,
  'agent-status': AgentStatusDemo,
  sources: SourcesDemo,
  markdown: MarkdownDemo,
  reasoning: ReasoningDemo,
  'use-ag-ui-agent': AgUiDemo,
};
