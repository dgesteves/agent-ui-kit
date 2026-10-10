What the components cost, where they slow down, and what they don't do yet. The numbers are measured from this repository; the commands that measure them are named next to each.

## Bundle size

What each import adds to an app's JavaScript, minified and gzipped. React and React DOM are left out, since the app has them; the kit's own dependencies are counted (react-markdown and remark-gfm, jsdiff, two Radix primitives, clsx and tailwind-merge). Rows share most of those, so two components together cost less than the sum of their rows.

| Import                                                             | Gzipped |
| ------------------------------------------------------------------ | ------: |
| `addUsage`, `estimateCost` from `/core` (for a route handler)      |  0.4 kB |
| `useAgUiAgent` from `/ag-ui`                                       |  2.8 kB |
| `applyHunks`, `parseFileChange` from `/core` (with jsdiff)         |  6.1 kB |
| `Sources`                                                          |  9.9 kB |
| `AgentStatus`                                                      | 10.7 kB |
| `RunMeter`                                                         | 11.9 kB |
| `ApprovalCard`                                                     | 14.5 kB |
| `ToolCallTimeline`                                                 | 19.4 kB |
| `DiffReview`                                                       | 28.3 kB |
| `AgentMessage` (markdown, reasoning, timeline, approvals, sources) | 78.0 kB |
| Everything in the main entry                                       | 96.9 kB |

Measured with `pnpm size`, which bundles each import from the built package with Rolldown and gzips it. CI runs it on every pull request, with a budget per row about 5% over its size. Most of `AgentMessage` is the markdown parser: `Markdown` alone is 63.5 kB.

`styles.css` adds 9.4 kB gzipped, 255 kB uncompressed. Most of that is the selector each rule carries so that it styles the components' own elements and never your content inside them. With Tailwind v4, `tailwind.css` adds the tokens, and your build generates only the utilities the components use.

## Known limitations

- **Large rewrites.** `DiffReview` diffs whole files on the main thread. Local edits are fast, but a fully rewritten file costs about 0.4 s at 2,000 lines and 2.5 s at 5,000. Long changed lines skip word-level highlights rather than stall.
- **Hunks, not lines.** A review accepts or rejects whole hunks. There is no line-level selection or inline comment to the agent yet.
- **Approvals are once.** An approval answers one call. "Always allow" or per-session rules are not in the card yet; automatic decisions come from your `toolApproval` rules on the server, and the card shows them as "Auto-approved" or "Blocked by policy".
- **Markdown cost while streaming.** The whole text is parsed again on every delta: about 8 ms at 5k characters, 24 ms at 20k and 67 ms at 50k (jsdom), so very long streamed answers can drop frames.
- **Citation numbering.** `[n]` markers are numbered over the message's sources after de-duplication by URL (by source id for documents). If your prompt numbers a list of sources that contains duplicates, markers after the first duplicate point one source early. Number unique sources in the prompt.
- **Run state comes from you.** Parts carry no signal that a run has ended, so tool calls left behind by `stop()` or an interrupted history read "Stopped" only when you pass `active={false}`. `deriveAgentState` reports such a run as `stopped`, which the quickstart's `active` condition covers.
- **Sub-agents render flat.** A sub-agent's calls show inline in its parent's timeline, not as a nested run.
- **English only.** Most labels are fixed English strings; a few, such as the approve and deny labels and the reason placeholder, are props.
- **Nesting in slots.** With `styles.css`, a component rendered in a slot of a component that is itself in a slot is styled up to two levels deep; deeper than that it renders unstyled.

## What's next

The next work is on review and approval:

- `DiffReview` for large files (a fallback past an edit length, a worker, virtualized hunks), line selection and inline comments sent back to the agent, per-file accept and "viewed", renamed and binary files, more context on demand, unified patch output, and a headless `useDiffReview`.
- Approval rules: once, always or for the session, scoped by tool or argument pattern; editing arguments before approving; approve all pending, with an audit trail; and a headless hook for AI SDK 7 `toolApproval`, AG-UI interrupts and the Agent Client Protocol's `request_permission`.
- Labels for every string, for other languages.
- Adapters: a documented assistant-ui binding, an AI Elements recipe, an Agent Client Protocol adapter, and AG-UI sub-agents as nested timelines.
