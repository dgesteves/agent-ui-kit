'use client';

import { useId, useState } from 'react';

const REGISTRY = 'https://agent-ui-kit-demo.vercel.app/r';

export interface InstallProps {
  /** The registry item. */
  item: string;
  /** What to import: the export first, then helpers from lib/ai. */
  name: string;
  usage: string;
  /** Where the export lives, when not the main entry and `components/agent-ui/<item>`. */
  from?: { npm: string; shadcn: string };
  /** Packages the app adds alongside, e.g. `@ag-ui/client`. */
  packages?: string[];
}

/** How to get one component: from npm or as a shadcn registry item, and a minimal usage. */
export function Install({ item, name, usage, from, packages = [] }: InstallProps) {
  const [tab, setTab] = useState<'npm' | 'shadcn'>('npm');
  const id = useId();
  const extra = packages.join(' ');
  const commands = {
    npm: `pnpm add @dgesteves/agent-ui-kit ai${extra ? ` ${extra}` : ''}`,
    shadcn: `npx shadcn@latest add ${REGISTRY}/${item}.json${extra ? `\npnpm add ${extra}` : ''}`,
  };
  // The registry copies each component to components/agent-ui/ and its helpers to lib/.
  const [component, ...helpers] = name.split(', ');
  const imports =
    tab === 'npm'
      ? `import { ${name} } from '${from?.npm ?? '@dgesteves/agent-ui-kit'}';`
      : [
          `import { ${component ?? name} } from '@/components/agent-ui/${from?.shadcn ?? item}';`,
          ...(helpers.length ? [`import { ${helpers.join(', ')} } from '@/components/agent-ui/lib/ai';`] : []),
        ].join('\n');
  const code = `${imports}\n\n${usage}`;

  return (
    <div className="border-line mt-3 overflow-hidden rounded-xl border bg-[#101317]">
      <div className="border-line flex items-center gap-1 border-b px-2" role="tablist" aria-label={`Install ${name}`}>
        {(['npm', 'shadcn'] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`${id}-${key}`}
            aria-selected={tab === key}
            aria-controls={`${id}-panel`}
            tabIndex={tab === key ? 0 : -1}
            onClick={() => {
              setTab(key);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              const next = key === 'npm' ? 'shadcn' : 'npm';
              setTab(next);
              document.getElementById(`${id}-${next}`)?.focus();
            }}
            className={`-mb-px border-b-2 px-3 py-2 font-mono text-xs ${
              tab === key ? 'border-cyan text-[#e8eaed]' : 'border-transparent text-[#a1a9b4] hover:text-[#e8eaed]'
            }`}
          >
            {key}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`} className="flex flex-col gap-3 p-3">
        <Snippet text={commands[tab]} label={`Copy the ${tab} command`} />
        <Snippet text={code} label="Copy the code" multiline />
      </div>
    </div>
  );
}

function Snippet({ text, label, multiline = false }: { text: string; label: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre
        className={`bg-ink border-line overflow-x-auto rounded-lg border px-3 py-2 pr-20 font-mono text-[12px] leading-relaxed text-[#c9d1d9] ${
          multiline ? '' : 'whitespace-pre'
        }`}
      >
        <code>{text}</code>
      </pre>
      <button
        type="button"
        aria-label={label}
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => {
              setCopied(false);
            }, 1500);
          });
        }}
        className="border-line hover:border-cyan absolute top-1.5 right-1.5 rounded-md border bg-[#181c22] px-2 py-1 font-mono text-[11px] text-[#a1a9b4] hover:text-[#e8eaed]"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Copied' : ''}
      </span>
    </div>
  );
}
