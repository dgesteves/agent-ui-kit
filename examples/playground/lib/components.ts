import { getAlias } from './api';

/*
 * One docs page per component: what this file can't read from the library. Props, types,
 * defaults, descriptions and styling hooks come from the package itself (lib/api.ts); the usage,
 * the keyboard and the accessibility notes are written here, from each component's implementation.
 */

export interface ApiEntry {
  /** The export, as a heading: `ApprovalCard`, or `useAgUiAgent`. */
  name: string;
  /** Its props interface, for a component. */
  props?: string;
  /** For a hook: the interfaces it takes and returns. */
  parameters?: string;
  returns?: string;
  /** Where its defaults are: the component and any it hands its props to. */
  defaults?: { file: string; functions: string[] };
}

export interface ComponentDoc {
  slug: string;
  /** The page title: the main export. */
  name: string;
  /** One sentence, for the sidebar search, the components grid and link previews. */
  summary: string;
  /** The section on the components page. */
  galleryId: string;
  /** The shadcn registry item. */
  item: string;
  /** The source file under packages/agent-ui-kit/src, for its styling hooks. */
  file: string;
  api: ApiEntry[];
  /** Types its props refer to, listed after the props. */
  types?: string[];
  imports: { npm: string; shadcn: string };
  /** Packages the app installs alongside the kit. */
  packages?: string[];
  usage: string;
  keyboard?: Array<{ keys: string[]; action: string }>;
  /** Markdown bullets: ARIA, focus, announcements. */
  accessibility: string[];
  /** What the component's state attributes hold: an exported type's name, or a few words. */
  stateTypes?: Record<string, string>;
}

const npm = (names: string, from = '@dgesteves/agent-ui-kit') => `import { ${names} } from '${from}';`;
const shadcn = (names: string, file: string) => `import { ${names} } from '@/components/agent-ui/${file}';`;

export const COMPONENTS: ComponentDoc[] = [
  {
    slug: 'agent-message',
    name: 'AgentMessage',
    summary: 'A whole assistant message: reasoning, streaming markdown, tool calls, approvals and sources.',
    galleryId: 'agent-message',
    item: 'agent-message',
    file: 'agent-message.tsx',
    stateTypes: { 'data-role': 'the message’s role: assistant, user or system' },
    api: [
      {
        name: 'AgentMessage',
        props: 'AgentMessageProps',
        defaults: { file: 'agent-message.tsx', functions: ['AgentMessage'] },
      },
    ],
    types: ['ToolMeta', 'ToolApprovalResponse'],
    imports: { npm: npm('AgentMessage'), shadcn: shadcn('AgentMessage', 'agent-message') },
    usage: `const { messages, status, addToolApprovalResponse } = useChat();
const last = messages.findLast((m) => m.role === 'assistant');

{last && (
  <AgentMessage
    message={last}
    streaming={status === 'streaming'}
    tools={{ run_command: { label: 'Run command', risk: 'high' } }}
    onToolApproval={addToolApprovalResponse}
  />
)}`,
    keyboard: [
      { keys: ['↑', '↓'], action: 'Move between tool calls in a timeline' },
      { keys: ['Y', 'N'], action: 'Approve or deny, with focus in an approval card' },
    ],
    accessibility: [
      'The message is an `<article>` with `aria-busy` while it streams, so screen readers wait for the text to settle.',
      'Each part keeps its own behavior: the tool timeline, approval cards, reasoning and sources below all apply.',
      'Images in model output don\'t load unless `allowedImageHosts` allows them; a blocked image is a link with its alt text, read as "Image:".',
      'Citation markers such as `[2]` become links named "Source 2" to the matching source.',
    ],
  },
  {
    slug: 'tool-call-timeline',
    name: 'ToolCallTimeline',
    summary: 'Every tool call with its state, a measured duration and a waterfall; errors inline.',
    galleryId: 'tool-call-timeline',
    item: 'tool-call-timeline',
    file: 'tool-call-timeline.tsx',
    api: [
      {
        name: 'ToolCallTimeline',
        props: 'ToolCallTimelineProps',
        defaults: { file: 'tool-call-timeline.tsx', functions: ['ToolCallTimeline'] },
      },
    ],
    types: ['ToolMeta', 'ToolTiming', 'RiskLevel'],
    imports: { npm: npm('ToolCallTimeline'), shadcn: shadcn('ToolCallTimeline', 'tool-call-timeline') },
    usage: `<ToolCallTimeline
  parts={message.parts}
  tools={{
    read_file: { label: 'Read file', summary: (input) => (input as { path?: string }).path },
    run_command: { label: 'Run command', risk: 'high' },
  }}
  // Once the run has ended, calls that never settled read "Stopped".
  active={status === 'submitted' || status === 'streaming'}
/>`,
    keyboard: [
      { keys: ['↑', '↓'], action: 'Previous or next call' },
      { keys: ['Home', 'End'], action: 'First or last call' },
      { keys: ['Enter', 'Space'], action: 'Show or hide the call’s input and output' },
    ],
    accessibility: [
      'An ordered list named by `label` ("Tool calls"). Each call is a disclosure button with `aria-expanded`, as in the WAI-ARIA accordion pattern; the arrow keys move between them.',
      'A call’s name, summary, state and duration are in its button’s accessible name. In narrow containers the summary is hidden visually but still read.',
      'Completions and failures are announced through a polite live region, such as "Read file finished in 1.2 seconds" or "Read file failed: ENOENT…". Calls that settle together, such as parallel calls, are announced together. Turn it off with `announce={false}` when something else announces them.',
      'The state node beside each call is hidden from screen readers: the call’s button already says "Needs approval", "Failed" or "Stopped".',
      'States are never color alone: each has an icon and a word ("Failed", "Needs approval", "Denied").',
      'The expand and collapse animation runs only without `prefers-reduced-motion`.',
    ],
    stateTypes: {
      'data-phase': 'ToolPhase',
      'data-state': 'ToolState',
      'data-interrupted': 'set once the run ended before the call settled',
    },
  },
  {
    slug: 'approval-card',
    name: 'ApprovalCard',
    summary: 'Human-in-the-loop approval: what will run, how risky it is, and deny with a reason.',
    galleryId: 'approval-card',
    item: 'approval-card',
    file: 'approval-card.tsx',
    api: [
      {
        name: 'ApprovalCard',
        props: 'ApprovalCardProps',
        defaults: { file: 'approval-card.tsx', functions: ['ApprovalCard'] },
      },
      {
        name: 'ToolApprovalCard',
        props: 'ToolApprovalCardProps',
        defaults: { file: 'approval-card.tsx', functions: ['ToolApprovalCard', 'ApprovalCard'] },
      },
    ],
    types: ['ToolApprovalResponse', 'RiskLevel', 'ApprovalStatus'],
    imports: {
      npm: npm('ApprovalCard, ToolApprovalCard'),
      shadcn: shadcn('ApprovalCard, ToolApprovalCard', 'approval-card'),
    },
    usage: `// Bound to an AI SDK tool part in the approval flow:
<ToolApprovalCard part={part} onRespond={addToolApprovalResponse} risk="high" autoFocus />

// Or on its own:
<ApprovalCard
  toolName="run_command"
  input={{ command: 'pnpm add @upstash/ratelimit' }}
  risk="high"
  onApprove={() => approve()}
  onDeny={(reason) => deny(reason)}
/>`,
    keyboard: [
      { keys: ['Y'], action: 'Approve' },
      { keys: ['N'], action: 'Deny' },
      { keys: ['⌘/Ctrl', '↵'], action: 'Approve (page-wide with `globalShortcut`)' },
      { keys: ['Esc'], action: 'Close the reason field and return to the card' },
    ],
    accessibility: [
      'A group named by its title and described by its description and a visually hidden line that spells out the shortcuts. It is not a landmark, so a run with many approvals doesn’t fill landmark navigation; pass `role="region"` to make it one.',
      'Y and N only work while focus is inside the card, with no modifier and not while typing, which keeps them within WCAG 2.1.4. The buttons carry `aria-keyshortcuts`.',
      '`critical` actions need a second press within four seconds, and say so: "Critical action. Press approve again to confirm."',
      'Deciding announces "Approved" or "Denied" and moves focus to the card, so it isn’t lost when the buttons go away; the announcement then clears, so the decided card reads its outcome once. `autoFocus` puts focus on a card that arrives pending.',
      'Each pending approval sends one decision: a double click, or Y then N, is ignored until `status` changes or the handler’s promise settles.',
      'The risk level is spelled out, not shown by color alone, and only when you give one: without `risk` the card shows none rather than guessing. `headingLevel` fits the title into your outline.',
    ],
    stateTypes: { 'data-status': 'ApprovalStatus', 'data-risk': 'RiskLevel' },
  },
  {
    slug: 'diff-review',
    name: 'DiffReview',
    summary: 'Accept or reject an agent’s edits hunk by hunk, across files, and get the patched files back.',
    galleryId: 'diff-review',
    item: 'diff-review',
    file: 'diff-review.tsx',
    api: [
      {
        name: 'DiffReview',
        props: 'DiffReviewProps',
        defaults: { file: 'diff-review.tsx', functions: ['DiffReview'] },
      },
    ],
    types: ['FileChange', 'DiffReviewResult', 'DiffReviewFileResult', 'HunkDecision', 'DiffViewMode'],
    imports: { npm: npm('DiffReview'), shadcn: shadcn('DiffReview', 'diff-review') },
    usage: `<DiffReview
  files={[{ path: 'app/api/chat/route.ts', oldContent, newContent }]}
  // Each file comes back with only the accepted hunks applied.
  onSubmit={(result) => addToolOutput({ tool: 'review_changes', toolCallId, output: result })}
/>`,
    keyboard: [
      { keys: ['J', 'K'], action: 'Next or previous hunk (↓ and ↑ too, from a hunk)' },
      { keys: ['A'], action: 'Accept the hunk, and move to the next undecided one' },
      { keys: ['R'], action: 'Reject the hunk, and move on (X works too)' },
      { keys: ['U'], action: 'Reset the hunk' },
      { keys: ['⇧A', '⇧R'], action: 'Accept or reject every hunk' },
      { keys: ['⌘/Ctrl', '↵'], action: 'Apply the review' },
    ],
    accessibility: [
      'A `<section>` named by its title. Hunks use a roving tabindex, so the whole review is one tab stop that J, K and the arrows move through.',
      'Each hunk is a group named like "Hunk 2 of 4, app/api/chat/route.ts, lines 12 to 20, accepted".',
      'Every shortcut is also a button: "Accept hunk 2", "Reject hunk 2" and "Reset hunk 2" with `aria-pressed`, the layout toggle and Apply. Shortcuts only work while focus is inside the review.',
      'Progress is announced: "Hunk 2 of 4 accepted. 2 remaining."',
      'Changed lines keep their + and − glyphs and are read as "Added:" or "Removed:", so cyan and magenta never carry the meaning alone.',
    ],
    stateTypes: { 'data-decision': 'HunkDecision' },
  },
  {
    slug: 'run-meter',
    name: 'RunMeter',
    summary: 'Tokens, estimated cost from your rates, time to first token and the prompt-cache hit rate.',
    galleryId: 'run-meter',
    item: 'run-meter',
    file: 'run-meter.tsx',
    stateTypes: { 'data-variant': "'compact' | 'expanded'" },
    api: [
      { name: 'RunMeter', props: 'RunMeterProps', defaults: { file: 'run-meter.tsx', functions: ['RunMeter'] } },
      { name: 'useRunTiming', returns: 'RunTiming' },
    ],
    types: ['ModelPricing', 'RunUsage'],
    imports: {
      npm: npm('RunMeter, useRunTiming'),
      shadcn: `${shadcn('RunMeter', 'run-meter')}\nimport { useRunTiming } from '@/components/agent-ui/lib/hooks';`,
    },
    usage: `// A run starts with each user message and spans its approval round trips.
const timing = useRunTiming(status, messages);

<RunMeter
  variant="expanded"
  usage={last?.metadata?.usage}
  pricing={{ input: 2.5, cachedInput: 0.25, output: 10 }} // USD per million tokens
  ttftMs={timing.ttftMs}
  durationMs={timing.activeMs}
  live={status === 'streaming'}
/>`,
    accessibility: [
      'The compact strip is a group named "Run metrics" with one visually hidden sentence, such as "20.9k input tokens, 255 output tokens, estimated cost $0.025, …", instead of a run of loose numbers.',
      'The expanded card has a heading (`title`, at `headingLevel`) and a labelled token breakdown list.',
      'Numbers tween as they change, except with `prefers-reduced-motion`.',
    ],
  },
  {
    slug: 'agent-status',
    name: 'AgentStatus',
    summary: 'The run’s state in one pill, announced to screen readers.',
    galleryId: 'agent-status',
    item: 'agent-status',
    file: 'agent-status.tsx',
    api: [
      {
        name: 'AgentStatus',
        props: 'AgentStatusProps',
        defaults: { file: 'agent-status.tsx', functions: ['AgentStatus'] },
      },
    ],
    types: ['AgentState'],
    imports: {
      npm: npm('AgentStatus, deriveAgentState'),
      shadcn: `${shadcn('AgentStatus', 'agent-status')}\nimport { deriveAgentState } from '@/components/agent-ui/lib/ai';`,
    },
    usage: `const last = messages.findLast((m) => m.role === 'assistant');
// Waiting on a person (an approval, or a client-side tool in pendingClientTools) wins over "working".
// A run that ended with text still streaming or a call unfinished, as stop() leaves it, is "stopped";
// a client-side tool the app runs itself (onToolCall), named in clientTools, reads "working" instead.
const { state, detail } = deriveAgentState({
  status,
  message: last,
  pendingClientTools: ['review_changes'],
  clientTools: ['get_location'],
});

<AgentStatus state={state} detail={detail} />`,
    accessibility: [
      'Changes are announced through a live region, debounced by 350 ms so quick flips aren’t read one by one. Approvals and errors are assertive; everything else is polite.',
      'Render one `AgentStatus` per run with `announce` on; pass `announce={false}` to any copy, or the state is read twice.',
      'Each state has an icon and a word. The thinking shimmer and the spinner run only without `prefers-reduced-motion`.',
    ],
    stateTypes: { 'data-state': 'AgentState' },
  },
  {
    slug: 'sources',
    name: 'Sources',
    summary: 'Citations as numbered chips or cards, linked from `[n]` markers in the answer.',
    galleryId: 'sources',
    item: 'sources',
    file: 'sources.tsx',
    stateTypes: { 'data-variant': "'chips' | 'cards'" },
    api: [{ name: 'Sources', props: 'SourcesProps', defaults: { file: 'sources.tsx', functions: ['Sources'] } }],
    types: ['SourceItem'],
    imports: {
      npm: npm('Sources, getSourceParts'),
      shadcn: `${shadcn('Sources', 'sources')}\nimport { getSourceParts } from '@/components/agent-ui/lib/ai';`,
    },
    usage: `// Send them from the server with toUIMessageStreamResponse({ sendSources: true }).
<Sources sources={getSourceParts(message.parts)} variant="cards" />`,
    accessibility: [
      'An ordered list named by `label` ("Sources"), not a landmark, so a long conversation doesn’t flood landmark navigation.',
      'Links open in a new tab and say so to screen readers: "(opens in a new tab)".',
      'Each item has the id `${idPrefix}-${n}`, which `[n]` citation links in `Markdown` and `AgentMessage` point to.',
      "It has no state and no `'use client'`, so it renders in Server Components too.",
    ],
  },
  {
    slug: 'markdown',
    name: 'Markdown',
    summary:
      'Streaming-safe GFM: unterminated syntax closed while streaming, no raw HTML, images only from hosts you allow.',
    galleryId: 'markdown',
    item: 'markdown',
    file: 'markdown.tsx',
    api: [{ name: 'Markdown', props: 'MarkdownProps', defaults: { file: 'markdown.tsx', functions: ['Markdown'] } }],
    imports: { npm: npm('Markdown'), shadcn: shadcn('Markdown', 'markdown') },
    usage: `<Markdown streaming={part.state === 'streaming'} citations={sources.length}>
  {part.text}
</Markdown>`,
    accessibility: [
      'Raw HTML in model output is never rendered, and links and images with `javascript:` or `data:` URLs are stripped.',
      'Images load only from `allowedImageHosts`. Others render as a link with their alt text, read as "Image:", and nothing is requested.',
      '`[n]` markers up to `citations` become links named "Source n".',
      'The streaming caret is hidden from screen readers.',
    ],
  },
  {
    slug: 'reasoning',
    name: 'Reasoning',
    summary: 'The model’s reasoning: open while it thinks, then one line, "Thought for 3.2s".',
    galleryId: 'reasoning',
    item: 'reasoning',
    file: 'reasoning.tsx',
    stateTypes: { 'data-streaming': 'set while the model is thinking' },
    api: [
      { name: 'Reasoning', props: 'ReasoningProps', defaults: { file: 'reasoning.tsx', functions: ['Reasoning'] } },
    ],
    imports: { npm: npm('Reasoning'), shadcn: shadcn('Reasoning', 'reasoning') },
    usage: `<Reasoning text={part.text} streaming={part.state === 'streaming'} />`,
    keyboard: [{ keys: ['Enter', 'Space'], action: 'Show or hide the reasoning' }],
    accessibility: [
      'A disclosure: the summary is a button with `aria-expanded`, and the text is the region it controls.',
      'It opens on its own while the model thinks and closes when it finishes, unless the reader opened or closed it themselves.',
      'The open and close animation runs only without `prefers-reduced-motion`.',
    ],
  },
  {
    slug: 'use-ag-ui-agent',
    name: 'useAgUiAgent',
    summary: 'An AG-UI agent’s run as AI SDK messages, status, usage and approvals, for the same components.',
    galleryId: 'ag-ui',
    item: 'ag-ui',
    file: 'use-ag-ui-agent.ts',
    api: [{ name: 'useAgUiAgent', parameters: 'AgUiAgentLike', returns: 'UseAgUiAgentResult' }],
    types: ['AgUiInterrupt', 'AgUiApprovalResponse', 'AgUiResumeEntry'],
    imports: {
      npm: npm('useAgUiAgent', '@dgesteves/agent-ui-kit/ag-ui'),
      shadcn: shadcn('useAgUiAgent', 'use-ag-ui-agent'),
    },
    packages: ['@ag-ui/client'],
    usage: `const agent = new HttpAgent({ url: '/api/agent' }); // once, outside the component

function AgentRun() {
  const { messages, status, usage, step, respond } = useAgUiAgent(agent);
  const last = messages.findLast((m) => m.role === 'assistant');
  const { state, detail } = deriveAgentState({ status, message: last });
  return (
    <>
      <AgentStatus state={state} detail={step ?? detail} />
      {last && <AgentMessage message={last} onToolApproval={respond} />}
      <RunMeter usage={usage} />
    </>
  );
}`,
    accessibility: [
      'A hook with no markup of its own: the components it feeds carry the behavior on their pages.',
      'A tool-call interrupt becomes an approval card with the same keyboard and announcements as an AI SDK approval.',
    ],
  },
];

export function getComponent(slug: string) {
  return COMPONENTS.find((c) => c.slug === slug);
}

export const componentHref = (slug: string) => `/docs/components/${slug}`;

/** A state attribute's values: an exported type spelled out, or the note written for it. */
export function stateValues(component: ComponentDoc, attribute: string) {
  const value = component.stateTypes?.[attribute];
  if (!value) return undefined;
  return /^[A-Z]\w+$/.test(value) ? getAlias(value).type : value;
}
