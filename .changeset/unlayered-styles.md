---
'@dgesteves/agent-ui-kit': patch
---

`styles.css` works in Tailwind v3 apps and next to global resets. It no longer wraps its rules in `@layer`, which Tailwind v3 builds rejected ("`@layer base` is used but no matching `@tailwind base` directive is present") and which let any unlayered reset, such as create-next-app's `* { padding: 0; margin: 0 }`, strip the components' spacing. Its rules, Tailwind's theme variables included, now apply only to the kit's own elements, so it cannot restyle the app or override the app's Tailwind theme. The layered stylesheet is still available as `styles.layered.css`, and the components' line height no longer depends on the page's.
