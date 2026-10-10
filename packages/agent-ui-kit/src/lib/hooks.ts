'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ChatStatus } from 'ai';
import { getToolParts, observeToolTimings, type AnyUIPart, type ToolTimings } from './ai';

export type { ToolTiming, ToolTimings } from './ai';

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
 *
 * 0 on the server: reading the clock there makes the render impure (Next.js `cacheComponents`
 * fails the build on it), and clock-derived output waits for hydration anyway (`useHydrated`).
 */
export function useNow(active: boolean, intervalMs = 100): number {
  const [now, setNow] = useState(() => (typeof window === 'undefined' ? 0 : Date.now()));
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

export interface RunTiming {
  /** When the run was first seen in flight: its first request, or later if it was already running. */
  startedAt?: number | undefined;
  /** When the run's first response arrived. Undefined while unknown, as `ttftMs`. */
  firstTokenAt?: number | undefined;
  /** Milliseconds the agent spent working, excluding time waiting on the user. */
  activeMs: number;
  /**
   * Time to first token of the run: from submitting its first request to the first streamed status.
   * A first request that ends without a `streaming` status (its response arrived in one burst) counts
   * its end as the first token. Undefined until then, and when it cannot be known: the run was already
   * streaming when first seen, its first request failed, or (given the messages) it ended with no reply.
   */
  ttftMs?: number | undefined;
  isRunning: boolean;
}

/** What `useRunTiming` reads of a message. AI SDK `UIMessage`s and `useAgUiAgent`'s messages fit. */
export interface RunTimingMessage {
  id: string;
  role: string;
}

interface RunTimingState {
  /** The run's key, and the last status seen. */
  key?: unknown;
  status?: ChatStatus | undefined;
  startedAt?: number | undefined;
  /** When the run's first request was submitted, while its first token can still be timed. */
  submittedAt?: number | undefined;
  firstTokenAt?: number | undefined;
  accumulatedMs: number;
  segmentStart?: number | undefined;
}

interface RunTimingInput {
  status: ChatStatus;
  now: number;
  /** A new run starts when it changes. */
  key: unknown;
  /** Whether a request submitted after the last one ended starts a new run. */
  newRunOnSubmit: boolean;
  /** Whether a message follows the last user message. Undefined without the messages. */
  replied: boolean | undefined;
}

/**
 * Derives run latency from `useChat` status transitions: time to first token, and active time. A run
 * can span several requests (e.g. continuing after an approval); time spent waiting on the human
 * between requests is excluded from `activeMs`.
 *
 * Pass the chat's `messages` (`useChat().messages`, or `useAgUiAgent`'s): a run then starts with each
 * user message (or a regenerated reply) and spans its approval round trips. Without them, each request
 * submitted after the last one ended starts a new run, so a turn that pauses for approval is timed per
 * request. A key of your own instead (any value but an array) starts a new run only when it changes.
 */
export function useRunTiming(status: ChatStatus, messages?: readonly RunTimingMessage[]): RunTiming;
export function useRunTiming(status: ChatStatus, resetKey: unknown): RunTiming;
export function useRunTiming(status: ChatStatus, messagesOrKey?: unknown): RunTiming {
  const [store] = useState(() => createStore<RunTimingState>({ accumulatedMs: 0 }));
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  let key = messagesOrKey;
  let replied: boolean | undefined;
  if (Array.isArray(messagesOrKey)) {
    const messages = messagesOrKey as readonly RunTimingMessage[];
    let lastUser = messages.length - 1;
    while (lastUser >= 0 && messages[lastUser]?.role !== 'user') lastUser--;
    key = messages[lastUser]?.id;
    replied = lastUser < messages.length - 1;
  }
  // With the messages, a request submitted with no reply after the last user message is a new turn
  // (or a regenerated reply); one that continues a reply, after an approval, is the same run.
  const newRunOnSubmit = messagesOrKey === undefined || replied === false;
  useIsoLayoutEffect(() => {
    store.set(reduceRunTiming(store.get(), { status, now: Date.now(), key, newRunOnSubmit, replied }));
  }, [status, key, newRunOnSubmit, replied, store]);
  const isRunning = state.segmentStart !== undefined;
  const now = useNow(isRunning, 100);
  return {
    startedAt: state.startedAt,
    firstTokenAt: state.firstTokenAt,
    activeMs: state.accumulatedMs + (state.segmentStart !== undefined ? Math.max(0, now - state.segmentStart) : 0),
    ttftMs:
      state.submittedAt !== undefined && state.firstTokenAt !== undefined
        ? state.firstTokenAt - state.submittedAt
        : undefined,
    isRunning,
  };
}

const isInFlight = (status: ChatStatus | undefined) => status === 'submitted' || status === 'streaming';

function reduceRunTiming(prev: RunTimingState, input: RunTimingInput): RunTimingState {
  const { status, now, key, newRunOnSubmit, replied } = input;
  const submitted = status === 'submitted' && !isInFlight(prev.status);
  const s: RunTimingState =
    !Object.is(key, prev.key) || (submitted && newRunOnSubmit) ? { key, accumulatedMs: 0 } : prev;
  if (isInFlight(status)) {
    const startedAt = s.startedAt ?? now;
    // The first token is timed only from the run's first request, seen from its submission: a run
    // first seen already streaming has an unknown time to first token, not 0.
    const submittedAt = s.startedAt === undefined ? (status === 'submitted' ? now : undefined) : s.submittedAt;
    const segmentStart = s.segmentStart ?? now;
    const firstTokenAt = status === 'streaming' && submittedAt !== undefined ? (s.firstTokenAt ?? now) : s.firstTokenAt;
    if (
      s === prev &&
      status === s.status &&
      startedAt === s.startedAt &&
      submittedAt === s.submittedAt &&
      segmentStart === s.segmentStart &&
      firstTokenAt === s.firstTokenAt
    )
      return s;
    return { ...s, status, startedAt, submittedAt, segmentStart, firstTokenAt };
  }
  if (s.segmentStart === undefined) return status === s.status && s === prev ? s : { ...s, status };
  // useChat can go straight from submitted to ready when a response arrives in one burst; then the
  // response is the first token, unless the messages show that none arrived (it was stopped).
  const burst = s.firstTokenAt === undefined && s.submittedAt !== undefined && status === 'ready' && replied !== false;
  const firstTokenAt = burst ? now : s.firstTokenAt;
  return {
    ...s,
    status,
    firstTokenAt,
    // Once the first request has ended, a later one (after an approval wait) is not the first token.
    submittedAt: firstTokenAt === undefined ? undefined : s.submittedAt,
    accumulatedMs: s.accumulatedMs + (now - s.segmentStart),
    segmentStart: undefined,
  };
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
