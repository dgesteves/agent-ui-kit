import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AgentMessage } from '../src/agent-message';
import { ApprovalCard } from '../src/approval-card';
import { ToolCallDetails, ToolCallTimeline } from '../src/tool-call-timeline';
import { JsonView } from '../src/lib/primitives';
import { assistant, toolPart } from './utils';

// styles.css styles the kit's elements only. The app's own content inside a component sits in a
// `data-signoff-slot` element, which the stylesheet's rules stop at (scripts/kit-scope.mjs), and
// every component that can be rendered on its own has a `data-signoff` root, where they start again.
const slotOf = (el: HTMLElement) => el.parentElement?.closest('[data-signoff-slot]');

describe('slots for your content', () => {
  it("puts renderTool's and renderData's content in slots", () => {
    render(
      <AgentMessage
        message={assistant([
          toolPart('input-available', { toolCallId: 'r', toolName: 'review_changes' }),
          { type: 'data-note', id: 'n', data: { text: 'Saved' } },
        ])}
        renderTool={() => <p>Your review</p>}
        renderData={() => <p>Your note</p>}
      />,
    );
    expect(slotOf(screen.getByText('Your review'))).not.toBeNull();
    expect(slotOf(screen.getByText('Your note'))).not.toBeNull();
  });

  it("puts renderOutput's and renderExtra's content in slots", () => {
    render(
      <ToolCallTimeline
        parts={[toolPart('output-available', { toolCallId: 'o', toolName: 'read_file' })]}
        defaultExpanded={['o']}
        tools={{ read_file: { renderOutput: () => <p>Your output</p> } }}
        renderExtra={() => <p>Your extra</p>}
      />,
    );
    expect(slotOf(screen.getByText('Your output'))).not.toBeNull();
    expect(slotOf(screen.getByText('Your extra'))).not.toBeNull();
  });

  it('puts a custom approval preview in a slot, and keeps the default one the kit’s', () => {
    const { container, rerender } = render(<ApprovalCard toolName="run_command" preview={<p>Your preview</p>} />);
    expect(slotOf(screen.getByText('Your preview'))).not.toBeNull();
    rerender(<ApprovalCard toolName="run_command" input={{ command: 'pnpm i' }} />);
    expect(container.querySelector('[data-signoff-slot]')).toBeNull();
    expect(screen.getByText('pnpm i')).toBeInTheDocument();
  });

  it('keeps the labels and icons you pass styled as part of the component', () => {
    render(
      <ToolCallTimeline
        parts={[toolPart('output-available', { toolCallId: 'l', toolName: 'read_file' })]}
        tools={{ read_file: { label: 'Read', icon: <svg aria-label="file icon" />, summary: () => 'a.ts' } }}
      />,
    );
    expect(slotOf(screen.getByLabelText('file icon') as unknown as HTMLElement)).toBeNull();
    expect(slotOf(screen.getByText('a.ts'))).toBeNull();
  });

  it('gives the components you can render on their own a root', () => {
    const { container } = render(
      <>
        <JsonView value={{ a: 1 }} label="Output" />
        <ToolCallDetails part={toolPart('output-available', { toolCallId: 'd', toolName: 'read_file' })} />
      </>,
    );
    expect(container.querySelector('[data-slot="signoff-json-view"]')).toHaveAttribute('data-signoff');
    expect(container.querySelector('[data-slot="signoff-tool-call-details"]')).toHaveAttribute('data-signoff');
  });
});
