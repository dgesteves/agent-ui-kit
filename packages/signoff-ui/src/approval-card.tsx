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
import { useScrollRegion } from './lib/scroll-region';
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
  /** How risky the action is, shown as a badge. Without it the card shows no risk level. */
  risk?: RiskLevel | undefined;
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
  /** Placeholder of the reason field. Default "What should the agent do instead?". */
  reasonPlaceholder?: string;
  approveLabel?: string;
  denyLabel?: string;
  /** Heading level for the title, to fit your document outline. Default 3. */
  headingLevel?: HeadingLevel;
}

/** No risk given: no badge, and the card's neutral colors. */
const UNRATED = { card: 'border-signoff-border', icon: 'bg-signoff-surface-2 text-signoff-fg-muted' };

const RISK: Record<RiskLevel, { label: string; badge: string; card: string; icon: string }> = {
  low: {
    label: 'Low risk',
    badge: 'border-signoff-border-strong text-signoff-fg-muted',
    card: 'border-signoff-border',
    icon: 'bg-signoff-surface-2 text-signoff-fg-muted',
  },
  medium: {
    label: 'Medium risk',
    badge: 'border-signoff-warn/40 bg-signoff-warn/10 text-signoff-warn-fg',
    card: 'border-signoff-warn/30',
    icon: 'bg-signoff-warn/10 text-signoff-warn-fg',
  },
  high: {
    label: 'High risk',
    badge: 'border-signoff-hot/45 bg-signoff-hot/10 text-signoff-hot-fg',
    card: 'border-signoff-hot/40',
    icon: 'bg-signoff-hot/12 text-signoff-hot-fg',
  },
  critical: {
    label: 'Critical',
    badge: 'border-signoff-hot bg-signoff-hot text-signoff-on-hot',
    card: 'border-signoff-hot/70 shadow-[0_0_0_3px_color-mix(in_oklab,var(--signoff-hot)_14%,transparent)]',
    icon: 'bg-signoff-hot/15 text-signoff-hot-fg',
  },
};

/** A long command scrolls sideways; while it does, the keyboard can reach it. */
function CommandPreview({ command, cwd }: { command: string; cwd: string | undefined }) {
  const scrollRef = useScrollRegion<HTMLDivElement>('Command');
  return (
    <div
      ref={scrollRef}
      className="border-signoff-border bg-signoff-bg/70 font-signoff-mono focus-visible:outline-signoff-ring overflow-x-auto rounded-lg border px-3 py-2.5 text-[13px] leading-5 focus-visible:outline-2 focus-visible:outline-offset-1"
    >
      {cwd && <div className="text-signoff-fg-subtle mb-0.5 text-[11px]">{cwd}</div>}
      <div className="text-signoff-fg whitespace-pre">
        <span aria-hidden="true" className="text-signoff-accent-fg mr-2 select-none">
          $
        </span>
        {command}
      </div>
    </div>
  );
}

function DefaultPreview({ input }: { input: unknown }) {
  if (input && typeof input === 'object' && 'command' in input && typeof input.command === 'string') {
    const cwd = 'cwd' in input && typeof input.cwd === 'string' ? input.cwd : undefined;
    return <CommandPreview command={input.command} cwd={cwd} />;
  }
  if (input === undefined) return null;
  return <JsonView value={input} label="Arguments" collapseAfter={14} />;
}

/** How long a decision stays in the live region: long enough to be read, then gone from the card. */
const ANNOUNCEMENT_MS = 3000;

/**
 * Human-in-the-loop approval for a pending agent action. Shows what will run,
 * how risky it is, and lets the user approve or deny by mouse or keyboard.
 * Critical actions require a second confirming press.
 *
 * The card is a group named by its title, not a landmark, so a run with many approvals doesn't
 * fill landmark navigation; pass `role="region"` to make it one.
 */
export function ApprovalCard({
  toolName,
  title,
  description,
  input,
  risk,
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
  reasonPlaceholder = 'What should the agent do instead?',
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
  const r = risk ? RISK[risk] : UNRATED;
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

  // Once read, clear the announcement: left in place, a decided card reads "Approved, Approved".
  useEffect(() => {
    if (!announcement) return;
    const id = setTimeout(() => setAnnouncement(''), ANNOUNCEMENT_MS);
    return () => clearTimeout(id);
  }, [announcement]);

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
      data-signoff
      data-slot="signoff-approval-card"
      data-status={status}
      data-risk={risk}
      role="group"
      tabIndex={-1}
      aria-labelledby={titleId}
      aria-describedby={
        pending
          ? [description ? descId : '', shortcuts ? hintId : ''].filter(Boolean).join(' ') || undefined
          : undefined
      }
      onKeyDown={onKeyDown}
      className={cn(
        'rounded-signoff bg-signoff-surface font-signoff-sans text-signoff-fg focus-visible:outline-signoff-ring relative overflow-hidden border outline-none focus-visible:outline-2 focus-visible:outline-offset-2',
        pending ? r.card : 'border-signoff-border bg-signoff-surface/60',
        pending && 'motion-safe:animate-signoff-enter',
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
              className="via-signoff-hot h-px w-full bg-gradient-to-r from-transparent to-transparent"
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
                  <p className="font-signoff-mono text-signoff-hot-fg pt-0.5 text-[10.5px] font-medium tracking-[0.08em] uppercase">
                    Approval required
                  </p>
                  {risk && (
                    <span
                      className={cn(
                        'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
                        RISK[risk].badge,
                      )}
                    >
                      {RISK[risk].label}
                    </span>
                  )}
                </div>
                <Heading id={titleId} className="text-signoff-fg -mt-0.5 text-[15px] leading-snug font-semibold">
                  {heading}
                </Heading>
                {description && (
                  <p id={descId} className="text-signoff-fg-muted mt-1 text-[13px] leading-relaxed">
                    {description}
                  </p>
                )}
              </div>
            </div>

            {preview ?? <DefaultPreview input={input} />}

            {reasonOpen && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={reasonId} className="text-signoff-fg-muted text-xs font-medium">
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
                  placeholder={reasonPlaceholder}
                  className="border-signoff-border-strong bg-signoff-bg text-signoff-fg placeholder:text-signoff-fg-subtle focus-visible:outline-signoff-ring w-full resize-none rounded-lg border px-3 py-2 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-0"
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {shortcuts && (
                <p id={hintId} className="text-signoff-fg-subtle mr-auto hidden items-center gap-1.5 text-xs sm:flex">
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
                    className="text-signoff-fg-muted hover:text-signoff-fg focus-visible:outline-signoff-ring cursor-pointer rounded-md px-2 py-1.5 text-xs underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-1"
                  >
                    Deny with feedback
                  </button>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-slot="signoff-approval-deny"
                    aria-keyshortcuts={shortcuts ? 'N' : undefined}
                    onClick={() => deny(reasonOpen ? reasonText : undefined)}
                    className="border-signoff-border-strong bg-signoff-surface-2 text-signoff-fg hover:border-signoff-fg-subtle hover:bg-signoff-bg focus-visible:outline-signoff-ring inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    {reasonOpen ? 'Send denial' : denyLabel}
                    {shortcuts && !reasonOpen && <Kbd aria-hidden="true">N</Kbd>}
                  </button>
                  <button
                    type="button"
                    data-slot="signoff-approval-approve"
                    aria-keyshortcuts={shortcuts ? `Y ${mac ? 'Meta' : 'Control'}+Enter` : undefined}
                    onClick={approve}
                    className={cn(
                      'focus-visible:outline-signoff-ring inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg px-3 text-[13px] font-semibold transition-[background-color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2',
                      confirming
                        ? 'bg-signoff-hot text-signoff-on-hot hover:bg-signoff-hot/90'
                        : 'bg-signoff-accent text-signoff-on-accent hover:bg-signoff-accent/90 shadow-[0_0_0_1px_color-mix(in_oklab,var(--signoff-accent)_40%,transparent),0_6px_20px_-8px_var(--signoff-accent)]',
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
            <CheckIcon size={15} className="text-signoff-accent-fg shrink-0" />
          ) : (
            <BanIcon size={15} className="text-signoff-hot-fg shrink-0" />
          )}
          <span className="text-signoff-fg font-semibold">
            {status === 'approved'
              ? automatic
                ? 'Auto-approved'
                : 'Approved'
              : automatic
                ? 'Blocked by policy'
                : 'Denied'}
          </span>
          <Heading id={titleId} className="text-signoff-fg-muted min-w-0 truncate">
            {heading}
          </Heading>
          {reason && <span className="text-signoff-fg-subtle min-w-0 truncate">· {reason}</span>}
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
