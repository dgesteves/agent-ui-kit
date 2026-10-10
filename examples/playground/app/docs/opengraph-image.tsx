import { getGuide } from '@/lib/docs';
import { OG_SIZE, ogImage } from '@/lib/og';

const doc = getGuide('introduction')!;

export const alt = `signoff-ui docs: ${doc.title}`;
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return ogImage({ eyebrow: 'Docs', title: doc.title, description: doc.description });
}
