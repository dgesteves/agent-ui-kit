import type { ComponentPropsWithoutRef } from 'react';
import { isSourcePart, type SourcePart } from './lib/ai';
import { getHostname } from './lib/format';
import { ExternalIcon, FileIcon } from './lib/icons';
import { cn } from './lib/utils';

/** A source in app-level shape. AI SDK `source-url` / `source-document` parts are accepted too. */
export interface SourceItem {
  id: string;
  url?: string | undefined;
  title?: string | undefined;
  /** Optional snippet shown in the cards variant. */
  description?: string | undefined;
  /** For documents. */
  filename?: string | undefined;
  mediaType?: string | undefined;
}

export function toSourceItem(source: SourcePart | SourceItem): SourceItem {
  if ('type' in source && isSourcePart(source as SourcePart)) {
    const part = source as SourcePart;
    return part.type === 'source-url'
      ? { id: part.sourceId, url: part.url, title: part.title }
      : { id: part.sourceId, title: part.title, filename: part.filename, mediaType: part.mediaType };
  }
  return source as SourceItem;
}

export interface SourcesProps extends Omit<ComponentPropsWithoutRef<'nav'>, 'children'> {
  sources: ReadonlyArray<SourcePart | SourceItem>;
  variant?: 'chips' | 'cards';
  /** Visible heading. Default "Sources"; pass `null` to hide it (it stays as the accessible name). */
  label?: string | null;
  /**
   * Prefix for element ids (`${idPrefix}-1`, …) so inline citations can link to a source.
   * Default "source".
   */
  idPrefix?: string;
}

function Monogram({ item }: { item: SourceItem }) {
  if (!item.url) {
    return (
      <span aria-hidden="true" className="text-aui-fg-subtle flex size-4 shrink-0 items-center justify-center">
        <FileIcon size={13} />
      </span>
    );
  }
  const host = getHostname(item.url);
  return (
    <span
      aria-hidden="true"
      className="bg-aui-surface-2 font-aui-mono text-aui-fg-muted ring-aui-border-strong flex size-4 shrink-0 items-center justify-center rounded-[4px] text-[9px] font-bold uppercase ring-1"
    >
      {host.charAt(0)}
    </span>
  );
}

/** Citation list as compact chips or richer cards. External links open in a new tab. */
export function Sources({
  sources,
  variant = 'chips',
  label = 'Sources',
  idPrefix = 'source',
  className,
  ...props
}: SourcesProps) {
  const items = sources.map(toSourceItem);
  if (items.length === 0) return null;
  const name = label ?? 'Sources';
  return (
    <nav
      data-aui
      data-slot="sources"
      data-variant={variant}
      aria-label={name}
      className={cn('font-aui-sans text-aui-fg', className)}
      {...props}
    >
      {label !== null && (
        <p className="font-aui-mono text-aui-fg-subtle mb-2 text-[10.5px] font-medium tracking-[0.08em] uppercase">
          {label} <span className="text-aui-fg-subtle/80">· {items.length}</span>
        </p>
      )}
      <ol className={cn(variant === 'chips' ? 'flex flex-wrap gap-1.5' : 'grid grid-cols-1 gap-2 sm:grid-cols-2')}>
        {items.map((item, i) => {
          const n = i + 1;
          const host = item.url ? getHostname(item.url) : (item.filename ?? item.mediaType ?? 'Document');
          const title = item.title ?? host;
          const content =
            variant === 'chips' ? (
              <>
                <span className="font-aui-mono text-aui-accent-fg text-[10.5px] font-semibold tabular-nums">{n}</span>
                <Monogram item={item} />
                <span className="text-aui-fg max-w-[16rem] truncate">{title}</span>
                {item.title && item.url && <span className="text-aui-fg-subtle hidden sm:inline">{host}</span>}
              </>
            ) : (
              <>
                <span className="text-aui-fg-subtle flex items-center gap-2 text-xs">
                  <span className="font-aui-mono text-aui-accent-fg text-[10.5px] font-semibold tabular-nums">{n}</span>
                  <Monogram item={item} />
                  <span className="truncate">{host}</span>
                  {item.url && (
                    <ExternalIcon
                      size={12}
                      className="ml-auto shrink-0 opacity-0 transition-opacity group-hover/source:opacity-100"
                    />
                  )}
                </span>
                <span className="text-aui-fg mt-1.5 line-clamp-2 text-[13px] leading-snug font-medium">{title}</span>
                {item.description && (
                  <span className="text-aui-fg-muted mt-1 line-clamp-2 text-xs leading-relaxed">
                    {item.description}
                  </span>
                )}
              </>
            );
          const shared = cn(
            'group/source focus-visible:outline-aui-ring transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
            variant === 'chips'
              ? 'border-aui-border bg-aui-surface inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border pr-2.5 pl-2 text-xs'
              : 'border-aui-border bg-aui-surface flex h-full flex-col rounded-lg border p-3',
            item.url && 'hover:border-aui-border-strong hover:bg-aui-surface-2',
          );
          return (
            <li key={`${item.id}-${i}`} id={`${idPrefix}-${n}`} className="min-w-0">
              {item.url ? (
                <a href={item.url} target="_blank" rel="noopener noreferrer" className={shared}>
                  {content}
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ) : (
                <span className={shared}>{content}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
