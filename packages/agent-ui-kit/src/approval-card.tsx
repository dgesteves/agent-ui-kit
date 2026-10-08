'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  getApprovalRequestReason,
  getApprovalStatus,
  getToolPartName,
  isAutomaticApproval,
  type ApprovalStatus,
  type ToolPart,
} from './lib/ai';
import { humanizeToolName } from './lib/format';
import { BanIcon, CheckIcon, ShieldIcon, TerminalIcon } from './lib/icons';
import { JsonView, Kbd, LiveRegion } from './lib/primitives';
import { useIsMac } from './lib/hooks';
import { cn, hasModifier, isPromiseLike, isTypingTarget, type HeadingLevel } from './lib/utils';
import type { RiskLevel, ToolMeta } from './tool-call-timeline';

export type { ApprovalStatus, RiskLevel };

export interface ApprovalCardProps extends Omit<ComponentPropsWithoutRef<'section'>, 'title' | 'children' | 'part'> {
  /** Name of the tool or action that needs approval. */
  toolName: string;
  /** Heading. Defaults to the humanized tool name. */
  title?: ReactNode;
  /** Why the agent wants to do this, e.g. the SDK's `approval.requestReason`. */
  description?: ReactNode;
  /** Arguments the action will run with. */
  input?: unknown;
  risk?: RiskLevel;
  /** Custom arguments preview. Defaults to a command line for `{ command }` inputs, else JSON. */
  preview?: ReactNode;
  /**
   * Default "pending". Approve and deny fire once: further presses (a double click, Y then N) are
   * ignored until `status` changes, the promise the handler returned settles, or the handler throws.
   */
  status?: ApprovalStatus;
  /** Reason recorded with the decision, shown once resolved. */
  reason?: string | undefined;
  /**
   * A policy, not a person, made the decision (the SDK's `approval.isAutomatic`): once resolved,
   * the card reads "Auto-approved" or "Blocked by policy" instead of "Approved" or "Denied".
   */
  automatic?: boolean;
  /** Fires once per decision: see `status`. May return a promise. */
  onApprove?: () => void | PromiseLike<void>;
  /** Fires once per decision: see `status`. May return a promise. */
  onDeny?: (reason?: string) => void | PromiseLike<void>;
  /** Y / N shortcuts while focus is inside the card. Default `true`. */
  shortcuts?: boolean;
  /** Also approve with ⌘/Ctrl+Enter from anywhere on the page while pending. Default `false`. */
  globalShortcut?: boolean;
  /** Move focus to the card when it mounts in the pending state. Default `false`. */
  autoFocus?: boolean;
  /** Offer an optional free-text reason when denying. Default `true`. */
  allowReason?: boolean;
  approveLabel?: string;
  denyLabel?: string;
  /** Heading level for the title, to fit your document outline. Default 3. */
  headingLevel?: HeadingLevel;
}

const RISK: Record<RiskLevel, { label: string; badge: string; card: string; icon: string }> = {
  low: {
    label: 'Low risk',
    badge: 'border-aui-border-strong text-aui-fg-muted',
    card: 'border-aui-border',
    icon: 'bg-aui-surface-2 text-aui-fg-muted',
  },
  medium: {
    label: 'Medium risk',
    badge: 'border-aui-warn/40 bg-aui-warn/10 text-aui-warn-fg',
    card: 'border-aui-warn/30',
    icon: 'bg-aui-warn/10 text-aui-warn-fg',
  },
  high: {
    label: 'High risk',
    badge: 'border-aui-hot/45 bg-aui-hot/10 text-aui-hot-fg',
    card: 'border-aui-hot/40',
    icon: 'bg-aui-hot/12 text-aui-hot-fg',
  },
  critical: {
    label: 'Critical',
    badge: 'border-aui-hot bg-aui-hot text-aui-on-hot',
    card: 'border-aui-hot/70 shadow-[0_0_0_3px_color-mix(in_oklab,var(--aui-hot)_14%,transparent)]',
    icon: 'bg-aui-hot/15 text-aui-hot-fg',
  },
};

function DefaultPreview({ input }: { input: unknown }) {
  if (input && typeof input === 'object' && 'command' in input && typeof input.command === 'string') {
    const cwd = 'cwd' in input && typeof input.cwd === 'string' ? input.cwd : undefined;
    return (
      <div className="border-aui-border bg-aui-bg/70 font-aui-mono overflow-x-auto rounded-lg border px-3 py-2.5 text-[13px] leading-5">
        {cwd && <div className="text-aui-fg-subtle mb-0.5 text-[11px]">{cwd}</div>}
        <div className="text-aui-fg whitespace-pre">
          <span aria-hidden="true" className="text-aui-accent-fg mr-2 select-none">
            $
          </span>
          {input.command}
        </div>
      </div>
    );
  }
  if (input === undefined) return null;
  return <JsonView value={input} label="Arguments" collapseAfter={14} />;
}

/**
 * Human-in-the-loop approval for a pending agent action. Shows what will run,
 * how risky it is, and lets the user approve or deny by mouse or keyboard.
 * Critical actions require a second confirming press.
 */
export function ApprovalCard({
  toolName,
  title,
  description,
  input,
  risk = 'medium',
  preview,
  status = 'pending',
  reason,
  automatic = false,
  onApprove,
  onDeny,
  shortcuts = true,
  globalShortcut = false,
  autoFocus = false,
  allowReason = true,
  approveLabel = 'Approve',
  denyLabel = 'Deny',
  headingLevel = 3,
  className,
  ...props
}: ApprovalCardProps) {
  const Heading = `h${headingLevel}` as const;
  const ids = useId();
  const titleId = `${ids}-title`;
  const descId = `${ids}-desc`;
  const hintId = `${ids}-hint`;
  const reasonId = `${ids}-reason`;
  const cardRef = useRef<HTMLElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reasonText, setReasonText] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = status === 'pending';
  const r = RISK[risk];
  const heading = title ?? humanizeToolName(toolName);
  const mac = useIsMac();
  const mod = mac ? '⌘' : 'Ctrl';

  // One decision per pending period, so a double click cannot send two (see `status`).
  const decided = useRef(false);
  useEffect(() => {
    decided.current = false;
  }, [status]);
  const decide = (handler: () => unknown) => {
    decided.current = true;
    let result: unknown;
    try {
      result = handler();
    } catch (error) {
      // A failed handler sent nothing: let the user try again.
      decided.current = false;
      throw error;
    }
    if (isPromiseLike(result)) {
      // Released when it settles either way; a rejection stays unhandled, as it would without the card.
      void Promise.resolve(result).finally(() => {
        decided.current = false;
      });
    }
  };

  const approve = () => {
    if (!pending || decided.current) return;
    if (risk === 'critical' && !confirming) {
      setConfirming(true);
      setAnnouncement('Critical action. Press approve again to confirm.');
      clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirming(false), 4000);
      return;
    }
    clearTimeout(confirmTimer.current);
    setAnnouncement('Approved');
    cardRef.current?.focus();
    decide(() => onApprove?.());
  };

  const deny = (withReason?: string) => {
    if (!pending || decided.current) return;
    setAnnouncement('Denied');
    cardRef.current?.focus();
    const reason = withReason?.trim() ? withReason.trim() : undefined;
    decide(() => onDeny?.(reason));
  };

  const openReason = () => setReasonOpen(true);
  useEffect(() => {
    if (reasonOpen) reasonRef.current?.focus();
  }, [reasonOpen]);

  useEffect(() => () => clearTimeout(confirmTimer.current), []);

  useEffect(() => {
    if (autoFocus && pending) cardRef.current?.focus();
    // Only on mount: re-focusing on every render would steal focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const approveRef = useRef(approve);
  useEffect(() => {
    approveRef.current = approve;
  });
  useEffect(() => {
    if (!globalShortcut || !pending) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.defaultPrevented) {
        event.preventDefault();
        approveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [globalShortcut, pending]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!pending || !shortcuts) return;
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      approve();
      return;
    }
    if (isTypingTarget(event.target) || hasModifier(event) || event.shiftKey) return;
    const key = event.key.toLowerCase();
    if (key === 'y') {
      event.preventDefault();
      approve();
    } else if (key === 'n') {
      event.preventDefault();
      deny();
    }
  };

  return (
    // Shortcuts are scoped to focus within the card (WCAG 2.1.4); the actions themselves are real buttons.
    <section
      ref={cardRef}
      data-aui
      data-slot="approval-card"
      data-status={status}
      data-risk={risk}
      tabIndex={-1}
      aria-labelledby={titleId}
      aria-describedby={
        pending
          ? [description ? descId : '', shortcuts ? hintId : ''].filter(Boolean).join(' ') || undefined
          : undefined
      }
      onKeyDown={onKeyDown}
      className={cn(
        'rounded-aui bg-aui-surface font-aui-sans text-aui-fg focus-visible:outline-aui-ring relative overflow-hidden border outline-none focus-visible:outline-2 focus-visible:outline-offset-2',
        pending ? r.card : 'border-aui-border bg-aui-surface/60',
        pending && 'motion-safe:animate-aui-enter',
        className,
      )}
      {...props}
    >
      <LiveRegion>{announcement}</LiveRegion>
      {pending ? (
        <>
          {(risk === 'high' || risk === 'critical') && (
            <div
              aria-hidden="true"
              className="via-aui-hot h-px w-full bg-gradient-to-r from-transparent to-transparent"
            />
          )}
          <div className="flex flex-col gap-3.5 p-4">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', r.icon)}
              >
                {input && typeof input === 'object' && 'command' in input ? (
                  <TerminalIcon size={16} />
                ) : (
                  <ShieldIcon size={16} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-aui-mono text-aui-hot-fg pt-0.5 text-[10.5px] font-medium tracking-[0.08em] uppercase">
                    Approval required
                  </p>
                  <span
                    className={cn(
                      'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
                      r.badge,
                    )}
                  >
                    {r.label}
                  </span>
                </div>
                <Heading id={titleId} className="text-aui-fg -mt-0.5 text-[15px] leading-snug font-semibold">
                  {heading}
                </Heading>
                {description && (
                  <p id={descId} className="text-aui-fg-muted mt-1 text-[13px] leading-relaxed">
                    {description}
                  </p>
                )}
              </div>
            </div>

            {preview ?? <DefaultPreview input={input} />}

            {reasonOpen && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={reasonId} className="text-aui-fg-muted text-xs font-medium">
                  Tell the agent why (optional)
                </label>
                <textarea
                  ref={reasonRef}
                  id={reasonId}
                  rows={2}
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  onKeyDown={(e) => {
                    // The Enter that commits an IME composition (Japanese, Chinese, Korean…) is not a submit.
                    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      deny(reasonText);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setReasonOpen(false);
                      cardRef.current?.focus();
                    }
                  }}
                  placeholder="e.g. Use the existing Redis client instead"
                  className="border-aui-border-strong bg-aui-bg text-aui-fg placeholder:text-aui-fg-subtle focus-visible:outline-aui-ring w-full resize-none rounded-lg border px-3 py-2 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-0"
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {shortcuts && (
                <p id={hintId} className="text-aui-fg-subtle mr-auto hidden items-center gap-1.5 text-xs sm:flex">
                  <span className="sr-only">Keyboard: press Y to approve, N to deny, or {mod} Enter to approve.</span>
                  <span aria-hidden="true" className="flex items-center gap-1.5">
                    <Kbd>{mod}</Kbd>
                    <Kbd>↵</Kbd>
                    <span>approve</span>
                  </span>
                </p>
              )}
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                {allowReason && !reasonOpen && (
                  <button
                    type="button"
                    onClick={openReason}
                    className="text-aui-fg-muted hover:text-aui-fg focus-visible:outline-aui-ring cursor-pointer rounded-md px-2 py-1.5 text-xs underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-1"
                  >
                    Deny with feedback
                  </button>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-slot="approval-deny"
                    aria-keyshortcuts={shortcuts ? 'N' : undefined}
                    onClick={() => deny(reasonOpen ? reasonText : undefined)}
                    className="border-aui-border-strong bg-aui-surface-2 text-aui-fg hover:border-aui-fg-subtle hover:bg-aui-bg focus-visible:outline-aui-ring inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    {reasonOpen ? 'Send denial' : denyLabel}
                    {shortcuts && !reasonOpen && <Kbd aria-hidden="true">N</Kbd>}
                  </button>
                  <button
                    type="button"
                    data-slot="approval-approve"
                    aria-keyshortcuts={shortcuts ? `Y ${mac ? 'Meta' : 'Control'}+Enter` : undefined}
                    onClick={approve}
                    className={cn(
                      'focus-visible:outline-aui-ring inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg px-3 text-[13px] font-semibold transition-[background-color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2',
                      confirming
                        ? 'bg-aui-hot text-aui-on-hot hover:bg-aui-hot/90'
                        : 'bg-aui-accent text-aui-on-accent hover:bg-aui-accent/90 shadow-[0_0_0_1px_color-mix(in_oklab,var(--aui-accent)_40%,transparent),0_6px_20px_-8px_var(--aui-accent)]',
                    )}
                  >
                    {confirming ? 'Confirm approval' : approveLabel}
                    {shortcuts && (
                      <Kbd aria-hidden="true" className="border-current/25 bg-transparent text-current/80">
                        Y
                      </Kbd>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px]">
          {status === 'approved' ? (
            <CheckIcon size={15} className="text-aui-accent-fg shrink-0" />
          ) : (
            <BanIcon size={15} className="text-aui-hot-fg shrink-0" />
          )}
          <span className="text-aui-fg font-semibold">
            {status === 'approved'
              ? automatic
                ? 'Auto-approved'
                : 'Approved'
              : automatic
                ? 'Blocked by policy'
                : 'Denied'}
          </span>
          <Heading id={titleId} className="text-aui-fg-muted min-w-0 truncate">
            {heading}
          </Heading>
          {reason && <span className="text-aui-fg-subtle min-w-0 truncate">· {reason}</span>}
        </div>
      )}
    </section>
  );
}

export interface ToolApprovalResponse {
  id: string;
  approved: boolean;
  reason?: string;
}

export interface ToolApprovalCardProps extends Omit<
  ApprovalCardProps,
  'toolName' | 'input' | 'status' | 'onApprove' | 'onDeny' | 'reason' | 'automatic'
> {
  part: ToolPart;
  /** Matches `useChat().addToolApprovalResponse`, so you can pass it directly. */
  onRespond: (response: ToolApprovalResponse) => void | PromiseLike<void>;
  meta?: ToolMeta | undefined;
}

/**
 * `ApprovalCard` bound to an AI SDK tool part in the approval flow. Renders nothing for parts without
 * one, or while a policy's automatic decision is still arriving: nobody needs to act on it.
 */
export function ToolApprovalCard({ part, onRespond, meta, risk, description, title, ...props }: ToolApprovalCardProps) {
  const status = getApprovalStatus(part);
  if (!status || !part.approval) return null;
  const automatic = isAutomaticApproval(part.approval);
  if (automatic && status === 'pending') return null;
  const approvalId = part.approval.id;
  const resolvedRisk = risk ?? (typeof meta?.risk === 'function' ? meta.risk(part.input) : meta?.risk);
  return (
    <ApprovalCard
      toolName={getToolPartName(part)}
      title={title ?? part.title ?? meta?.label}
      description={description ?? getApprovalRequestReason(part.approval)}
      input={part.input}
      risk={resolvedRisk}
      status={status}
      reason={part.approval.reason}
      automatic={automatic}
      onApprove={() => onRespond({ id: approvalId, approved: true })}
      onDeny={(reason) =>
        onRespond(reason ? { id: approvalId, approved: false, reason } : { id: approvalId, approved: false })
      }
      {...props}
    />
  );
}
