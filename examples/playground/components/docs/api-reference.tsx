import type { ReactNode } from 'react';
import Markdown from 'react-markdown';
import { getDescription, getInterface, getSignature, getType, type InterfaceDoc, type PropDoc } from '@/lib/api';
import type { ApiEntry, ComponentDoc } from '@/lib/components';
import { CodeBlock } from './code-block';
import { FencedCode, type HastNode } from './markdown';

/*
 * Props and types, generated from the library's declarations when the site builds (lib/api.ts).
 */

/** JSDoc text: code spans, lists and links, without wrapping paragraphs in more spacing. */
function Doc({ children }: { children: string }) {
  if (!children) return null;
  return (
    <div className="prop-doc">
      <Markdown
        components={{
          pre: ({ node }) => <FencedCode node={node as HastNode} />,
          a: ({ href, children: text }) => (
            <a href={href} rel="noreferrer">
              {text}
            </a>
          ),
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}

export const propId = (owner: string, prop: string) => `${owner}-${prop}`.toLowerCase();

function Prop({ owner, prop }: { owner: string; prop: PropDoc }) {
  return (
    <div
      id={propId(owner, prop.name)}
      className="prop-row grid gap-x-6 gap-y-1 py-3.5 md:grid-cols-[minmax(0,12.5rem)_minmax(0,1fr)]"
    >
      <dt className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <code className="text-fg-strong font-mono text-[13.5px] font-medium">{prop.name}</code>
        {prop.required && (
          <span className="border-magenta/40 text-magenta-soft rounded border px-1 font-mono text-[10.5px]">
            required
          </span>
        )}
      </dt>
      <dd className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <code className="text-cyan-soft font-mono text-[12.5px] leading-relaxed [overflow-wrap:anywhere]">
            {prop.type}
          </code>
          {prop.defaultValue && (
            <span className="text-fg-subtle text-[12.5px]">
              Default <code className="text-fg font-mono">{prop.defaultValue}</code>
            </span>
          )}
        </div>
        {prop.values && (
          <code className="text-fg-muted mt-0.5 block font-mono text-[12px] leading-relaxed [overflow-wrap:anywhere]">
            {prop.values.join(' | ')}
          </code>
        )}
        <Doc>{prop.description}</Doc>
      </dd>
    </div>
  );
}

function PropList({ owner, doc }: { owner: string; doc: InterfaceDoc }) {
  return (
    <>
      <dl className="divide-line border-line divide-y border-y">
        {doc.props.map((prop) => (
          <Prop key={prop.name} owner={owner} prop={prop} />
        ))}
      </dl>
      {doc.inherits ? (
        <p className="text-fg-muted mt-3 text-[13.5px] leading-relaxed">
          Also takes every <Code>{doc.inherits.from}</Code> prop above, except{' '}
          {doc.inherits.except.map((key, i) => (
            <span key={key}>
              {i > 0 && (i === doc.inherits!.except.length - 1 ? ' and ' : ', ')}
              <Code>{key}</Code>
            </span>
          ))}
          .
        </p>
      ) : doc.element ? (
        <p className="text-fg-muted mt-3 text-[13.5px] leading-relaxed">
          Other props go to the root <code className="text-fg font-mono text-[12.5px]">{`<${doc.element}>`}</code>:{' '}
          <Code>className</Code> (merged with tailwind-merge), <Code>id</Code>, <Code>aria-*</Code>, <Code>data-*</Code>{' '}
          and event handlers.
        </p>
      ) : doc.extends ? (
        <p className="text-fg-muted mt-3 text-[13.5px] leading-relaxed">
          Extends <Code>{doc.extends}</Code>.
        </p>
      ) : null}
    </>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="text-fg font-mono text-[12.5px]">{children}</code>;
}

function H3({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id} className="text-fg-strong mt-10 scroll-mt-28 font-mono text-[15px] font-semibold">
      <a href={`#${id}`} className="heading-anchor">
        {children}
      </a>
    </h3>
  );
}

const sub = 'mt-6 mb-2 font-mono text-[11px] font-medium tracking-[0.08em] text-fg-subtle uppercase';

function Entry({ entry }: { entry: ApiEntry }) {
  const id = entry.name.toLowerCase();
  const description = getDescription(entry.name);
  if (entry.parameters || entry.returns) {
    return (
      <section aria-labelledby={id}>
        <H3 id={id}>{entry.name}</H3>
        <div className="mt-3">
          <Doc>{description}</Doc>
        </div>
        <div className="mt-4">
          <CodeBlock code={getSignature(entry.name)} language="ts" />
        </div>
        {entry.parameters && (
          <>
            <p className={sub}>Parameter: {entry.parameters}</p>
            <PropList owner={entry.parameters} doc={getInterface(entry.parameters)} />
          </>
        )}
        {entry.returns && (
          <>
            <p className={sub}>Returns: {entry.returns}</p>
            <PropList owner={entry.returns} doc={getInterface(entry.returns)} />
          </>
        )}
      </section>
    );
  }
  const props = getInterface(entry.props!, entry.defaults);
  return (
    <section aria-labelledby={id}>
      <H3 id={id}>{entry.name}</H3>
      <div className="mt-3">
        <Doc>{description}</Doc>
      </div>
      <p className={sub}>Props</p>
      <PropList owner={entry.name} doc={props} />
    </section>
  );
}

function TypeEntry({ name }: { name: string }) {
  const type = getType(name);
  const id = name.toLowerCase();
  return (
    <section aria-labelledby={id}>
      <H3 id={id}>{name}</H3>
      {type.description && (
        <div className="mt-3">
          <Doc>{type.description}</Doc>
        </div>
      )}
      <div className="mt-4">
        {type.kind === 'interface' ? (
          <PropList owner={name} doc={type} />
        ) : (
          <CodeBlock code={type.source} language="ts" />
        )}
      </div>
    </section>
  );
}

export function ApiReference({ component }: { component: ComponentDoc }) {
  return (
    <>
      {component.api.map((entry) => (
        <Entry key={entry.name} entry={entry} />
      ))}
      {component.types?.map((name) => (
        <TypeEntry key={name} name={name} />
      ))}
    </>
  );
}
