'use client';

import { useEffect, useRef, useState } from 'react';
import {
  decisionEffect,
  evaluateRules,
  ruleFromDecision,
  type ApprovalDecision,
  type ApprovalRequest,
  type ApprovalRule,
  type RuleMatch,
} from './lib/policy';
import { approvalPolicyLabels, type SignoffLabelsInput } from './lib/labels';
import { useLabels } from './labels';

/** The labels' sections this module reads. */
const LABELS = { approvalPolicy: approvalPolicyLabels };

export type { ApprovalDecision, ApprovalRequest, ApprovalRule, RuleMatch } from './lib/policy';

/** Where `always` rules are kept between visits. Session rules are never saved. */
export interface ApprovalRuleStorage {
  load(): readonly ApprovalRule[] | PromiseLike<readonly ApprovalRule[]>;
  save(rules: readonly ApprovalRule[]): void | PromiseLike<void>;
}

/** Rules kept in memory, for this page only: the default. */
export function memoryRuleStorage(initial: readonly ApprovalRule[] = []): ApprovalRuleStorage {
  let rules = [...initial];
  return {
    load: () => rules,
    save: (next) => {
      rules = [...next];
    },
  };
}

/**
 * Rules kept in `localStorage` (or another `Storage`) as JSON under `key`. A rule's `when` is code
 * and is not kept. Nothing is read or written on the server.
 */
export function webStorageRules(
  key = 'signoff-ui:approval-rules',
  storage: () => Storage | undefined = () => (typeof window === 'undefined' ? undefined : window.localStorage),
): ApprovalRuleStorage {
  return {
    load() {
      try {
        const text = storage()?.getItem(key);
        const parsed: unknown = text ? JSON.parse(text) : [];
        return Array.isArray(parsed) ? (parsed as ApprovalRule[]).filter(isRule) : [];
      } catch {
        return [];
      }
    },
    save(rules) {
      try {
        // JSON leaves out a rule's `when`, which is code.
        storage()?.setItem(key, JSON.stringify(rules));
      } catch {
        // Full or blocked storage: the rules still hold for this page.
      }
    },
  };
}

function isRule(value: unknown): value is ApprovalRule {
  if (!value || typeof value !== 'object') return false;
  const rule = value as Partial<ApprovalRule>;
  return (
    typeof rule.id === 'string' &&
    typeof rule.tool === 'string' &&
    (rule.effect === 'allow' || rule.effect === 'deny') &&
    (rule.scope === 'session' || rule.scope === 'always') &&
    (rule.args === undefined ||
      (typeof rule.args === 'object' && Object.values(rule.args).every((v) => typeof v === 'string')))
  );
}

/** Everything the policy did, for an audit trail. */
export type ApprovalAuditEvent =
  | {
      type: 'decision';
      at: number;
      request: ApprovalRequest;
      decision: ApprovalDecision;
      /** A person decided, or one of the rules did. */
      by: 'user' | 'rule';
      /** The rule that decided, or the one this decision made. */
      rule?: ApprovalRule | undefined;
      reason?: string | undefined;
      /** The arguments as approved, when the person edited them. */
      input?: unknown;
    }
  | { type: 'rule-added' | 'rule-removed'; at: number; rule: ApprovalRule }
  | { type: 'session-cleared'; at: number; rules: ApprovalRule[] };

/** A decision, ready to send: `approved` and `reason` for the agent, the rest for your app. */
export interface ApprovalOutcome {
  id: string;
  approved: boolean;
  reason?: string | undefined;
  /** The arguments to run with, when the person edited them. */
  input?: unknown;
  decision: ApprovalDecision;
  by: 'user' | 'rule';
  rule?: ApprovalRule | undefined;
}

export interface UseApprovalPolicyOptions {
  /** Controlled rules. */
  rules?: readonly ApprovalRule[] | undefined;
  /** Rules to start with, before any the storage loads. */
  defaultRules?: readonly ApprovalRule[] | undefined;
  onRulesChange?: ((rules: ApprovalRule[]) => void) | undefined;
  /** Where `always` rules are loaded from and saved to. Default: memory, for this page. */
  storage?: ApprovalRuleStorage | undefined;
  /** Every decision, rule added or removed, and session cleared, as it happens. */
  onAudit?: ((event: ApprovalAuditEvent) => void) | undefined;
  /**
   * Words to use instead of the English defaults: the reason a deny rule without one of its own
   * sends (`labels.approvalPolicy.ruleDenial`). See `SignoffLabelsProvider`.
   */
  labels?: SignoffLabelsInput | undefined;
}

export interface ApprovalPolicy {
  rules: readonly ApprovalRule[];
  /** The storage has loaded: after the first render, or once an async storage's promise settles. */
  ready: boolean;
  /** The rule that decides a call, if one does. */
  match(toolName: string, input: unknown): RuleMatch | undefined;
  /**
   * Record a person's decision and the rule it leaves (for session and always decisions, over the
   * call's `args` when given, else every call of the tool), and return it ready to send.
   */
  decide(
    request: ApprovalRequest,
    decision: ApprovalDecision,
    options?: { reason?: string | undefined; input?: unknown; args?: Record<string, string> | undefined },
  ): ApprovalOutcome;
  /** Answer a request from the rules, if one matches, recorded as decided by that rule. */
  answer(request: ApprovalRequest): ApprovalOutcome | undefined;
  /** How an answered request was decided, by its id: by a person or by which rule. */
  outcomeOf(id: string): ApprovalOutcome | undefined;
  addRule(rule: ApprovalRule): void;
  removeRule(id: string): void;
  /** Forget the session rules. */
  clearSession(): void;
}

/**
 * Approval rules, held for the page: once, for the session or always, scoped by tool and by
 * argument patterns, deny winning over allow. Pass the policy to `ToolApprovalCard`, `AgentMessage`
 * or `ToolApprovalBatch`, and they offer the choices, answer what a rule already decides, and record
 * the rest. Persistence is pluggable: `always` rules go to `storage`, session rules stay in memory.
 */
export function useApprovalPolicy({
  rules: rulesProp,
  defaultRules = [],
  onRulesChange,
  storage: storageProp,
  onAudit,
  labels,
}: UseApprovalPolicyOptions = {}): ApprovalPolicy {
  const ruleDenial = useLabels(LABELS, labels).approvalPolicy.ruleDenial;
  const [fallbackStorage] = useState(() => memoryRuleStorage());
  const storage = storageProp ?? fallbackStorage;
  // The storage is read after the first render, on the client: a server render and the hydrating
  // client then agree, whatever is stored.
  const [own, setOwn] = useState<readonly ApprovalRule[]>(defaultRules);
  const [ready, setReady] = useState(false);
  const rules = rulesProp ?? own;
  // The latest rules for handlers that run before a re-render, such as two answers in one tick.
  const latest = useRef(rules);
  useEffect(() => {
    latest.current = rules;
  }, [rules]);
  const outcomes = useRef(new Map<string, ApprovalOutcome>());

  // Loaded once, from the storage the policy started with: an inline storage object (a new one on
  // every render) does not reload it. Saves go to the current one.
  const [loadFrom] = useState(storage);
  useEffect(() => {
    let live = true;
    const apply = (loaded: readonly ApprovalRule[]) => {
      if (!live) return;
      setOwn((current) => merge(current, loaded));
      setReady(true);
    };
    const loaded = loadFrom.load();
    if (isThenable(loaded)) loaded.then(apply, () => live && setReady(true));
    else apply(loaded);
    return () => {
      live = false;
    };
  }, [loadFrom]);

  const audit = (event: ApprovalAuditEvent) => onAudit?.(event);
  const setRules = (next: ApprovalRule[]) => {
    latest.current = next;
    if (rulesProp === undefined) setOwn(next);
    onRulesChange?.(next);
    void storage.save(next.filter((r) => r.scope === 'always'));
  };

  const record = (outcome: ApprovalOutcome) => {
    outcomes.current.set(outcome.id, outcome);
    return outcome;
  };

  return {
    rules,
    ready,
    match: (toolName, input) => evaluateRules(latest.current, toolName, input),
    decide(request, decision, { reason, input, args } = {}) {
      const rule = ruleFromDecision(decision, request, { args, reason });
      if (rule) {
        setRules([...latest.current, rule]);
        audit({ type: 'rule-added', at: Date.now(), rule });
      }
      const { approved } = decisionEffect(decision);
      audit({
        type: 'decision',
        at: Date.now(),
        request,
        decision,
        by: 'user',
        rule,
        ...(reason ? { reason } : {}),
        ...(input !== undefined ? { input } : {}),
      });
      return record({
        id: request.id,
        approved,
        ...(reason ? { reason } : {}),
        ...(input !== undefined ? { input } : {}),
        decision,
        by: 'user',
        rule,
      });
    },
    answer(request) {
      const known = outcomes.current.get(request.id);
      if (known) return known;
      const match = evaluateRules(latest.current, request.toolName, request.input);
      if (!match) return undefined;
      const decision: ApprovalDecision =
        match.effect === 'allow' ? (match.rule.scope === 'session' ? 'allow-session' : 'allow-always') : 'deny-always';
      const reason = match.effect === 'deny' ? (match.rule.reason ?? ruleDenial) : undefined;
      audit({ type: 'decision', at: Date.now(), request, decision, by: 'rule', rule: match.rule, reason });
      return record({
        id: request.id,
        approved: match.effect === 'allow',
        ...(reason ? { reason } : {}),
        decision,
        by: 'rule',
        rule: match.rule,
      });
    },
    outcomeOf: (id) => outcomes.current.get(id),
    addRule(rule) {
      setRules([...latest.current.filter((r) => r.id !== rule.id), rule]);
      audit({ type: 'rule-added', at: Date.now(), rule });
    },
    removeRule(id) {
      const rule = latest.current.find((r) => r.id === id);
      if (!rule) return;
      setRules(latest.current.filter((r) => r.id !== id));
      audit({ type: 'rule-removed', at: Date.now(), rule });
    },
    clearSession() {
      const session = latest.current.filter((r) => r.scope === 'session');
      if (session.length === 0) return;
      setRules(latest.current.filter((r) => r.scope !== 'session'));
      audit({ type: 'session-cleared', at: Date.now(), rules: session });
    },
  };
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return !!value && typeof (value as { then?: unknown }).then === 'function';
}

/** Rules from both lists, the later one winning for an id that repeats. */
function merge(first: readonly ApprovalRule[], second: readonly ApprovalRule[]): ApprovalRule[] {
  const byId = new Map(first.map((r) => [r.id, r]));
  for (const rule of second) byId.set(rule.id, rule);
  return [...byId.values()];
}
