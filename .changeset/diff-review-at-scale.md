---
'signoff-ui': minor
---

`DiffReview` stays responsive on large files. A 5,000-line rewrite used to block the page for 3.3 s, leave 260,000 elements and take 77 ms per keypress; it is now ready in under 0.3 s, with no task over 60 ms, about 4,000 elements and under 1 ms per keypress (Chrome, Apple M1 Max).

- **A limit on the diff.** `maxEditLength` (default 2,000 lines added plus removed) caps the diff, whose cost grows with the square of that number. Past it, the changed region (from its first changed line to its last) is one hunk that replaces it, with no word-level highlights, and the review says so; `ParsedFileDiff.fallback` is `'replace'` and the file carries `data-fallback="replace"`. `parseFileChange` takes the same option, and `DEFAULT_MAX_EDIT_LENGTH` is exported from `signoff-ui/core`. The common lines before and after the change are set aside before diffing, so only the changed region counts, and lines only added or only removed never fall back.
- **A worker.** A file that needs more than 300 edits is diffed in a worker and reads "Comparing changes…" until it is done; Apply and the bulk buttons wait for it. Webpack 5, Next.js (webpack and Turbopack) and Vite emit the package's worker as they build. The new `diffWorker` prop takes a function that starts your own `Worker`, or `false`; without a working worker, files are diffed on the main thread after the first paint. A server render diffs what a render may and shows the rest as being compared, so hydration matches.
- **Only what is near the screen.** A review with more than 400 rows renders, of each hunk, the rows near the viewport; the rest keep their height and their lines as visually hidden text, so screen readers and find-in-page still have every line, read with "Added:" and "Removed:". Hunks always render, so focus, J and K and their names do not change, and a decision re-renders only the hunks it touches.

Where two diffs are equally small, hunks can now differ from jsdiff's own: the region between the common first and last lines is what gets diffed. The edits are as few as before, and `applyHunks` gives the same files.
