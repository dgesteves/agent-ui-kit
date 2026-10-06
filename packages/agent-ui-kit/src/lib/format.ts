/** Formatting helpers shared by the components. All output is locale-stable. */

/*
 * Each unit is chosen by the value as it will be printed, not the raw value: otherwise rounding
 * produces "1000ms", "60.0s" or "1000.0k" instead of moving up to the next unit.
 */

export function formatDuration(ms: number | undefined | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '–';
  if (Math.round(ms) < 1000) return `${Math.round(ms)}ms`;
  const centis = (ms / 1000).toFixed(2);
  if (Number(centis) < 10) return `${centis}s`;
  const tenths = (ms / 1000).toFixed(1);
  if (Number(tenths) < 60) return `${tenths}s`;
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

/** Spoken form for screen readers, e.g. "1.2 seconds". */
export function formatDurationLong(ms: number | undefined | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return 'unknown duration';
  if (Math.round(ms) < 1000) return `${Math.round(ms)} milliseconds`;
  const tenths = (ms / 1000).toFixed(1);
  if (Number(tenths) < 60) return `${tenths} seconds`;
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes} minute${minutes === 1 ? '' : 's'} ${rest} second${rest === 1 ? '' : 's'}`;
}

export function formatTokens(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return '–';
  if (Math.abs(Math.round(n)) < 1000) return String(Math.round(n));
  const hundredths = (n / 1000).toFixed(2);
  if (Math.abs(Number(hundredths)) < 10) return `${hundredths}k`;
  const tenths = (n / 1000).toFixed(1);
  if (Math.abs(Number(tenths)) < 1000) return `${tenths}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function formatCost(usd: number | undefined | null): string {
  if (usd == null || !Number.isFinite(usd)) return '–';
  if (usd === 0) return '$0.00';
  const four = usd.toFixed(4);
  if (Math.abs(Number(four)) < 0.01) return `$${four}`;
  const three = usd.toFixed(3);
  if (Math.abs(Number(three)) < 1) return `$${three}`;
  return `$${usd.toFixed(2)}`;
}

/** `read_file` / `readFile` / `read-file` → "Read file". */
export function humanizeToolName(name: string): string {
  const spaced = name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Compact one-line preview of an arbitrary tool input. */
export function summarizeValue(value: unknown, max = 72): string | undefined {
  if (value == null) return undefined;
  let text: string;
  if (typeof value === 'string') text = value;
  else if (typeof value === 'number' || typeof value === 'boolean') text = String(value);
  else if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return undefined;
    // Prefer the first string-ish field: it is usually the most descriptive (query, path, command).
    const primary = entries.find(([, v]) => typeof v === 'string');
    text = primary
      ? String(primary[1])
      : entries.map(([k, v]) => `${k}: ${typeof v === 'object' ? '…' : String(v)}`).join(', ');
  } else return undefined;
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function safeStringify(value: unknown, space = 2): string {
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return JSON.stringify(value);
  const seen = new WeakSet<object>();
  try {
    return (
      JSON.stringify(
        value,
        (_key, v: unknown) => {
          if (typeof v === 'bigint') return `${v.toString()}n`;
          if (typeof v === 'object' && v !== null) {
            if (seen.has(v)) return '[Circular]';
            seen.add(v);
          }
          return v;
        },
        space,
      ) ?? String(value)
    );
  } catch {
    return String(value);
  }
}
