'use client';

import { useId } from 'react';

const SPEEDS = [0.5, 1, 2, 4];

function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <label htmlFor={id} className="text-[13px] text-[#e8eaed]">
          {label}
        </label>
        <p id={`${id}-hint`} className="text-xs text-[#8b94a0]">
          {hint}
        </p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={`${id}-hint`}
        onClick={() => onChange(!checked)}
        className="border-line focus-visible:outline-cyan-soft aria-checked:border-cyan/50 aria-checked:bg-cyan/25 relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border bg-[#1e232a] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <span
          className={`inline-block size-3.5 rounded-full transition-transform motion-reduce:transition-none ${checked ? 'bg-cyan-soft translate-x-[18px]' : 'translate-x-[2px] bg-[#8b94a0]'}`}
        />
      </button>
    </div>
  );
}

export function RunControls({
  speed,
  onSpeedChange,
  paused,
  onPausedChange,
  running,
  onReplay,
  autopilot,
  onAutopilotChange,
  inspect,
  onInspectChange,
  className,
}: {
  speed: number;
  onSpeedChange: (s: number) => void;
  paused: boolean;
  onPausedChange: (p: boolean) => void;
  running: boolean;
  onReplay: () => void;
  autopilot: boolean;
  onAutopilotChange: (v: boolean) => void;
  inspect: boolean;
  onInspectChange: (v: boolean) => void;
  className?: string;
}) {
  const button =
    'inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-[#1e232a] px-3 text-[13px] font-medium text-[#e8eaed] transition-colors hover:border-[#353c47] hover:bg-[#262b33] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-soft disabled:cursor-not-allowed disabled:opacity-45';
  return (
    <div className={`flex flex-col gap-4 ${className ?? ''}`}>
      <div className="flex gap-2">
        <button type="button" onClick={onReplay} className={button}>
          <svg
            viewBox="0 0 24 24"
            className="size-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4v4.5H8" />
          </svg>
          Replay
        </button>
        <button
          type="button"
          onClick={() => onPausedChange(!paused)}
          disabled={!running && !paused}
          aria-pressed={paused}
          className={button}
        >
          {paused ? (
            <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden="true">
              <path d="M7 4.5v15l12-7.5-12-7.5Z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden="true">
              <rect x="6" y="4.5" width="4" height="15" rx="1" />
              <rect x="14" y="4.5" width="4" height="15" rx="1" />
            </svg>
          )}
          {paused ? 'Resume' : 'Pause'}
        </button>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-[13px] text-[#e8eaed]">Playback speed</legend>
        <div className="border-line grid grid-cols-4 rounded-lg border bg-[#12151a] p-0.5">
          {SPEEDS.map((s) => (
            <label
              key={s}
              className="has-focus-visible:outline-cyan-soft relative flex cursor-pointer items-center justify-center rounded-md py-1 font-mono text-xs text-[#a1a9b4] transition-colors hover:text-[#e8eaed] has-checked:bg-[#262b33] has-checked:text-[#e8eaed] has-focus-visible:outline-2"
            >
              <input
                type="radio"
                name="speed"
                value={s}
                checked={speed === s}
                onChange={() => onSpeedChange(s)}
                className="sr-only"
              />
              {s}×
            </label>
          ))}
        </div>
      </fieldset>
      <Switch
        checked={autopilot}
        onChange={onAutopilotChange}
        label="Autopilot"
        hint="Approve and review on your behalf"
      />
      <Switch
        checked={inspect}
        onChange={onInspectChange}
        label="Inspect components"
        hint="Outline each kit component"
      />
    </div>
  );
}

export function KeyboardCard() {
  const rows: Array<[string[], string]> = [
    [['Y', 'N'], 'Approve or deny'],
    [['J', 'K'], 'Next / previous hunk'],
    [['A', 'R'], 'Accept / reject hunk'],
    [['⌘', '↵'], 'Apply review'],
    [['↑', '↓'], 'Move between tool calls'],
  ];
  return (
    <section aria-labelledby="kbd-heading" className="border-line bg-raised/40 rounded-xl border p-4">
      <h2
        id="kbd-heading"
        className="mb-3 font-mono text-[10.5px] font-medium tracking-[0.08em] text-[#8b94a0] uppercase"
      >
        Keyboard
      </h2>
      <dl className="flex flex-col gap-2">
        {rows.map(([keys, label]) => (
          <div key={label} className="flex items-center justify-between gap-3 text-[13px]">
            <dt className="text-[#a1a9b4]">{label}</dt>
            <dd className="flex gap-1">
              {keys.map((k) => (
                <kbd
                  key={k}
                  className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-[#353c47] bg-[#12151a] px-1 font-mono text-[11px] text-[#a1a9b4]"
                >
                  {k}
                </kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
