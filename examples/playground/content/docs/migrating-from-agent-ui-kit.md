`@dgesteves/agent-ui-kit` is now `signoff-ui`. 0.5.0 is the first release under the new name. The components, their props and what they do are the same; the names around them changed, so they no longer collide with assistant-ui's (which also uses `data-aui` and `--aui-`). The old package stays on npm at 0.4.3 and gets no new releases.

## What changed

| Where                    | `@dgesteves/agent-ui-kit` 0.4                                      | `signoff-ui` 0.5                                                                   |
| ------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| npm package              | `@dgesteves/agent-ui-kit`                                          | `signoff-ui`                                                                       |
| Entry points             | `@dgesteves/agent-ui-kit/core`, `/ag-ui`, `/styles.css` and so on  | `signoff-ui/core`, `/ag-ui`, `/styles.css` and so on, the same set                 |
| CSS variables            | `--aui-bg`, `--aui-accent`, `--aui-radius` …                       | `--signoff-bg`, `--signoff-accent`, `--signoff-radius` …                           |
| Tailwind utilities       | `bg-aui-bg`, `text-aui-fg-muted`, `rounded-aui`, `font-aui-mono`   | `bg-signoff-bg`, `text-signoff-fg-muted`, `rounded-signoff`, `font-signoff-mono`   |
| Tailwind theme variables | `--color-aui-*`, `--radius-aui`, `--font-aui-*`, `--animate-aui-*` | `--color-signoff-*`, `--radius-signoff`, `--font-signoff-*`, `--animate-signoff-*` |
| Keyframes                | `aui-spin`, `aui-shimmer` …                                        | `signoff-spin`, `signoff-shimmer` …                                                |
| Component roots          | `data-aui`                                                         | `data-signoff`                                                                     |
| `data-slot` values       | `approval-card`, `diff-hunk` …                                     | `signoff-approval-card`, `signoff-diff-hunk` …                                     |
| shadcn namespace         | `@agent-ui-kit`                                                    | `@signoff-ui`                                                                      |
| shadcn files             | `components/agent-ui/`                                             | `components/signoff-ui/`                                                           |
| Repository               | `github.com/dgesteves/agent-ui-kit`                                | `github.com/dgesteves/signoff-ui`; the old URLs redirect                           |

The docs, the playground and the hosted registry stay at `agent-ui-kit-demo.vercel.app`, so registry URLs such as `https://agent-ui-kit-demo.vercel.app/r/diff-review.json` keep working.

## From npm

Swap the package:

```package-install
npm uninstall @dgesteves/agent-ui-kit && npm i signoff-ui
```

Then rename the imports, CSS variables, classes and attributes. In a git repository, this rewrites every tracked file that uses them, outside `package.json` and lockfiles:

```bash
git grep -lE 'agent-ui-kit|aui' -- ':!*package.json' ':!*lock*' | xargs perl -pi -e 's#\@dgesteves/agent-ui-kit#signoff-ui#g; s#\@agent-ui-kit\b#\@signoff-ui#g; s#--aui-#--signoff-#g; s#data-aui\b#data-signoff#g; s#(?<=[a-z0-9]-)aui(?=-[a-z0-9]|\b)#signoff#g'
```

Review the diff before you commit it. If the app also uses assistant-ui, whose own attribute is `data-aui` and whose variables start with `--aui-`, pass only the files that use this kit to `perl` instead of every match of `git grep`.

The command leaves `data-slot` values alone, since other libraries use the same attribute. If your CSS or tests select the kit's, add `signoff-` in front:

| Component          | `data-slot` values                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `AgentMessage`     | `signoff-agent-message`                                                                                     |
| `AgentStatus`      | `signoff-agent-status`                                                                                      |
| `ApprovalCard`     | `signoff-approval-card`, `signoff-approval-approve`, `signoff-approval-deny`                                |
| `DiffReview`       | `signoff-diff-review`, `signoff-diff-file`, `signoff-diff-hunk`, `signoff-diff-submit`                      |
| `Markdown`         | `signoff-markdown`                                                                                          |
| `Reasoning`        | `signoff-reasoning`                                                                                         |
| `RunMeter`         | `signoff-run-meter`                                                                                         |
| `Sources`          | `signoff-sources`                                                                                           |
| `ToolCallTimeline` | `signoff-tool-call-timeline`, `signoff-tool-call`, `signoff-tool-call-trigger`, `signoff-tool-call-details` |
| `JsonView`         | `signoff-json-view`                                                                                         |

## From the shadcn registry

The files you added are your code, and they keep working as they are. To take the new names:

1. Rename the registry in `components.json` from `@agent-ui-kit` to `@signoff-ui`. The URL stays the same.
2. Add the items again, for example `npx shadcn@latest add @signoff-ui/diff-review`. The new files land in `components/signoff-ui/`, and the tokens written into your CSS are now `--signoff-*`.
3. Carry over any edits you made to the old files, point your imports at `@/components/signoff-ui/...`, then delete `components/agent-ui/` and the `--aui-*` tokens, `--color-aui-*` mappings and `aui-*` keyframes the old items wrote into your CSS.

Or keep the old files and run the command above over them and your CSS, which renames their classes and tokens in place.

## `styles.css` and your content

If you import `signoff-ui/styles.css` (Tailwind v3 or no Tailwind), two things changed besides the names:

- **Your content in a component is yours.** What `renderTool`, `renderData`, `renderOutput`, `renderExtra` and a custom approval `preview` return now sits in an element with `data-signoff-slot`, and the stylesheet's rules stop there. Before, the kit's reset and utilities also styled that content: a `<p>` lost its margins and a `<ul>` its bullets, and in a Tailwind v4 app with its own theme, your `p-4` there used the kit's spacing. If your content relied on that, style it in your own CSS. Components you render in a slot are styled as before.
- **Your theme variables are left alone.** The stylesheet used to set Tailwind's `--spacing`, `--text-*` and other theme variables on every component, which also reached your content inside it. It now sets only the kit's `--signoff-*` tokens and Tailwind's per-element `--tw-*` properties, and its keyframes are named `signoff-*`.

With Tailwind v4 and `signoff-ui/tailwind.css`, your build generates the utilities as before, so nothing changes there besides the names.
