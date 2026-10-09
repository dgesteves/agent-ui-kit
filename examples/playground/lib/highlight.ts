import { createHighlighterCore, type HighlighterCore, type ThemeRegistration } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

/*
 * Syntax highlighting for the docs, at build time: pages ship highlighted HTML and no highlighter.
 * Two themes made from the kit's own code tokens (--aui-code-*), output as CSS variables
 * (--shiki-dark, --shiki-light), so code follows the site's palette like the components do.
 */

function theme(name: string, type: 'dark' | 'light', c: Record<string, string>): ThemeRegistration {
  return {
    name,
    type,
    colors: { 'editor.background': c.bg!, 'editor.foreground': c.fg! },
    settings: [
      { settings: { foreground: c.fg, background: c.bg } },
      {
        scope: ['comment', 'punctuation.definition.comment'],
        settings: { foreground: c.comment, fontStyle: 'italic' },
      },
      {
        scope: ['keyword', 'storage', 'storage.type', 'keyword.operator.new', 'keyword.control', 'variable.language'],
        settings: { foreground: c.keyword },
      },
      {
        scope: ['string', 'string.quoted', 'string.template', 'markup.inline.raw'],
        settings: { foreground: c.string },
      },
      {
        scope: ['constant.numeric', 'constant.language', 'constant.character', 'support.constant'],
        settings: { foreground: c.number },
      },
      {
        scope: ['punctuation', 'meta.brace', 'keyword.operator', 'meta.tag.punctuation'],
        settings: { foreground: c.punctuation },
      },
      {
        scope: ['entity.name.tag', 'support.class.component', 'entity.name.type', 'support.type'],
        settings: { foreground: c.tag },
      },
      { scope: ['entity.other.attribute-name'], settings: { foreground: c.attribute } },
      { scope: ['entity.name.function', 'support.function', 'meta.function-call'], settings: { foreground: c.fn } },
      {
        scope: ['variable.other.property', 'meta.object-literal.key', 'support.type.property-name'],
        settings: { foreground: c.property },
      },
      { scope: ['markup.inserted'], settings: { foreground: c.keyword } },
      { scope: ['markup.deleted'], settings: { foreground: c.number } },
    ],
  };
}

const dark = theme('aui-dark', 'dark', {
  bg: '#101317',
  fg: '#e8eaed',
  keyword: '#67e8f9',
  string: '#f5c27a',
  number: '#f9a8d4',
  comment: '#8b94a0',
  punctuation: '#a1a9b4',
  tag: '#67e8f9',
  attribute: '#f9a8d4',
  fn: '#f1f3f5',
  property: '#c9d1d9',
});

const light = theme('aui-light', 'light', {
  bg: '#f6f7f9',
  fg: '#0d0f12',
  keyword: '#155e75',
  string: '#9a3412',
  number: '#9d174d',
  comment: '#525b67',
  punctuation: '#4b5563',
  tag: '#155e75',
  attribute: '#9d174d',
  fn: '#0d0f12',
  property: '#1f2937',
});

type CodeLanguage = 'tsx' | 'typescript' | 'bash' | 'css' | 'json' | 'python';

const ALIASES: Record<string, CodeLanguage> = {
  ts: 'typescript',
  typescript: 'typescript',
  tsx: 'tsx',
  jsx: 'tsx',
  js: 'typescript',
  javascript: 'typescript',
  sh: 'bash',
  shell: 'bash',
  bash: 'bash',
  css: 'css',
  json: 'json',
  py: 'python',
  python: 'python',
};

let highlighter: Promise<HighlighterCore> | undefined;

function getHighlighter() {
  highlighter ??= createHighlighterCore({
    themes: [dark, light],
    langs: [
      import('shiki/langs/tsx.mjs'),
      import('shiki/langs/typescript.mjs'),
      import('shiki/langs/bash.mjs'),
      import('shiki/langs/css.mjs'),
      import('shiki/langs/json.mjs'),
      import('shiki/langs/python.mjs'),
    ],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighter;
}

/** Highlighted HTML (a `<pre class="shiki">`) for a code block; unknown languages render as plain text. */
export async function highlight(code: string, language: string | undefined) {
  const lang = (language && ALIASES[language]) ?? 'text';
  const h = await getHighlighter();
  return h.codeToHtml(code, {
    lang,
    themes: { dark: 'aui-dark', light: 'aui-light' },
    defaultColor: false,
  });
}
