'use client';

import type { ToolCallMessagePartComponent, ToolCallMessagePartProps } from '@assistant-ui/react';
import { createContext, useContext, type ReactNode } from 'react';
import { ToolApprovalCard, type ToolApprovalCardProps } from './approval-card';
import { DiffReview, type DiffReviewProps } from './diff-review';
import type { ToolPart } from './lib/ai';
import type { FileChange } from './lib/diff';
import { reviewToolOutput, type DiffReviewToolOutputOptions } from './lib/review';
import type { ToolMeta } from './tool-call-timeline';
import type { ApprovalPolicy } from './use-approval-policy';

/*
 * assistant-ui renders each tool call with the component `MessagePrimitive.Parts` maps its name to
 * (`components.tools`), passing the call with `addResult` and `respondToApproval`. These components
 * answer both with the kit: a review becomes the call's result, a decision answers its approval gate.
 * Only assistant-ui's types are imported, so nothing of it ends up in the bundle from here.
 */

export interface SignoffToolsProviderProps {
  /**
   * Approval rules from `useApprovalPolicy`. The cards then offer once, this session and always,
   * and a call a rule decides is answered without asking, once the run has paused for it.
   */
  policy?: ApprovalPolicy | undefined;
  /** Labels and risk levels by tool name, as for `AgentMessage`'s `tools`. */
  tools?: Record<string, ToolMeta> | undefined;
  /** Props for every review's `DiffReview`, such as `view`, `headingLevel` or `labels`. */
  review?: Omit<DiffReviewProps, 'files' | 'onSubmit' | 'readOnly'> | undefined;
  /** Props for every approval card, such as `headingLevel`, `decisions` or `labels`. */
  approval?: Omit<ToolApprovalCardProps, 'part' | 'onRespond' | 'policy' | 'meta'> | undefined;
  /** What a review sends back as the call's result: the options of `reviewToolOutput`. */
  output?: DiffReviewToolOutputOptions | undefined;
  children?: ReactNode;
}

const Options = createContext<Omit<SignoffToolsProviderProps, 'children'>>({});

/** Options for the tool UIs below it: approval rules, tool labels and risk, review props. Optional. */
export function SignoffToolsProvider({ children, ...options }: SignoffToolsProviderProps) {
  return <Options.Provider value={options}>{children}</Options.Provider>;
}

/**
 * A call whose arguments carry `files` (`FileChange[]`), reviewed in a `DiffReview` once its
 * arguments are in. The review goes back as the call's result, `reviewToolOutput(review)`, and the
 * review stays on the page, read-only.
 */
export function ReviewToolUI({ args, result, status, addResult }: ToolCallMessagePartProps) {
  const { review, output } = useContext(Options);
  const files = (args as { files?: FileChange[] } | undefined)?.files;
  // Still streaming: the files may be cut short.
  if (!Array.isArray(files) || (result === undefined && status.type === 'running')) return null;
  return (
    <DiffReview
      {...review}
      files={files}
      readOnly={result !== undefined}
      onSubmit={(done) => addResult(reviewToolOutput(done, output))}
    />
  );
}

/**
 * The approval card for a call at an approval gate (`approval` on the part), answered through
 * `respondToApproval`. Renders nothing for other calls, for a request that is not a plain decision
 * (a question, a choice to select), and for one cancelled or expired before anyone decided.
 */
export function ApprovalToolUI(props: ToolCallMessagePartProps) {
  const { policy, tools, approval } = useContext(Options);
  const part = toToolPart(props);
  if (!part) return null;
  // A rule decides this call: it is answered once the run pauses for it, without showing a card.
  if (
    part.state === 'approval-requested' &&
    props.status.type === 'running' &&
    policy?.match(props.toolName, props.args)
  )
    return null;
  return (
    <ToolApprovalCard
      {...approval}
      part={part}
      meta={tools?.[props.toolName]}
      policy={policy}
      onRespond={({ approved, reason }) => respond(props, reason ? { approved, reason } : { approved })}
    />
  );
}

/**
 * `respondToApproval`, tried again for a moment when the runtime turns it down: a rule's answer can
 * come while the run that asked is still settling (the local runtime refuses answers until it has).
 * A runtime that throws then leaves the card retryable rather than failing the render.
 */
async function respond(
  { respondToApproval }: ToolCallMessagePartProps,
  response: { approved: boolean; reason?: string },
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await respondToApproval(response);
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
    }
  }
}

/** The AI SDK tool part an assistant-ui call at a decision gate stands for, as `ToolApprovalCard` reads it. */
function toToolPart({ toolCallId, toolName, args, result, isError, approval }: ToolCallMessagePartProps) {
  if (!approval || approval.resolution !== undefined) return undefined;
  if (approval.display !== undefined && approval.display !== 'decision') return undefined;
  const state =
    approval.approved === undefined
      ? 'approval-requested'
      : !approval.approved
        ? 'output-denied'
        : result === undefined
          ? 'approval-responded'
          : isError
            ? 'output-error'
            : 'output-available';
  return {
    type: 'dynamic-tool',
    toolName,
    toolCallId,
    state,
    input: args,
    output: result,
    approval: {
      id: approval.id,
      approved: approval.approved,
      reason: approval.reason,
      isAutomatic: approval.isAutomatic,
      requestReason: approval.prompt,
    },
  } as ToolPart;
}

export interface SignoffToolsOptions {
  /** Tools whose calls carry `{ files }` for a person to review. */
  review?: readonly string[] | undefined;
  /** Renders the other calls, those not waiting for (or answered with) an approval. Default: nothing. */
  Fallback?: ToolCallMessagePartComponent | undefined;
}

const withFallback = new WeakMap<ToolCallMessagePartComponent, ToolCallMessagePartComponent>();

/**
 * `components.tools` for `MessagePrimitive.Parts`: a `DiffReview` for the `review` tools, and for
 * every other call the approval card when it has an approval gate, else `Fallback`. The components
 * are the same on every call, so it can run on every render.
 */
export function signoffTools({ review = [], Fallback }: SignoffToolsOptions = {}): {
  by_name: Record<string, ToolCallMessagePartComponent>;
  Fallback: ToolCallMessagePartComponent;
} {
  let fallback: ToolCallMessagePartComponent = ApprovalToolUI;
  if (Fallback) {
    fallback = withFallback.get(Fallback) ?? approvalOr(Fallback);
    withFallback.set(Fallback, fallback);
  }
  return { by_name: Object.fromEntries(review.map((name) => [name, ReviewToolUI])), Fallback: fallback };
}

function approvalOr(Fallback: ToolCallMessagePartComponent): ToolCallMessagePartComponent {
  function SignoffToolOrFallback(props: ToolCallMessagePartProps) {
    return toToolPart(props) ? <ApprovalToolUI {...props} /> : <Fallback {...props} />;
  }
  return SignoffToolOrFallback;
}
