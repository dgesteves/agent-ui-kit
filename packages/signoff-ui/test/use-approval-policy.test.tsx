import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ApprovalRule } from '../src/lib/policy';
import { memoryRuleStorage, useApprovalPolicy, type ApprovalAuditEvent } from '../src/use-approval-policy';

const request = (command: string, id = `a-${command}`) => ({ id, toolName: 'run_command', input: { command } });

describe('useApprovalPolicy', () => {
  it('remembers session and always decisions as rules, and answers the next call from them', async () => {
    const audit: ApprovalAuditEvent[] = [];
    const { result } = renderHook(() => useApprovalPolicy({ onAudit: (e) => audit.push(e) }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    let outcome = result.current.decide(request('npm test'), 'allow-once');
    expect(outcome).toEqual({ id: 'a-npm test', approved: true, decision: 'allow-once', by: 'user', rule: undefined });
    expect(result.current.rules).toEqual([]);
    act(() => {
      outcome = result.current.decide(request('npm test --watch'), 'allow-session', { args: { command: 'npm test*' } });
    });
    expect(result.current.rules).toMatchObject([
      { tool: 'run_command', args: { command: 'npm test*' }, scope: 'session' },
    ]);
    expect(result.current.match('run_command', { command: 'npm test -- -u' })?.effect).toBe('allow');
    // A later call the rule covers is answered without anyone.
    expect(result.current.answer(request('npm test -- -u'))).toMatchObject({
      approved: true,
      decision: 'allow-session',
      by: 'rule',
    });
    expect(result.current.answer(request('npm publish'))).toBeUndefined();
    expect(result.current.outcomeOf('a-npm test -- -u')).toMatchObject({ by: 'rule' });
    expect(audit.map((e) => [e.type, 'by' in e ? e.by : undefined])).toEqual([
      ['decision', 'user'],
      ['rule-added', undefined],
      ['decision', 'user'],
      ['decision', 'rule'],
    ]);
  });

  it('denies from a deny rule with its reason, ahead of an allow rule', async () => {
    const { result } = renderHook(() => useApprovalPolicy());
    act(() => {
      result.current.decide(request('rm -rf dist'), 'allow-always');
      result.current.decide(request('rm -rf /'), 'deny-always', {
        args: { command: 'rm -rf /*' },
        reason: 'Never the root',
      });
    });
    expect(result.current.answer(request('rm -rf /home'))).toMatchObject({
      approved: false,
      decision: 'deny-always',
      reason: 'Never the root',
      by: 'rule',
    });
    expect(result.current.answer(request('rm -rf build'))).toMatchObject({ approved: true, decision: 'allow-always' });
  });

  it('answers the same request once, with the outcome it already gave', async () => {
    const onAudit = vi.fn();
    const { result } = renderHook(() =>
      useApprovalPolicy({ defaultRules: [{ id: 'r', tool: '*', effect: 'allow', scope: 'session' }], onAudit }),
    );
    const first = result.current.answer(request('ls', 'same'));
    expect(result.current.answer(request('ls', 'same'))).toBe(first);
    expect(onAudit).toHaveBeenCalledTimes(1);
  });

  it('saves always rules to the storage, never session ones, and loads them back', async () => {
    const storage = memoryRuleStorage();
    const save = vi.spyOn(storage, 'save');
    const first = renderHook(() => useApprovalPolicy({ storage }));
    act(() => {
      first.result.current.decide(request('npm ci'), 'allow-always');
      first.result.current.decide(request('npm test'), 'allow-session');
    });
    expect(save.mock.calls.at(-1)![0]).toHaveLength(1);
    expect(save.mock.calls.at(-1)![0][0]).toMatchObject({ scope: 'always' });
    first.unmount();
    const second = renderHook(() => useApprovalPolicy({ storage }));
    await waitFor(() => expect(second.result.current.ready).toBe(true));
    expect(second.result.current.rules).toMatchObject([{ scope: 'always' }]);
  });

  it('loads from an async storage, keeping default rules, and stays not ready until then', async () => {
    let resolve!: (rules: ApprovalRule[]) => void;
    const storage = { load: () => new Promise<ApprovalRule[]>((r) => (resolve = r)), save: vi.fn() };
    const preset: ApprovalRule = { id: 'preset', tool: 'read_file', effect: 'allow', scope: 'always' };
    const { result } = renderHook(() => useApprovalPolicy({ storage, defaultRules: [preset] }));
    expect(result.current.ready).toBe(false);
    expect(result.current.rules).toEqual([preset]);
    await act(async () => resolve([{ id: 'saved', tool: 'run_command', effect: 'deny', scope: 'always' }]));
    expect(result.current.ready).toBe(true);
    expect(result.current.rules.map((r) => r.id)).toEqual(['preset', 'saved']);
  });

  it('is ready after a storage that fails to load', async () => {
    const storage = { load: () => Promise.reject(new Error('offline')), save: vi.fn() };
    const { result } = renderHook(() => useApprovalPolicy({ storage }));
    await waitFor(() => expect(result.current.ready).toBe(true));
  });

  it('follows controlled rules, and reports changes', () => {
    const onRulesChange = vi.fn();
    const rules: ApprovalRule[] = [{ id: 'r', tool: 'run_command', effect: 'allow', scope: 'always' }];
    const { result, rerender } = renderHook(
      (props: { rules: ApprovalRule[] }) => useApprovalPolicy({ ...props, onRulesChange }),
      {
        initialProps: { rules },
      },
    );
    expect(result.current.match('run_command', {})?.rule.id).toBe('r');
    act(() => result.current.removeRule('r'));
    expect(onRulesChange).toHaveBeenLastCalledWith([]);
    // Still controlled: the rules are the caller's until it passes new ones.
    rerender({ rules });
    expect(result.current.rules).toEqual(rules);
  });

  it('adds and removes rules, and clears the session ones', () => {
    const audit: ApprovalAuditEvent[] = [];
    const { result } = renderHook(() => useApprovalPolicy({ onAudit: (e) => audit.push(e) }));
    act(() => {
      result.current.addRule({ id: 'a', tool: 'x', effect: 'allow', scope: 'always' });
      result.current.addRule({ id: 's', tool: 'y', effect: 'allow', scope: 'session' });
      // The same id replaces the rule.
      result.current.addRule({ id: 'a', tool: 'z', effect: 'allow', scope: 'always' });
    });
    expect(result.current.rules.map((r) => [r.id, r.tool])).toEqual([
      ['s', 'y'],
      ['a', 'z'],
    ]);
    act(() => result.current.clearSession());
    expect(result.current.rules.map((r) => r.id)).toEqual(['a']);
    act(() => {
      result.current.clearSession();
      result.current.removeRule('missing');
      result.current.removeRule('a');
    });
    expect(result.current.rules).toEqual([]);
    expect(audit.map((e) => e.type)).toEqual([
      'rule-added',
      'rule-added',
      'rule-added',
      'session-cleared',
      'rule-removed',
    ]);
  });
});
