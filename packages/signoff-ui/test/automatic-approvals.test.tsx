import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { convertToModelMessages, jsonSchema, readUIMessageStream, streamText, tool, type UIMessage } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { AgentMessage } from '../src/agent-message';
import { deriveAgentState, getToolPhase } from '../src/lib/ai';
import { ToolCallTimeline } from '../src/tool-call-timeline';
import { AI_SDK_MAJOR, toolPart } from './utils';

/** Every intermediate message useChat would render for a run whose approvals a policy decides. */
async function policyRun() {
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: new ReadableStream({
        start(c) {
          c.enqueue({ type: 'stream-start', warnings: [] });
          c.enqueue({ type: 'tool-call', toolCallId: 'c_ls', toolName: 'run_command', input: '{"command":"ls"}' });
          c.enqueue({
            type: 'tool-call',
            toolCallId: 'c_rm',
            toolName: 'run_command',
            input: '{"command":"rm -rf /"}',
          });
          c.enqueue({
            type: 'finish',
            finishReason: { unified: 'tool-calls', raw: undefined },
            usage: {
              inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 1, text: 1, reasoning: 0 },
            },
          });
          c.close();
        },
      }),
    }),
  });
  const tools = {
    run_command: tool({
      inputSchema: jsonSchema<{ command: string }>({ type: 'object', properties: { command: { type: 'string' } } }),
      execute: async () => 'ok',
    }),
  };
  const messages: UIMessage[] = [{ id: 'u', role: 'user', parts: [{ type: 'text', text: 'go' }] }];
  const stream = streamText({
    model,
    messages: await convertToModelMessages(messages, { tools }),
    tools,
    // No human involved: safe commands run, destructive ones are blocked.
    toolApproval: {
      run_command: (input) => (input.command === 'ls' ? 'approved' : { type: 'denied', reason: 'Destructive command' }),
    },
  }).toUIMessageStream({ originalMessages: messages });
  const snapshots: UIMessage[] = [];
  for await (const message of readUIMessageStream({ stream })) snapshots.push(message);
  return snapshots;
}

// `toolApproval` policies and the V4 mock models are AI SDK 7.
describe.skipIf(AI_SDK_MAJOR < 7)('approvals decided automatically by a policy', () => {
  it('never shows an approval prompt, steals focus or reports a wait on the user', async () => {
    const snapshots = await policyRun();
    // The SDK streams a policy decision as a request (isAutomatic) followed by its response.
    expect(
      snapshots.some((m) =>
        m.parts.some((p) => 'state' in p && p.state === 'approval-requested' && p.approval?.isAutomatic),
      ),
    ).toBe(true);
    for (const message of snapshots) {
      expect(deriveAgentState({ status: 'streaming', message }).state).not.toBe('awaiting-approval');
      render(<AgentMessage message={message} onToolApproval={() => {}} approvalProps={{ autoFocus: true }} />);
      expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
      expect(screen.queryByText('Needs approval')).toBeNull();
      expect(document.activeElement).toBe(document.body);
      cleanup();
    }
  });

  it('labels the outcome as a policy decision, not a human one', async () => {
    const snapshots = await policyRun();
    render(<AgentMessage message={snapshots.at(-1)!} onToolApproval={() => {}} />);
    const [ls, rm] = screen.getAllByRole('group');
    expect(ls).toHaveTextContent('Auto-approved');
    expect(rm).toHaveTextContent('Blocked by policy');
    expect(rm).toHaveTextContent('Destructive command');
    expect(within(ls!).queryByText('Approved')).toBeNull();
    expect(within(rm!).queryByText('Denied')).toBeNull();
    const denied = screen.getAllByRole('button', { name: /Run command/ })[1]!;
    await userEvent.click(denied);
    const details = denied.closest('li')!;
    expect(within(details).getByText(/Blocked by policy/, { selector: 'p' })).toHaveTextContent(
      'Blocked by policy: Destructive command',
    );
    expect(within(details).queryByText(/by user/)).toBeNull();
  });

  it('keeps human decisions labelled as such', async () => {
    render(
      <ToolCallTimeline
        parts={[toolPart('output-denied', { toolCallId: 'h' })]}
        defaultExpanded={['h']}
        announce={false}
      />,
    );
    expect(screen.getByText(/Denied by user/)).toBeInTheDocument();
  });

  it('maps a pending automatic decision to running rather than awaiting approval', () => {
    const part = toolPart('approval-requested', { approval: { id: 'a', isAutomatic: true } });
    expect(getToolPhase(part)).toBe('running');
    expect(getToolPhase(toolPart('approval-requested'))).toBe('awaiting-approval');
  });
});
