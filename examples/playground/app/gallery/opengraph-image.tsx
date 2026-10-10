import { OG_SIZE, ogImage } from '@/lib/og';

export const alt = 'signoff-ui: every component in isolation';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return ogImage({
    eyebrow: 'Components',
    title: 'Every component, live',
    description:
      'Tool timelines, approvals, per-hunk diff review, run telemetry, sources and an AG-UI agent, each with its install command.',
  });
}
