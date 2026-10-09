import type { ReactNode } from 'react';

/**
 * A live example on the kit's own background. It follows the site's theme (the switch in the
 * header), so both palettes are one click away without a second control to keep in step.
 */
export function Preview({ children }: { children: ReactNode }) {
  return (
    <div className="bg-aui-bg text-aui-fg border-line overflow-hidden rounded-xl border p-4 sm:p-6">{children}</div>
  );
}
