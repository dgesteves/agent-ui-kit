import type { AxeMatchers } from 'vitest-axe/matchers';

// vitest-axe 0.1 augments the legacy `Vi` namespace; register its matchers on Vitest's current interfaces.
declare module 'vitest' {
  // Type parameters must match Vitest's declaration for interface merging.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
  interface Assertion<T = any> extends AxeMatchers {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
