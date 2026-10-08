import { createRequire } from 'node:module';
import type { DynamicToolUIPart, UIMessage } from 'ai';
import { vi } from 'vitest';
import { configureAxe } from 'vitest-axe';
import type { ToolPart } from '../src/lib/ai';

/** Major version of the installed AI SDK; CI also runs the suite against AI SDK 6. */
export const AI_SDK_MAJOR = Number(
  (createRequire(import.meta.url)('ai/package.json') as { version: string }).version.split('.')[0],
);

/**
 * axe in jsdom cannot compute colors or layout, so color-contrast is covered by
 * the token contrast test instead. `region` is a page-level rule.
 */
export const axe = configureAxe({
  rules: {
    'color-contrast': { enabled: false },
    region: { enabled: false },
  },
});

type State = ToolPart['state'];

/** Build a tool part in any AI SDK v7 state. */
export function toolPart(
  state: State,
  overrides: Partial<Record<string, unknown>> & { toolName?: string; toolCallId?: string } = {},
): ToolPart {
  const { toolName = 'search_docs', toolCallId = `call_${state}`, ...rest } = overrides;
  const base = { type: `tool-${toolName}`, toolCallId, input: { query: 'streaming ui' } } as Record<string, unknown>;
  switch (state) {
    case 'input-streaming':
      Object.assign(base, { state, input: { query: 'stream' } });
      break;
    case 'input-available':
      Object.assign(base, { state });
      break;
    case 'approval-requested':
      Object.assign(base, {
        state,
        approval: { id: `approval_${toolCallId}`, requestReason: 'Installs packages from npm' },
      });
      break;
    case 'approval-responded':
      Object.assign(base, { state, approval: { id: `approval_${toolCallId}`, approved: true } });
      break;
    case 'output-available':
      Object.assign(base, { state, output: { results: [{ title: 'Streaming UI', score: 0.92 }] } });
      break;
    case 'output-error':
      Object.assign(base, { state, errorText: 'ENOENT: no such file or directory' });
      break;
    case 'output-denied':
      Object.assign(base, {
        state,
        approval: { id: `approval_${toolCallId}`, approved: false, reason: 'Not on main' },
      });
      break;
  }
  return { ...base, ...rest } as unknown as ToolPart;
}

export function dynamicToolPart(): DynamicToolUIPart {
  return {
    type: 'dynamic-tool',
    toolName: 'mcp_fetch',
    toolCallId: 'call_dynamic',
    state: 'output-available',
    input: { url: 'https://example.com' },
    output: 'ok',
  };
}

export function assistant(parts: UIMessage['parts'], id = 'msg_1'): UIMessage {
  return { id, role: 'assistant', parts };
}

/**
 * Run `fn` while collecting the errors that event handlers throw (React reports them on `window`)
 * and unhandled promise rejections, instead of letting them fail the test run.
 */
export async function collectErrors(fn: () => Promise<void>) {
  const reported: unknown[] = [];
  const rejected: unknown[] = [];
  const onError = (event: ErrorEvent) => {
    event.preventDefault();
    reported.push(event.error);
  };
  const onRejection = (reason: unknown) => rejected.push(reason);
  const listeners = process.listeners('unhandledRejection');
  process.removeAllListeners('unhandledRejection');
  process.on('unhandledRejection', onRejection);
  window.addEventListener('error', onError);
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await fn();
    // Node reports unhandled rejections once the microtask queue has drained.
    await new Promise((resolve) => setTimeout(resolve, 10));
  } finally {
    consoleError.mockRestore();
    window.removeEventListener('error', onError);
    process.off('unhandledRejection', onRejection);
    for (const listener of listeners) process.on('unhandledRejection', listener);
  }
  return { reported, rejected };
}
