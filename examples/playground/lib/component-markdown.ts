import { getDescription, getInterface, getSignature, getStylingHooks, getType, type InterfaceDoc } from './api';
import { componentHref, stateValues, type ComponentDoc } from './components';
import { SITE_URL } from './site';

/*
 * A component's docs page as Markdown, from the same sources as the page: served at
 * /docs/components/<slug>.md, copied by "Copy page", and read by coding agents.
 */

const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\n+/g, ' ');

function propTable(doc: InterfaceDoc) {
  const rows = doc.props.map((p) => {
    const type = p.values ? `\`${p.type}\` (${p.values.join(' | ')})` : `\`${p.type}\``;
    return `| \`${p.name}\`${p.required ? ' (required)' : ''} | ${cell(type)} | ${p.defaultValue ? `\`${cell(p.defaultValue)}\`` : ''} | ${cell(p.description)} |`;
  });
  const rest = doc.inherits
    ? `\nAlso takes every \`${doc.inherits.from}\` prop, except ${doc.inherits.except.map((k) => `\`${k}\``).join(', ')}.\n`
    : doc.element
      ? `\nOther props go to the root \`<${doc.element}>\`: \`className\`, \`id\`, \`aria-*\`, \`data-*\` and event handlers.\n`
      : doc.extends
        ? `\nExtends \`${doc.extends}\`.\n`
        : '';
  return ['| Prop | Type | Default | Description |', '| --- | --- | --- | --- |', ...rows].join('\n') + '\n' + rest;
}

export function componentMarkdown(c: ComponentDoc) {
  const href = componentHref(c.slug);
  const extra = c.packages?.length ? ` ${c.packages.join(' ')}` : '';
  const out: string[] = [
    `# ${c.name}`,
    '',
    `> ${c.summary.replace(/`/g, '')}`,
    '',
    `Source: ${SITE_URL}${href}`,
    '',
    '## Installation',
    '',
    'From npm:',
    '',
    '```bash',
    `npm i @dgesteves/agent-ui-kit ai${extra}`,
    '```',
    '',
    '```tsx',
    c.imports.npm,
    `import '@dgesteves/agent-ui-kit/styles.css'; // once per app, or @import '@dgesteves/agent-ui-kit/tailwind.css' with Tailwind v4`,
    '```',
    '',
    'Or as source, with the shadcn CLI:',
    '',
    '```bash',
    `npx shadcn@latest add @agent-ui-kit/${c.item}`,
    '```',
    '',
    '```tsx',
    c.imports.shadcn,
    '```',
    '',
    '## Usage',
    '',
    '```tsx',
    c.usage,
    '```',
    '',
    '## API reference',
    '',
  ];
  for (const entry of c.api) {
    out.push(`### ${entry.name}`, '', getDescription(entry.name), '');
    if (entry.props) {
      out.push(propTable(getInterface(entry.props, entry.defaults)));
    } else {
      out.push('```ts', getSignature(entry.name), '```', '');
      if (entry.parameters)
        out.push(`Parameter, \`${entry.parameters}\`:`, '', propTable(getInterface(entry.parameters)));
      if (entry.returns) out.push(`Returns \`${entry.returns}\`:`, '', propTable(getInterface(entry.returns)));
    }
  }
  for (const name of c.types ?? []) {
    const type = getType(name);
    out.push(`### ${name}`, '');
    if (type.description) out.push(type.description, '');
    out.push(type.kind === 'interface' ? propTable(type) : ['```ts', type.source, '```', ''].join('\n'));
  }
  out.push('## Accessibility', '');
  if (c.keyboard) {
    out.push(
      '| Keys | Action |',
      '| --- | --- |',
      ...c.keyboard.map((k) => `| ${k.keys.join(' ')} | ${cell(k.action)} |`),
      '',
    );
  }
  out.push(...c.accessibility.map((note) => `- ${note}`), '');
  const hooks = getStylingHooks(c.file);
  if (hooks.slots.length) {
    out.push(
      '## Theming',
      '',
      `Slots (\`data-slot\`): ${hooks.slots.map((s) => `\`${s}\``).join(', ')}.`,
      '',
      ...hooks.states.map((attribute) => {
        const values = stateValues(c, attribute);
        const slot = hooks.slotOf[attribute];
        return `- \`${attribute}\`${slot ? ` on \`${slot}\`` : ''}${values ? `: ${values}` : ''}`;
      }),
      '',
      `Tokens it uses: ${hooks.tokens.map((t) => `\`${t}\``).join(', ')}. See ${SITE_URL}/docs/getting-started#theming.`,
      '',
    );
  }
  return out.join('\n');
}
