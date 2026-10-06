import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ChatStatus } from 'ai';
import { getToolPhase, getToolParts, isSettledPhase, type AnyUIPart, type ToolPart } from './ai';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(callback: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(REDUCED_MOTION);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

/** Tracks the user's `prefers-reduced-motion` setting. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(REDUCED_MOTION).matches : false),
    () => false,
  );
}

/**
 * Current time in ms, re-rendering on an interval while `active`.
 * The value can lag by up to one interval; clamp derived durations at 0.
 */
export function useNow(active: boolean, intervalMs = 100): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [active, intervalMs]);
  return now;
}

/** A tiny external store: subscribe/getSnapshot plus an `update` that only notifies on change. */
function createStore<T>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next: T) {
      if (next === state) return;
      state = next;
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export interface ToolTiming {
  /** First time the call was observed (input started streaming). */
  startedAt?: number | undefined;
  /** When execution began: input complete, or approval granted. */
  runningAt?: number | undefined;
  /** When the call settled (output, error or denial). */
  endedAt?: number | undefined;
}

export type ToolTimings = Readonly<Record<string, ToolTiming>>;

/**
 * Measures tool-call timings client-side by watching AI SDK state transitions.
 * Calls that are already settled when first observed (e.g. restored history)
 * get no timing rather than a misleading zero.
 */
export function useToolTimings(parts: readonly AnyUIPart[]): ToolTimings {
  const [store] = useState(() => createStore<ToolTimings>({}));
  const snapshot = useSyncExternalStore(store.subscribe, store.get, store.get);
  useIsoLayoutEffect(() => {
    store.set(observeToolTimings(store.get(), getToolParts(parts), Date.now()));
  }, [parts, store]);
  return snapshot;
}

/** Pure reducer behind `useToolTimings`, exported for tests and custom stores. */
export function observeToolTimings(prev: ToolTimings, tools: readonly ToolPart[], now: number): ToolTimings {
  let next: Record<string, ToolTiming> | undefined;
  const write = (id: string, value: ToolTiming) => {
    next ??= { ...prev };
    next[id] = value;
  };
  for (const tool of tools) {
    const phase = getToolPhase(tool);
    const current = (next ?? prev)[tool.toolCallId];
    if (!current) {
      if (isSettledPhase(phase)) write(tool.toolCallId, {});
      else write(tool.toolCallId, { startedAt: now, runningAt: phase === 'running' ? now : undefined });
      continue;
    }
    if (current.startedAt === undefined || current.endedAt !== undefined) continue;
    if (phase === 'running' && current.runningAt === undefined) write(tool.toolCallId, { ...current, runningAt: now });
    else if (isSettledPhase(phase))
      write(tool.toolCallId, { ...current, runningAt: current.runningAt ?? now, endedAt: now });
  }
  return next ?? prev;
}

export interface RunTiming {
  startedAt?: number | undefined;
  firstTokenAt?: number | undefined;
  /** Milliseconds the agent spent working, excluding time waiting on the user. */
  activeMs: number;
  /** Time to first token of the run. */
  ttftMs?: number | undefined;
  isRunning: boolean;
}

interface RunTimingState {
  startedAt?: number | undefined;
  firstTokenAt?: number | undefined;
  accumulatedMs: number;
  segmentStart?: number | undefined;
}

/**
 * Derives run latency from `useChat` status transitions. A run can span several
 * requests (e.g. continuing after an approval); time spent waiting on the human
 * between requests is excluded from `activeMs`. Change `resetKey` to start over.
 */
export function useRunTiming(status: ChatStatus, resetKey?: unknown): RunTiming {
  const [store] = useState(() => createStore<RunTimingState>({ accumulatedMs: 0 }));
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  const keyRef = useRef(resetKey);
  useIsoLayoutEffect(() => {
    let current = store.get();
    if (keyRef.current !== resetKey) {
      keyRef.current = resetKey;
      current = { accumulatedMs: 0 };
    }
    store.set(reduceRunTiming(current, status, Date.now()));
  }, [status, resetKey, store]);
  const isRunning = state.segmentStart !== undefined;
  const now = useNow(isRunning, 100);
  return {
    startedAt: state.startedAt,
    firstTokenAt: state.firstTokenAt,
    activeMs: state.accumulatedMs + (state.segmentStart !== undefined ? Math.max(0, now - state.segmentStart) : 0),
    ttftMs:
      state.startedAt !== undefined && state.firstTokenAt !== undefined
        ? state.firstTokenAt - state.startedAt
        : undefined,
    isRunning,
  };
}

function reduceRunTiming(s: RunTimingState, status: ChatStatus, now: number): RunTimingState {
  if (status === 'submitted' || status === 'streaming') {
    const startedAt = s.startedAt ?? now;
    const segmentStart = s.segmentStart ?? now;
    const firstTokenAt = status === 'streaming' ? (s.firstTokenAt ?? now) : s.firstTokenAt;
    if (startedAt === s.startedAt && segmentStart === s.segmentStart && firstTokenAt === s.firstTokenAt) return s;
    return { ...s, startedAt, segmentStart, firstTokenAt };
  }
  if (s.segmentStart === undefined) return s;
  return { ...s, accumulatedMs: s.accumulatedMs + (now - s.segmentStart), segmentStart: undefined };
}

/** Eases a number toward its target; jumps immediately under reduced motion. */
export function useAnimatedNumber(value: number, durationMs = 450): number {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);
  useEffect(() => {
    if (reduced || typeof requestAnimationFrame === 'undefined') {
      displayRef.current = value;
      return;
    }
    const from = displayRef.current;
    if (from === value) return;
    const start = performance.now();
    let frame = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + (value - from) * eased;
      displayRef.current = v;
      setDisplay(v);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs, reduced]);
  return reduced || typeof requestAnimationFrame === 'undefined' ? value : display;
}

export interface ActivityWindow {
  startedAt?: number | undefined;
  endedAt?: number | undefined;
}

/** Records when `active` last turned on and off. Restarts when it turns on again. */
export function useActivityWindow(active: boolean): ActivityWindow {
  const [store] = useState(() => createStore<ActivityWindow>({}));
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  useIsoLayoutEffect(() => {
    const cur = store.get();
    const now = Date.now();
    if (active && (cur.startedAt === undefined || cur.endedAt !== undefined)) store.set({ startedAt: now });
    else if (!active && cur.startedAt !== undefined && cur.endedAt === undefined) store.set({ ...cur, endedAt: now });
  }, [active, store]);
  return state;
}

const noopSubscribe = () => () => {};
const detectMac = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/** Platform check that is safe to use during hydration (server renders the non-Mac variant). */
export function useIsMac(): boolean {
  return useSyncExternalStore(noopSubscribe, detectMac, () => false);
}

const hydratedSnapshot = () => true;
const serverSnapshot = () => false;

/**
 * False during SSR and hydration, true afterwards. Clock-derived values (live
 * durations, waterfall widths) render only once hydrated so server and client markup match.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, hydratedSnapshot, serverSnapshot);
}
