'use client';

import { useState } from 'react';
import {
  describeRule,
  ToolApprovalBatch,
  ToolApprovalCard,
  useApprovalPolicy,
  type ApprovalAuditEvent,
  type ToolApprovalResponse,
  type ToolPart,
} from 'signoff-ui';

const CALLS = ['npm test', 'npm test -- --watch', 'npm ci', 'rm -rf build'];

let next = 0;

/** A tool part as the AI SDK streams one that asks for approval. */
function ask(command: string): ToolPart {
  const id = `call-${++next}`;
  return {
    type: 'tool-run_command',
    toolCallId: id,
    state: 'approval-requested',
    input: { command },
    approval: { id: `approval-${id}` },
  } as ToolPart;
}

/** What the SDK does with an answer: the part, approved or denied. */
function answer(part: ToolPart, response: ToolApprovalResponse): ToolPart {
  return {
    ...part,
    state: response.approved ? 'approval-responded' : 'output-denied',
    approval: { id: response.id, approved: response.approved, reason: response.reason },
  } as ToolPart;
}

/**
 * The agent asks to run commands; you answer once, for this session or always. The next call a
 * rule covers is answered without asking, and every decision is in the audit trail.
 */
export function UseApprovalPolicyDemo() {
  const [parts, setParts] = useState<ToolPart[]>([]);
  const [log, setLog] = useState<ApprovalAuditEvent[]>([]);
  const policy = useApprovalPolicy({ onAudit: (event) => setLog((all) => [event, ...all].slice(0, 6)) });
  const respond = (response: ToolApprovalResponse) =>
    setParts((all) => all.map((p) => (p.approval?.id === response.id ? answer(p, response) : p)));
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-fg-muted text-xs">The agent asks to run</span>
          {CALLS.map((command) => (
            <button
              key={command}
              type="button"
              onClick={() => setParts((all) => [...all, ask(command)])}
              className="border-line text-fg-soft hover:text-fg focus-visible:outline-cyan-soft cursor-pointer rounded-md border px-2 py-0.5 font-mono text-xs focus-visible:outline-2"
            >
              {command}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setParts((all) => [...all, ask('npm test'), ask('npm run lint')])}
            className="border-line text-fg-soft hover:text-fg focus-visible:outline-cyan-soft cursor-pointer rounded-md border px-2 py-0.5 text-xs focus-visible:outline-2"
          >
            two at once
          </button>
        </div>
        <ToolApprovalBatch parts={parts} onRespond={respond} policy={policy} />
        {parts
          .slice()
          .reverse()
          .map((part) => (
            <ToolApprovalCard key={part.toolCallId} part={part} onRespond={respond} policy={policy} />
          ))}
        {parts.length === 0 && <p className="text-fg-subtle text-xs">Pick a command above to see its approval.</p>}
      </div>
      <aside className="flex flex-col gap-3 text-xs">
        <div>
          <h3 className="text-fg mb-1.5 font-medium">Rules</h3>
          {policy.rules.length === 0 ? (
            <p className="text-fg-subtle">None yet: answer for this session or always.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {policy.rules.map((rule) => (
                <li key={rule.id} className="border-line flex items-start gap-2 rounded-md border px-2 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className={rule.effect === 'allow' ? 'text-cyan-soft' : 'text-magenta-soft'}>
                      {rule.effect === 'allow' ? 'Allow' : 'Deny'}
                    </span>{' '}
                    <span className="text-fg-soft font-mono break-all">{describeRule(rule)}</span>
                    <span className="text-fg-subtle"> · {rule.scope}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => policy.removeRule(rule.id)}
                    className="text-fg-muted hover:text-fg focus-visible:outline-cyan-soft cursor-pointer rounded px-1 focus-visible:outline-2"
                  >
                    Remove<span className="sr-only"> the rule {describeRule(rule)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-fg mb-1.5 font-medium">Audit trail</h3>
          <ol className="text-fg-muted flex flex-col gap-1 font-mono text-[11px]">
            {log.map((event, i) => (
              <li key={`${event.at}-${i}`}>
                {event.type === 'decision'
                  ? `${event.by === 'rule' ? 'rule' : 'you'}: ${event.decision} · ${String((event.request.input as { command?: string })?.command ?? '')}`
                  : event.type === 'session-cleared'
                    ? 'session cleared'
                    : `${event.type}: ${describeRule(event.rule)}`}
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}
