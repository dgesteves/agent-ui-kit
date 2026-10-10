// Generates registry.json (the shadcn registry source) from the library source.
//
// Each item is self-contained: it lists the component file plus every file it
// imports (transitively), so it installs correctly by URL, from a local file,
// or straight from GitHub (`npx shadcn add dgesteves/signoff-ui/<item>`),
// without cross-item registryDependencies. Shared files are identical across
// items, so installing a second component skips them.
//
// Usage: node scripts/registry.mjs [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'packages/signoff-ui/src');
const TARGET_DIR = 'components/signoff-ui';

const ITEMS = [
  {
    name: 'diff-review',
    entry: 'diff-review.tsx',
    title: 'Diff Review',
    description:
      'Unified/split review of agent edits across files with per-hunk accept/reject and keyboard navigation; returns each file with the accepted hunks applied.',
  },
  {
    name: 'approval-card',
    entry: 'approval-card.tsx',
    title: 'Approval Card',
    description:
      'Approve or deny a tool call once, for the session or always, by tool and argument pattern: an args preview, editable arguments, risk levels, a denial reason, a key per choice, approve all pending.',
  },
  {
    name: 'use-approval-policy',
    entry: 'use-approval-policy.ts',
    title: 'useApprovalPolicy',
    description:
      'Approval rules without markup: once, session or always, by tool and argument glob, deny winning; pluggable storage, an audit trail, and the same rules as AI SDK 7 toolApproval.',
  },
  {
    name: 'agent-message',
    entry: 'agent-message.tsx',
    title: 'Agent Message',
    description:
      'Renders an assistant UIMessage: markdown, reasoning, grouped tool calls, inline approvals and sources.',
  },
  {
    name: 'tool-call-timeline',
    entry: 'tool-call-timeline.tsx',
    title: 'Tool Call Timeline',
    description:
      'Vertical timeline of AI SDK tool calls with live states, durations, a waterfall and expandable input/output.',
  },
  {
    name: 'run-meter',
    entry: 'run-meter.tsx',
    title: 'Run Meter',
    description: 'Tokens, estimated cost and latency (TTFT, total) for an agent run, compact or expanded.',
  },
  {
    name: 'agent-status',
    entry: 'agent-status.tsx',
    title: 'Agent Status',
    description:
      'Run state pill (thinking, working, waiting for approval, done, stopped, error) announced through an aria-live region.',
  },
  {
    name: 'sources',
    entry: 'sources.tsx',
    title: 'Sources',
    description: 'Citation chips and cards for AI SDK source-url and source-document parts.',
  },
  {
    name: 'markdown',
    entry: 'markdown.tsx',
    title: 'Markdown',
    description: 'Streaming-safe GFM markdown with linked [n] citations and a typing caret.',
  },
  {
    name: 'reasoning',
    entry: 'reasoning.tsx',
    title: 'Reasoning',
    description: 'Collapsible model reasoning that opens while streaming and summarizes its duration.',
  },
  {
    name: 'ag-ui',
    entry: 'use-ag-ui-agent.ts',
    title: 'AG-UI Adapter',
    description:
      'useAgUiAgent: renders any AG-UI agent (LangGraph, CrewAI, Mastra, Pydantic AI) with these components, interrupts as approvals.',
  },
];

const read = (file) => readFileSync(file, 'utf8');

/** Relative imports of a source file, resolved to files under src/. */
function localImports(file) {
  const code = read(join(src, file));
  const out = [];
  for (const m of code.matchAll(/from\s+'(\.[^']+)'/g)) {
    const base = posix.normalize(posix.join(posix.dirname(file), m[1]));
    for (const ext of ['.ts', '.tsx']) {
      try {
        read(join(src, base + ext));
        out.push(base + ext);
        break;
      } catch {
        /* try next extension */
      }
    }
  }
  return out;
}

/** npm packages imported by a source file (excluding React itself). */
function packageImports(file) {
  const code = read(join(src, file));
  const pkgs = new Set();
  for (const m of code.matchAll(/from\s+'([^.'][^']*)'/g)) {
    const spec = m[1];
    const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
    if (name !== 'react' && name !== 'react-dom') pkgs.add(name);
  }
  return pkgs;
}

function closure(entry) {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    localImports(file).forEach(visit);
  };
  visit(entry);
  return [...seen].sort((a, b) => (a === entry ? -1 : b === entry ? 1 : a.localeCompare(b)));
}

/** Parse `--name: value;` declarations from a CSS block body. */
function declarations(body) {
  const out = {};
  for (const m of body.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    out[m[1]] = m[2].replace(/\s+/g, ' ').replace(/\(\s/g, '(').replace(/\s\)/g, ')').trim();
  }
  return out;
}

/** Return the body of the block that starts at `start` (index of its "{"). */
function blockBody(css, start) {
  let depth = 0;
  for (let i = start; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(start + 1, i);
  }
  throw new Error('unbalanced CSS');
}

function bodyAfter(css, selector) {
  const at = css.indexOf(selector);
  if (at === -1) throw new Error(`selector not found: ${selector}`);
  return blockBody(css, css.indexOf('{', at));
}

/** Convert a CSS block body of nested rules into shadcn's JSON css shape. */
function rulesToJson(body) {
  const out = {};
  let i = 0;
  while (i < body.length) {
    const open = body.indexOf('{', i);
    if (open === -1) break;
    const selector = body.slice(i, open).trim().replace(/\s+/g, ' ');
    const inner = blockBody(body, open);
    const decls = {};
    for (const m of inner.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) decls[m[1]] = m[2].trim();
    out[selector] = decls;
    i = open + inner.length + 2;
  }
  return out;
}

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const theme = stripComments(read(join(src, 'styles/theme.css')));
const tokens = stripComments(read(join(src, 'styles/tokens.css')));

const light = declarations(bodyAfter(theme, ':root'));
const dark = declarations(bodyAfter(theme, '.dark'));
const themeInline = declarations(bodyAfter(tokens, '@theme inline'));
const themeAnim = bodyAfter(tokens, '@theme {');
const animations = declarations(themeAnim.replace(/@keyframes[\s\S]*$/, ''));
const css = {};
for (const m of themeAnim.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
  const start = m.index + m[0].length - 1;
  css[`@keyframes ${m[1]}`] = rulesToJson(blockBody(themeAnim, start));
}

const cssVars = { theme: { ...themeInline, ...animations }, light, dark };

const registry = {
  $schema: 'https://ui.shadcn.com/schema/registry.json',
  name: 'signoff-ui',
  homepage: 'https://github.com/dgesteves/signoff-ui',
  items: ITEMS.map((item) => {
    const files = closure(item.entry);
    const deps = new Set();
    files.forEach((f) => packageImports(f).forEach((p) => deps.add(p)));
    return {
      name: item.name,
      type: 'registry:component',
      title: item.title,
      description: item.description,
      author: 'Diogo Esteves <https://github.com/dgesteves>',
      dependencies: [...deps].sort(),
      files: files.map((f) => ({
        path: relative(root, join(src, f)).split('\\').join('/'),
        type: f.startsWith('lib/') ? 'registry:lib' : 'registry:component',
        target: `${TARGET_DIR}/${f}`,
      })),
      cssVars,
      css,
    };
  }),
};

const json = JSON.stringify(registry, null, 2) + '\n';
const file = join(root, 'registry.json');
if (process.argv.includes('--check')) {
  if (read(file) !== json) {
    console.error('registry.json is out of date. Run `pnpm registry:generate`.');
    process.exit(1);
  }
  console.log('registry.json is up to date.');
} else {
  writeFileSync(file, json);
  console.log(`registry.json: ${registry.items.length} items`);
}
