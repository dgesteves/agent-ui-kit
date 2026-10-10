---
'signoff-ui': minor
---

Labels: every word the components show or announce can be replaced, so the kit can be translated whole.

- **`SignoffLabelsProvider`** takes a translation of `defaultLabels`, whole or in part, for every component inside. Providers nest, the inner one winning key by key. Every component also takes a `labels` prop, which wins over the providers for it and what it renders. `useSignoffLabels()` returns the labels in effect, for markup of your own, and `mergeLabels()` builds them anywhere.
- **207 labels in twelve sections**, 140 strings and 67 functions: visible text, accessible names, live-region announcements, keyboard hints, titles and placeholders. Text built from values (counts, paths, line numbers, tool names) is a function, so a translation gets plurals and word order right; `format` holds how durations, token counts, cost and percentages read. Type a translation as `SignoffLabels` and the compiler lists what it misses. The docs have a complete one in Portuguese.
- `useDiffReview` and `useApprovalPolicy` take `labels` too, and `deriveAgentState` a `writingResponse` detail.
- Each component bundles the English of the sections it reads only: 0.2 to 1.5 kB gzipped more per import, 2.4 kB for the whole main entry.

Small changes that come with it:

- `Sources` is now a client module, as it reads the labels. It still renders from a Server Component: its props are data.
- The diff review's view toggle is named "Unified" and "Split", capitalized for screen readers too (before, only on screen).
