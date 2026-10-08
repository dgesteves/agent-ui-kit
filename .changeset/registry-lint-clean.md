---
'@dgesteves/agent-ui-kit': patch
---

The shadcn registry items lint clean under a new Next.js app's ESLint config, so apps that run `next lint`/`eslint --max-warnings=0` pass after `shadcn add`: no unused `_node` bindings in `markdown.tsx`, no `jsx-a11y` disable comments that such configs report as unused, and no `@next/next/no-img-element` warnings for the images in messages.
