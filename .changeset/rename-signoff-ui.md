---
'signoff-ui': minor
---

**`@dgesteves/agent-ui-kit` is now `signoff-ui`.** This is its first release under the new name. The components, their props and their behavior are the same; the names around them changed, so they no longer collide with assistant-ui, which also uses `data-aui` and `--aui-`:

- **Package:** `npm uninstall @dgesteves/agent-ui-kit && npm i signoff-ui`. The entry points keep their shape: `signoff-ui/core`, `signoff-ui/ag-ui`, `signoff-ui/styles.css`, `signoff-ui/tailwind.css` and the rest.
- **CSS variables:** `--aui-*` is `--signoff-*` (`--signoff-bg`, `--signoff-accent`, `--signoff-radius` …).
- **Tailwind:** the utilities and theme variables follow, `bg-aui-bg` to `bg-signoff-bg`, `rounded-aui` to `rounded-signoff`, `--color-aui-*` to `--color-signoff-*`, and the keyframes are `signoff-*`.
- **Attributes:** component roots have `data-signoff` instead of `data-aui`, and every `data-slot` value starts with `signoff-` (`signoff-approval-card`, `signoff-diff-hunk` …).
- **shadcn registry:** the namespace is `@signoff-ui`, and items install into `components/signoff-ui/`. The registry URLs on agent-ui-kit-demo.vercel.app are unchanged.

One `perl` command renames the imports, variables, classes and attributes in your code; the [migration guide](https://agent-ui-kit-demo.vercel.app/docs/migrating-from-agent-ui-kit) has it, with the `data-slot` values and the steps for registry installs.

**`styles.css` leaves your theme and your content alone.** It used to set Tailwind's theme variables (`--spacing`, `--text-*` …) on every component, and its utilities and reset applied to everything inside one. Your own content in `renderTool`, `renderData`, `renderOutput`, `renderExtra` or a custom approval `preview` was restyled with them: in a Tailwind v4 app whose theme sets `--spacing: .5rem`, its `p-4` measured 16px instead of 32px, and a `<p>` lost its margins. Now:

- The stylesheet declares only the kit's `--signoff-*` tokens and Tailwind's per-element `--tw-*` properties. Tailwind's theme values are written into the utilities, which read the kit's `--signoff-*` tokens and none of your theme's variables.
- Your content sits in an element with `data-signoff-slot`, and the stylesheet's rules stop there, so your own CSS styles it. Components you render in a slot are styled as usual, up to two levels deep.
- Its keyframes are renamed `signoff-*`, so Tailwind's `pulse` no longer replaces one of your app's.
- `JsonView` and `ToolCallDetails` have a `data-signoff` root, so they are styled when you render them on their own.

With Tailwind v4 and `tailwind.css`, your build generates the utilities as before.
