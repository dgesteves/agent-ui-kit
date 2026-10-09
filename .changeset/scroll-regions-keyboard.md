---
'@dgesteves/agent-ui-kit': patch
---

Content that scrolls sideways is now reachable from the keyboard: a diff hunk's code, a code block or table in `Markdown`, an approval card's command preview and the compact `RunMeter` strip. While their content is wider than they are, they join the tab order as named groups ("Hunk 2 code, app/api/chat/route.ts", "Code, ts"), so the arrow keys scroll them, with a visible focus ring; once everything fits, they add no tab stop. Fixes axe's `scrollable-region-focusable` (WCAG 2.1.1).
