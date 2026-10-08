'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { CloseIcon, PauseIcon, PlayIcon, ReplayIcon, SlidersIcon } from './icons';

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

export interface RunControlsProps {
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
}: RunControlsProps) {
  // The controls render twice (the desktop sidebar and the phone sheet), so each speed group needs its own name.
  const speedName = useId();
  const button =
    'inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-[#1e232a] px-3 text-[13px] font-medium text-[#e8eaed] transition-colors hover:border-[#353c47] hover:bg-[#262b33] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-soft disabled:cursor-not-allowed disabled:opacity-45';
  return (
    <div className={`flex flex-col gap-4 ${className ?? ''}`}>
      <div className="flex gap-2">
        <button type="button" onClick={onReplay} className={button}>
          <ReplayIcon className="size-3.5" />
          Replay
        </button>
        <button
          type="button"
          onClick={() => onPausedChange(!paused)}
          disabled={!running && !paused}
          aria-pressed={paused}
          className={button}
        >
          {paused ? <PlayIcon className="size-3.5" /> : <PauseIcon className="size-3.5" />}
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
                name={speedName}
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

const iconButton =
  'inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-line bg-[#181c22] text-[#e8eaed] transition-colors hover:border-[#353c47] hover:bg-[#262b33] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-soft disabled:cursor-not-allowed disabled:opacity-45';

/** Phones: pause, replay and a button for the rest of the controls, next to the status pill. */
export function CompactRunControls({
  paused,
  running,
  onPausedChange,
  onReplay,
  onOpenControls,
  controlsId,
  className = '',
}: {
  paused: boolean;
  running: boolean;
  onPausedChange: (p: boolean) => void;
  onReplay: () => void;
  onOpenControls: () => void;
  controlsId: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={() => onPausedChange(!paused)}
        disabled={!running && !paused}
        aria-pressed={paused}
        aria-label="Pause"
        className={iconButton}
      >
        {paused ? <PlayIcon className="size-3.5" /> : <PauseIcon className="size-3.5" />}
      </button>
      <button type="button" onClick={onReplay} aria-label="Replay" className={iconButton}>
        <ReplayIcon className="size-4" />
      </button>
      <button
        type="button"
        onClick={onOpenControls}
        aria-haspopup="dialog"
        aria-controls={controlsId}
        aria-label="Run controls and telemetry"
        className={iconButton}
      >
        <SlidersIcon className="size-4" />
      </button>
    </div>
  );
}

/**
 * A modal bottom sheet on a native <dialog>: focus moves in and is trapped, Escape closes it, and
 * focus returns to the button that opened it. Tapping the backdrop closes it too.
 */
export function Sheet({
  id,
  open,
  onClose,
  title,
  children,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // A click on the dialog itself, not its content, is a click on the backdrop.
    const onClick = (event: MouseEvent) => {
      if (event.target === dialog) dialog.close();
    };
    dialog.addEventListener('click', onClick);
    return () => dialog.removeEventListener('click', onClick);
  }, []);
  return (
    <dialog
      ref={ref}
      id={id}
      aria-labelledby={`${id}-title`}
      onClose={onClose}
      className="border-line motion-safe:open:animate-sheet-in fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-2xl border border-b-0 bg-[#12151a] p-0 text-[#e8eaed] backdrop:bg-black/60"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between bg-[#12151a]/95 px-4 pt-3 pb-2 backdrop-blur">
        <h2 id={`${id}-title`} className="text-[15px] font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="focus-visible:outline-cyan-soft inline-flex size-9 cursor-pointer items-center justify-center rounded-lg text-[#a1a9b4] hover:bg-[#262b33] hover:text-[#e8eaed] focus-visible:outline-2"
        >
          <CloseIcon className="size-4" />
        </button>
      </div>
      <div className="flex flex-col gap-5 px-4 pt-1 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
    </dialog>
  );
}

export function KeyboardCard({ className = '' }: { className?: string }) {
  const rows: Array<[string[], string]> = [
    [['Y', 'N'], 'Approve or deny'],
    [['J', 'K'], 'Next / previous hunk'],
    [['A', 'R'], 'Accept / reject hunk'],
    [['⌘', '↵'], 'Apply review'],
    [['↑', '↓'], 'Move between tool calls'],
  ];
  return (
    <section aria-labelledby="kbd-heading" className={`border-line bg-raised/40 rounded-xl border p-4 ${className}`}>
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
