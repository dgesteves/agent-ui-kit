import { DocArticle } from '@/components/docs/article';
import { getGuide } from '@/lib/docs';
import { pageMetadata } from '@/lib/metadata';

const doc = getGuide('introduction')!;

export const metadata = pageMetadata({
  title: `${doc.title} · agent-ui-kit docs`,
  description: doc.description,
  path: doc.href,
  markdownPath: '/docs.md',
});

export default function DocsIndex() {
  return <DocArticle doc={doc} />;
}
