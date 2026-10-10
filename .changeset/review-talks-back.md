---
'signoff-ui': minor
---

`DiffReview` now talks back: the reviewer comments on lines and hunks, decides whole files and marks them viewed, and the agent gets all of it.

- **Line selection and comments.** Shift with the up or down arrow selects lines in the focused hunk; a click on a line number does too, and Shift-click extends it. C comments on the selected lines, or on the whole hunk when none are. ⌘/Ctrl+Enter saves the comment and Escape cancels. Comments are controlled with `comments`, `defaultComments` and `onCommentsChange`. Each comment has its file, its line range (`side`, `startLine`, `endLine`) and its text.
- **A result the agent acts on.** `onSubmit` still gets each file with only the accepted hunks applied. Each file now also has its `decision` (`accepted`, `rejected`, `partial`, `pending` or `unchanged`), `status`, `viewed` and `oldPath`. The result adds `rejectedHunks`, with their lines, and `comments`, with the lines they are on. A second argument gives `toPatch()`: the accepted changes as a git-style unified diff. `reviewToolOutput(result)` shapes the result for the model as an AI SDK tool output: a summary sentence, counts, decisions, rejected hunks and comments, with contents or a patch. `reviewResumeEntry(interruptId, result)` is the same as an AG-UI resume entry. The quickstart now sends `reviewToolOutput(review)`.
- **Files.** A multi-file review lists its files in a navigator: one tab stop, with the arrows, Home and End. Each file has Accept file and Reject file buttons, also on Alt+A and Alt+R, and a Viewed checkbox, also on V, which folds the file away (`collapseViewed`) and moves on. `viewed`, `defaultViewed` and `onViewedChange` control the marks, and Shift+J and Shift+K move between files.
- **Renamed and binary files.** A renamed file shows its old path. Binary files (a NUL in the contents, a binary patch, or `binary: true`) read "Binary file, not shown". Renames without changes and files created or deleted empty are decided as a whole too, under the id `${path}:file`.
- **Context.** Unchanged lines between hunks can be shown, 20 at a time or all at once, from the bar between hunks or with E.
- **`useDiffReview`.** The review without its markup: state, keyboard, result and prop getters, for teams with their own design system. `DiffReview` is built on it, and it is a registry item of its own (`use-diff-review`).

Behaviour that changes. A binary file, a rename without changes, or a file created or deleted empty used to show "No textual changes." with nothing to decide. Each now counts as one decision in the totals, in Apply's label and in the result's `pending` until decided. Items are named "Change 5 of 6, …" for whole files and "Hunk 2 of 6, …" for hunks. Contents with a NUL character are no longer diffed as text.
