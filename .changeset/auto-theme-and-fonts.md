---
'@dgesteves/agent-ui-kit': minor
---

Follow the OS color scheme with `@dgesteves/agent-ui-kit/theme.auto.css`, imported after `styles.css`, `tailwind.css` or `theme.css`: the dark palette applies while the OS is in dark mode, unless `.light` or `data-theme="light"` is on `<html>`. `.light` now switches a subtree back to the light palette, as `data-theme="light"` did. The components also use the app's own `--font-sans` and `--font-mono` when it defines them, as shadcn/ui and Tailwind v4 apps do, before falling back to Geist and the system fonts.
