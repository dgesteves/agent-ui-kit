What the components cost, where they slow down, and what they don't do yet. The numbers are measured from this repository; the commands that measure them are named next to each.

## Bundle size

What each import adds to an app's JavaScript, minified and gzipped. React and React DOM are left out, since the app has them; the kit's own dependencies are counted (react-markdown and remark-gfm, jsdiff, two Radix primitives, clsx and tailwind-merge). Rows share most of those, so two components together cost less than the sum of their rows.

| Import                                                             |  Gzipped |
| ------------------------------------------------------------------ | -------: |
| `addUsage`, `estimateCost` from `/core` (for a route handler)      |   0.4 kB |
| `toToolApproval` from `/core` (approval rules in a route handler)  |   0.9 kB |
| `useApprovalPolicy` (the rules without markup)                     |   1.9 kB |
| `useAgUiAgent` from `/ag-ui`                                       |   2.9 kB |
| `applyHunks`, `parseFileChange` from `/core` (with jsdiff)         |   6.6 kB |
| `Sources`                                                          |  10.3 kB |
| `AgentStatus`                                                      |  11.2 kB |
| `RunMeter`                                                         |  12.5 kB |
| `useDiffReview` (the review without markup)                        |  15.4 kB |
| `ApprovalCard`                                                     |  18.4 kB |
| `ToolCallTimeline`                                                 |  20.1 kB |
| `DiffReview`                                                       |  41.2 kB |
| `AgentMessage` (markdown, reasoning, timeline, approvals, sources) |  83.0 kB |
| Everything in the main entry                                       | 116.8 kB |

Measured with `pnpm size`, which bundles each import from the built package with Rolldown and gzips it. CI runs it on every pull request, with a budget per row about 5% over its size. Most of `AgentMessage` is the markdown parser: `Markdown` alone is 64.0 kB. Each component carries the English labels of the sections it reads, not the others.

`DiffReview`'s diff worker is a separate file the bundler emits, loaded only when a file is too large to diff while rendering: 18 kB minified, with jsdiff, in a Vite build.

`styles.css` adds 9.9 kB gzipped, 269 kB uncompressed. Most of that is the selector each rule carries so that it styles the components' own elements and never your content inside them. With Tailwind v4, `tailwind.css` adds the tokens, and your build generates only the utilities the components use.

## Large diffs

`DiffReview` on large files, in Chrome with React's production build, on an Apple M1 Max. Ready is when every file is compared and on screen; the longest task is the longest the page could not respond; the keypress is one decision from the keyboard.

| Case                             | First render |  Ready | Longest task | DOM elements | Keypress |
| -------------------------------- | -----------: | -----: | -----------: | -----------: | -------: |
| Local edits, 1,000 lines         |        56 ms |  56 ms |        69 ms |        4,442 |   3.4 ms |
| Local edits, 5,000 lines         |        77 ms |  78 ms |        93 ms |        5,305 |   6.4 ms |
| Full rewrite, 2,000 lines        |        16 ms | 241 ms |         none |        3,833 |   0.9 ms |
| Full rewrite, 5,000 lines        |        17 ms | 265 ms |        53 ms |        4,073 |   0.9 ms |
| Full rewrite, 5,000 lines, split |        17 ms | 283 ms |        68 ms |        7,322 |   1.2 ms |

Measured with `pnpm perf`, which CI runs on every pull request with a budget per case, several times these numbers so shared runners pass. Before these changes a 5,000-line rewrite blocked the page for 3.3 s, left 260,000 elements and took 77 ms per keypress. Three things keep it fast:

- **A limit on the diff.** Diffing costs about the square of the lines added plus removed. Past `maxEditLength` (2,000 by default, about 0.2 s), the changed region, from its first changed line to its last, becomes one hunk that replaces it, and the review says so. Lines only added or only removed never count against it, nor do unchanged lines before and after the region.
- **A worker.** A file that needs more than 300 edits is diffed in a worker, and shows "Comparing changes…" until it is done; smaller ones are diffed while rendering, on the server too. Webpack 5, Next.js (webpack or Turbopack) and Vite emit the worker without configuration. Where none is available, or `diffWorker={false}`, the file is diffed on the main thread after the first paint: the 5,000-line rewrite then blocks for about 0.17 s.
- **Only what is near the screen.** A review with more than 400 rows renders, of each hunk, the rows within about 800 px of what is visible, also inside a scrolling chat panel. The others keep their height, and their lines as visually hidden text, so a screen reader and find-in-page still have every line. Hunks always render, so focus, J and K, and their names are the same.

## Known limitations

- **Large rewrites.** A file changed in more places than `maxEditLength` is reviewed as one hunk that replaces the changed region, without word-level highlights; raise the limit to compare it line by line, at the square of the cost. Long changed lines skip word-level highlights rather than stall.
- **Lines are commented on, not decided.** A review accepts or rejects whole hunks, or whole files. Lines can be selected to comment on, and the agent gets the comment with its lines, but a hunk cannot be applied in part.
- **Patches without binaries.** `toPatch()` lists an accepted binary file as changed, without its contents, so `git apply` cannot apply that part; the file's own `content` in the result has it, when you passed contents.
- **Edited arguments and signed approvals.** With AI SDK 7's `experimental_toolApprovalSecret`, the server signs the arguments it asked about and refuses any other, so arguments edited before approving fail there by design. ACP's `request_permission` has no way to answer with edited arguments, nor a session option: `allow-session` answers `allow_once` and keeps the session rule on the client.
- **Rules from the client.** Rules made in the browser are that person's choices. `toToolApproval` can apply them on the server, for that person's runs only; rules that protect other people belong on the server.
- **Markdown cost while streaming.** The whole text is parsed again on every delta: about 8 ms at 5k characters, 24 ms at 20k and 67 ms at 50k (jsdom), so very long streamed answers can drop frames.
- **Citation numbering.** `[n]` markers are numbered over the message's sources after de-duplication by URL (by source id for documents). If your prompt numbers a list of sources that contains duplicates, markers after the first duplicate point one source early. Number unique sources in the prompt.
- **Run state comes from you.** Parts carry no signal that a run has ended, so tool calls left behind by `stop()` or an interrupted history read "Stopped" only when you pass `active={false}`. `deriveAgentState` reports such a run as `stopped`, which the quickstart's `active` condition covers.
- **Sub-agents render flat.** A sub-agent's calls show inline in its parent's timeline, not as a nested run.
- **Words for the agent stay English.** Every word a person sees or hears is a [label](/docs/labels), but what goes to the model (`reviewToolOutput`'s summary, `toToolApproval`'s reasons) is English. Right-to-left layouts have not been tested.
- **Nesting in slots.** With `styles.css`, a component rendered in a slot of a component that is itself in a slot is styled up to two levels deep; deeper than that it renders unstyled.

## What's next

The next work is on review and approval:

- Adapters: an AI Elements recipe, an Agent Client Protocol adapter, and AG-UI sub-agents as nested timelines.
