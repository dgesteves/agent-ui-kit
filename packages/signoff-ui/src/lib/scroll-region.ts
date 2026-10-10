'use client';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Keyboard access to a horizontal scroller (WCAG 2.1.1). While its content is wider than it is, it
 * joins the tab order and, given a `label`, becomes a named group, so the arrow keys scroll it
 * natively; once everything fits it leaves the tab order again and adds no tab stop. Measured after
 * every render (streamed content widens it) and whenever it or its content resizes.
 *
 * A group rather than a region, as `JsonView` does: a long conversation with many code blocks
 * would otherwise flood landmark navigation, with several landmarks named "Code, ts".
 *
 * The attributes are set on the element directly rather than through state: measuring needs
 * layout, and a re-render on every resize would re-render the content inside too.
 */
export function useScrollRegion<T extends HTMLElement>(label?: string) {
  const ref = useRef<T>(null);
  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (el.scrollWidth > el.clientWidth + 1) {
      el.tabIndex = 0;
      if (label) {
        el.setAttribute('role', 'group');
        el.setAttribute('aria-label', label);
      }
    } else {
      el.removeAttribute('tabindex');
      if (label) {
        el.removeAttribute('role');
        el.removeAttribute('aria-label');
      }
    }
  }, [label]);

  useIsoLayoutEffect(() => {
    sync();
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    return () => observer.disconnect();
  }, [sync]);

  return ref;
}
