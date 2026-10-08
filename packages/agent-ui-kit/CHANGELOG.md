# @dgesteves/agent-ui-kit

## 0.2.0

### Minor Changes

- [#2](https://github.com/dgesteves/agent-ui-kit/pull/2) [`bc48aed`](https://github.com/dgesteves/agent-ui-kit/commit/bc48aeda21fe85f3b033a69741aed61a2c376d59) Thanks [@dgesteves](https://github.com/dgesteves)! - Support AI SDK 6. The `ai` peer range is now `^6.0.0 || ^7.0.102`, and CI runs the typecheck and the full test suite against AI SDK 6.0.0 and the latest 6.x as well as 7. The kit reads the two approval fields AI SDK 7 added (`approval.isAutomatic` for `toolApproval` policy decisions, and `approval.requestReason`) only when they are present, so on AI SDK 6 approvals are always a person's decision and the card falls back to your `description`. Policies, and the "Auto-approved" and "Blocked by policy" labels, remain AI SDK 7 features.
