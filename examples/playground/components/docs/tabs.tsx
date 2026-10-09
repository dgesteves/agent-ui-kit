'use client';

import { Children, useId, useState, type ReactNode } from 'react';

/** Tabs over server-rendered panels: `labels[i]` names `children[i]`. Arrow keys move between tabs. */
export function Tabs({ label, labels, children }: { label: string; labels: string[]; children: ReactNode }) {
  const panels = Children.toArray(children);
  const [selected, setSelected] = useState(0);
  const id = useId();
  const select = (index: number, focus = false) => {
    setSelected(index);
    if (focus) document.getElementById(`${id}-tab-${index}`)?.focus();
  };
  return (
    <div className="code-block">
      <div role="tablist" aria-label={label} className="border-line flex items-center border-b px-2">
        {labels.map((name, i) => (
          <button
            key={name}
            id={`${id}-tab-${i}`}
            type="button"
            role="tab"
            aria-selected={selected === i}
            aria-controls={`${id}-panel-${i}`}
            tabIndex={selected === i ? 0 : -1}
            onClick={() => select(i)}
            onKeyDown={(event) => {
              const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
              if (!step) return;
              event.preventDefault();
              select((i + step + labels.length) % labels.length, true);
            }}
            className={`focus-visible:outline-cyan-soft -mb-px cursor-pointer border-b-2 px-2.5 py-2 font-mono text-[12px] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 ${
              selected === i ? 'border-cyan text-fg' : 'text-fg-subtle hover:text-fg border-transparent'
            }`}
          >
            {name}
          </button>
        ))}
      </div>
      {panels.map((panel, i) => (
        <div key={i} role="tabpanel" id={`${id}-panel-${i}`} aria-labelledby={`${id}-tab-${i}`} hidden={selected !== i}>
          {panel}
        </div>
      ))}
    </div>
  );
}
