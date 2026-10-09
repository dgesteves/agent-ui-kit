import { highlight } from '@/lib/highlight';
import { CopyCodeButton } from './code';

/**
 * Highlighted code, with an optional file name and a copy button. Server-rendered. `bare` drops the
 * frame, for code inside another framed block.
 */
export async function CodeBlock({
  code,
  language,
  title,
  bare = false,
}: {
  code: string;
  language?: string;
  title?: string;
  bare?: boolean;
}) {
  const html = await highlight(code, language);
  return (
    <figure data-code-block className={`${bare ? 'code-block-bare' : 'code-block'} group/code`}>
      {title && <figcaption className="code-title">{title}</figcaption>}
      <div className="relative">
        {/* Shiki's output: escaped code in spans, from the site's own sources at build time. */}
        <div dangerouslySetInnerHTML={{ __html: html }} />
        <CopyCodeButton />
      </div>
    </figure>
  );
}
