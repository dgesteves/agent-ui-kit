'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { defaultLabels, mergeLabels, type SignoffLabels, type SignoffLabelsInput } from './lib/labels';

/** What the providers above give: their labels merged, the nearest winning. Empty without one. */
const LabelsContext = createContext<SignoffLabelsInput>({});

/**
 * Labels for every component inside: a translation of `defaultLabels`, whole or in part. Providers
 * nest, the inner one winning key by key. Labels hold functions, so render the provider from a
 * Client Component (a module with 'use client') and keep the object stable: at module scope, or memoized.
 */
export function SignoffLabelsProvider({ labels, children }: { labels: SignoffLabelsInput; children: ReactNode }) {
  const parent = useContext(LabelsContext);
  const value = useMemo(() => mergeLabels(parent, labels), [parent, labels]);
  return <LabelsContext.Provider value={value}>{children}</LabelsContext.Provider>;
}

/** A component's own `labels`, for what it renders inside too; nothing extra without them. */
export function WithLabels({ labels, children }: { labels: SignoffLabelsInput | undefined; children: ReactNode }) {
  return labels ? <SignoffLabelsProvider labels={labels}>{children}</SignoffLabelsProvider> : children;
}

/** Every label in effect here: the English, the providers' over it, and `overrides` over both. */
export function useSignoffLabels(overrides?: SignoffLabelsInput): SignoffLabels {
  const context = useContext(LabelsContext);
  return useMemo(() => mergeLabels(defaultLabels, context, overrides), [context, overrides]);
}

/**
 * The sections a component reads, from their English defaults (a module-level object, such as
 * `{ sources: sourcesLabels }`), with the providers' labels and the component's own over them.
 * Only those sections' defaults end up in the component's bundle.
 */
export function useLabels<T extends Partial<SignoffLabels>>(defaults: T, overrides?: SignoffLabelsInput): T {
  const context = useContext(LabelsContext);
  return useMemo(() => {
    const keys = Object.keys(defaults) as (keyof T & keyof SignoffLabelsInput)[];
    if (!overrides && keys.every((key) => context[key] === undefined)) return defaults;
    const own: SignoffLabelsInput = {};
    const theirs: SignoffLabelsInput = {};
    for (const key of keys) {
      if (context[key] !== undefined) Object.assign(theirs, { [key]: context[key] });
      if (overrides?.[key] !== undefined) Object.assign(own, { [key]: overrides[key] });
    }
    return mergeLabels(defaults as SignoffLabelsInput, theirs, own) as T;
  }, [defaults, context, overrides]);
}
