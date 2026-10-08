---
'@dgesteves/agent-ui-kit': patch
---

Depend on `@radix-ui/react-collapsible` and `@radix-ui/react-toggle-group`, the two Radix primitives the components use, instead of the `radix-ui` package, which installed about 60 Radix packages (18 now). The shadcn registry items list the same two packages.
