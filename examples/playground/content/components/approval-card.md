Human-in-the-loop approval with a command or argument preview, a risk level when you give one (without `risk`, no badge rather than a guess), and deny with feedback. Y and N work while focus is in the card; ⌘ or Ctrl + Enter approves, optionally page-wide. `critical` actions need a second, confirming press.

Each pending approval sends one decision: a double click, or Y then N, is ignored until `status` changes, the handler's promise settles or the handler throws. `ToolApprovalCard` binds the card to a tool part and to `addToolApprovalResponse`, including the denial reason, and renders nothing for calls that need no approval.

Decisions that a `toolApproval` rule makes on its own (`approval.isAutomatic`) never prompt or take focus, and read "Auto-approved" or "Blocked by policy" rather than as a person's decision. A custom `preview` is your content: with `styles.css`, the kit's rules don't reach into it.
