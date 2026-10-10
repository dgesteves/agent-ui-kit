// The elements dist/styles.css may style: the kit's own, and never the app's.
//
// A component's root carries `data-signoff`. The elements that hold the app's content inside a
// component carry `data-signoff-slot`: AgentMessage's renderTool and renderData, ToolCallTimeline's
// renderOutput and renderExtra, and ApprovalCard's preview. An element is the kit's when it is a
// root or inside one and not inside a slot, or, inside a slot, when it is the root of another
// component (or inside it) and not inside one of that component's slots, and so on.
//
// CSS has no "nearest ancestor" test, so the selector spells out each level: `levels` components
// rendered in slots of components in slots. The app's content is never matched, at any depth;
// a component nested deeper than `levels` would render unstyled. The selector sits in :where(),
// so it adds no specificity.
export const ROOT = '[data-signoff]';
export const SLOT = '[data-signoff-slot]';
export const LEVELS = 2;

export function kitScope(levels = LEVELS) {
  const chain = (k) => Array.from({ length: k }, () => `${SLOT} ${ROOT}`).join(' ');
  let own = '';
  for (let k = levels; k >= 0; k--) {
    const root = k === 0 ? ROOT : chain(k);
    const slot = `${root} ${SLOT}`;
    own = own ? `:is(${root},${root} *):not(${slot} :not(${own}))` : `:is(${root},${root} *):not(${slot} *)`;
  }
  return `:where(${own})`;
}

export const KIT = kitScope();
