import type { ComponentDoc } from '@/lib/components';
import { CopyButton } from '../copy-button';
import { CodeBlock } from './code-block';
import { Tabs } from './tabs';

/** The install commands and imports for npm and for the shadcn CLI. */
export function installSnippets(component: ComponentDoc) {
  const extra = component.packages?.length ? ` ${component.packages.join(' ')}` : '';
  return {
    npm: {
      command: `npm i @dgesteves/agent-ui-kit ai${extra}`,
      code: [
        component.imports.npm,
        `// Once per app (with Tailwind v4: @import '@dgesteves/agent-ui-kit/tailwind.css'; in your CSS)`,
        `import '@dgesteves/agent-ui-kit/styles.css';`,
      ].join('\n'),
    },
    shadcn: {
      command: `npx shadcn@latest add @agent-ui-kit/${component.item}${extra ? `\nnpm i${extra}` : ''}`,
      code: component.imports.shadcn,
    },
  };
}

// One element per panel: Tabs counts its children, and a fragment would count as two.
function Panel({ command, code, label }: { command: string; code: string; label: string }) {
  return (
    <div>
      <div className="flex items-start gap-2 border-b border-[#262b33] py-1.5 pr-1.5 pl-4">
        <code className="min-w-0 flex-1 py-1.5 font-mono text-[13px] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap text-[#e8eaed]">
          {command}
        </code>
        <CopyButton text={command} label={label} />
      </div>
      <CodeBlock bare code={code} language="tsx" />
    </div>
  );
}

export function ComponentInstall({ component }: { component: ComponentDoc }) {
  const snippets = installSnippets(component);
  return (
    <Tabs label={`Install ${component.name}`} labels={['npm', 'shadcn']}>
      <Panel {...snippets.npm} label="Copy the npm command" />
      <Panel {...snippets.shadcn} label="Copy the shadcn command" />
    </Tabs>
  );
}
