import Link from 'next/link';
import type { ReactNode } from 'react';
import Markdown from 'react-markdown';
import { getStylingHooks } from '@/lib/api';
import { componentAbout, componentHref, stateValues, type ComponentDoc } from '@/lib/components';
import type { Heading } from '@/lib/docs';
import { DEMOS } from '../demos';
import { ApiReference } from './api-reference';
import { DocShell } from './article';
import { CodeBlock } from './code-block';
import { ComponentInstall } from './component-install';
import { DocMarkdown } from './markdown';
import { Preview } from './preview';

/*
 * A component's page: a live example, install, usage, the API generated from the package's types,
 * keyboard and screen reader behavior, and the hooks for styling it.
 */

function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-fg-strong mt-14 mb-4 scroll-mt-28 text-[22px] font-semibold tracking-[-0.015em]">
      <a href={`#${id}`} className="heading-anchor">
        {children}
      </a>
    </h2>
  );
}

/** Inline Markdown for the notes: code spans and emphasis. */
function Inline({ children }: { children: string }) {
  return <Markdown components={{ p: ({ children: text }) => <>{text}</> }}>{children}</Markdown>;
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="border-line-strong bg-surface text-fg-soft inline-flex h-6 min-w-6 items-center justify-center rounded-[5px] border border-b-2 px-1.5 font-mono text-[11.5px]">
      {children}
    </kbd>
  );
}

/** The CSS variables, slots and state attributes the component's markup uses. */
function Theming({ component, hooks }: { component: ComponentDoc; hooks: ReturnType<typeof getStylingHooks> }) {
  const states = hooks.states.map((attribute) => ({
    attribute,
    values: stateValues(component, attribute),
    slot: hooks.slotOf[attribute],
  }));
  // The component's root slot when it has one by its own name, for the scoped override.
  const slot = hooks.slots.includes(component.slug) ? component.slug : hooks.slots[0];
  const state = states.find((s) => s.values?.startsWith("'") && hooks.slotOf[s.attribute]);
  const value = state?.values ? /'([^']+)'/.exec(state.values)?.[1] : undefined;
  const stateSlot = state ? hooks.slotOf[state.attribute] : undefined;
  const example = [
    `/* Only this component, and only inside .settings-panel */`,
    `.settings-panel [data-slot='${slot}'] {`,
    `  --signoff-radius: 4px;`,
    `}`,
    ...(state && value
      ? [
          '',
          `[data-slot='${stateSlot}'][${state.attribute}='${value}'] {`,
          `  outline: 1px solid var(--signoff-accent);`,
          `}`,
        ]
      : []),
  ].join('\n');
  const chip = 'rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-fg';
  const term = 'font-mono text-[11px] font-medium tracking-[0.08em] text-fg-subtle uppercase';
  return (
    <>
      <div className="docs-prose">
        <p>
          Every color, radius and font is a CSS variable, so the overrides in{' '}
          <Link href="/docs/getting-started#theming">Theming</Link> apply, on <code>:root</code> or scoped to any
          element. These hooks are read from the component&apos;s markup.
        </p>
      </div>
      <dl className="mt-6 flex flex-col gap-5">
        <div>
          <dt className={term}>Slots (data-slot)</dt>
          <dd className="mt-2 flex flex-wrap gap-1.5">
            {hooks.slots.map((s) => (
              <span key={s} className={chip}>
                {s}
              </span>
            ))}
          </dd>
        </div>
        {states.length > 0 && (
          <div>
            <dt className={term}>State attributes</dt>
            <dd className="mt-2 flex flex-col gap-3 text-[13.5px]">
              {states.map((s) => (
                <span key={s.attribute}>
                  <span className={chip}>{s.attribute}</span>
                  {s.slot && (
                    <span className="text-fg-subtle ml-1.5 text-[12.5px]">
                      on <code className="text-fg-soft font-mono">{s.slot}</code>
                    </span>
                  )}
                  {s.values && (
                    <code className="text-fg-muted mt-1 block font-mono text-[12.5px] [overflow-wrap:anywhere]">
                      {s.values}
                    </code>
                  )}
                </span>
              ))}
            </dd>
          </div>
        )}
        <div>
          <dt className={term}>Tokens it uses</dt>
          <dd className="mt-2 flex flex-wrap gap-1.5">
            {hooks.tokens.map((t) => (
              <span key={t} className={chip}>
                {t}
              </span>
            ))}
          </dd>
        </div>
      </dl>
      <div className="mt-6">
        <CodeBlock code={example} language="css" title="app/globals.css" />
      </div>
    </>
  );
}

/** The page's sections, for "On this page". */
export function componentHeadings(component: ComponentDoc, hasTheming: boolean): Heading[] {
  return [
    { id: 'example', text: 'Example', depth: 2 },
    { id: 'installation', text: 'Installation', depth: 2 },
    { id: 'usage', text: 'Usage', depth: 2 },
    ...(componentAbout(component.slug) ? [{ id: 'how-it-works', text: 'How it works', depth: 2 as const }] : []),
    { id: 'api-reference', text: 'API reference', depth: 2 },
    ...component.api.map((entry) => ({ id: entry.name.toLowerCase(), text: entry.name, depth: 3 as const })),
    ...(component.types ?? []).map((name) => ({ id: name.toLowerCase(), text: name, depth: 3 as const })),
    { id: 'accessibility', text: 'Accessibility', depth: 2 },
    ...(hasTheming ? [{ id: 'theming', text: 'Theming', depth: 2 as const }] : []),
  ];
}

export function ComponentPage({ component }: { component: ComponentDoc }) {
  const Demo = DEMOS[component.slug];
  const hooks = getStylingHooks(component.file);
  const hasTheming = hooks.slots.length > 0;
  const href = componentHref(component.slug);
  const about = componentAbout(component.slug);
  return (
    <DocShell
      href={href}
      group="Components"
      title={component.name}
      description={component.summary.replace(/`/g, '')}
      markdownPath={`${href}.md`}
      headings={componentHeadings(component, hasTheming)}
    >
      <H2 id="example">Example</H2>
      <Preview>{Demo ? <Demo /> : null}</Preview>
      <p className="text-fg-subtle mt-3 text-[13px]">
        Interactive, and the same on the{' '}
        <Link
          href={`/gallery#${component.galleryId}`}
          className="text-fg-soft decoration-fg-subtle/50 hover:decoration-fg underline underline-offset-[3px]"
        >
          components page
        </Link>
        . Try the keyboard below on it.
      </p>

      <H2 id="installation">Installation</H2>
      <ComponentInstall component={component} />
      <p className="text-fg-muted mt-3 text-[13.5px] leading-relaxed">
        The styles are once per app;{' '}
        <Link
          href="/docs/getting-started#add-the-styles"
          className="text-cyan-soft decoration-cyan/35 underline underline-offset-[3px]"
        >
          Getting started
        </Link>{' '}
        has the Tailwind v4 and plain CSS options.
      </p>

      <H2 id="usage">Usage</H2>
      <CodeBlock code={component.usage} language="tsx" />

      {about && (
        <>
          <H2 id="how-it-works">How it works</H2>
          <DocMarkdown markdown={about} />
        </>
      )}

      <H2 id="api-reference">API reference</H2>
      <p className="text-fg-muted text-[13.5px] leading-relaxed">
        Generated from the types the package ships, so it matches the version you install.
      </p>
      <ApiReference component={component} />

      <H2 id="accessibility">Accessibility</H2>
      {component.keyboard && (
        <div className="border-line mb-6 overflow-hidden rounded-xl border">
          <table className="w-full text-left text-[13.5px]">
            <caption className="sr-only">Keyboard</caption>
            <thead className="bg-surface text-fg">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Keys
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {component.keyboard.map((row) => (
                <tr key={row.action} className="border-line border-t">
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className="flex gap-1">
                      {row.keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </span>
                  </td>
                  <td className="text-fg-soft px-4 py-2.5">
                    <Inline>{row.action}</Inline>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="docs-prose">
        <ul>
          {component.accessibility.map((note) => (
            <li key={note}>
              <Inline>{note}</Inline>
            </li>
          ))}
        </ul>
      </div>

      {hasTheming && (
        <>
          <H2 id="theming">Theming</H2>
          <Theming component={component} hooks={hooks} />
        </>
      )}
    </DocShell>
  );
}
