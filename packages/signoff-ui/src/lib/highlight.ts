/**
 * A deliberately small, line-oriented syntax tokenizer. It covers the languages
 * agents edit most (TS/JS/JSON/CSS/shell/YAML/Python) well enough for review UI
 * without shipping a grammar engine. Multi-line constructs are tokenized per line.
 */
export type TokenKind = 'plain' | 'keyword' | 'string' | 'number' | 'comment' | 'punctuation' | 'property';

export interface Token {
  text: string;
  kind: TokenKind;
}

const JS_KEYWORDS = new Set(
  (
    'abstract as async await break case catch class const continue debugger declare default delete do else enum export extends ' +
    'false finally for from function get if implements import in instanceof interface let new null of private protected public ' +
    'readonly return satisfies set static super switch this throw true try type typeof undefined var void while with yield'
  ).split(' '),
);
const PY_KEYWORDS = new Set(
  'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield'.split(
    ' ',
  ),
);
const SH_KEYWORDS = new Set(
  'if then else elif fi for in do done while case esac function export local return'.split(' '),
);
const LITERALS = new Set(['true', 'false', 'null']);

const HASH_COMMENT = new Set(['sh', 'py', 'yaml']);

const RULES: Array<[RegExp, TokenKind | 'word']> = [
  [/^\/\/.*/, 'comment'],
  [/^\/\*.*?(\*\/|$)/, 'comment'],
  [/^"(?:[^"\\]|\\.)*"?/, 'string'],
  [/^'(?:[^'\\]|\\.)*'?/, 'string'],
  [/^`(?:[^`\\]|\\.)*`?/, 'string'],
  [/^-?(?:0x[\da-f]+|\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?)\b/i, 'number'],
  [/^[A-Za-z_$][\w$-]*/, 'word'],
  [/^\s+/, 'plain'],
  [/^[{}()[\];,.<>/=+\-*!?:&|%^~@#]/, 'punctuation'],
];

export function tokenizeLine(line: string, language = 'text'): Token[] {
  if (language === 'text' || language === 'md' || !line) return [{ text: line, kind: 'plain' }];
  const tokens: Token[] = [];
  const keywords = language === 'py' ? PY_KEYWORDS : language === 'sh' ? SH_KEYWORDS : JS_KEYWORDS;
  let rest = line;
  while (rest.length > 0) {
    if (HASH_COMMENT.has(language) && rest.startsWith('#')) {
      tokens.push({ text: rest, kind: 'comment' });
      break;
    }
    let matched = false;
    for (const [re, kind] of RULES) {
      if (
        (kind === 'comment' && HASH_COMMENT.has(language)) ||
        (language === 'css' && kind === 'comment' && re.source.startsWith('^\\/\\/'))
      )
        continue;
      const m = re.exec(rest);
      if (!m) continue;
      const text = m[0];
      let resolved: TokenKind;
      if (kind === 'word') {
        if (language === 'json') resolved = LITERALS.has(text) ? 'keyword' : 'plain';
        else if (language === 'css') resolved = /^\s*:/.test(rest.slice(text.length)) ? 'property' : 'plain';
        else if (language === 'yaml')
          resolved = /^\s*:/.test(rest.slice(text.length)) ? 'property' : LITERALS.has(text) ? 'keyword' : 'plain';
        else resolved = keywords.has(text) ? 'keyword' : 'plain';
        // Identifiers may not contain '-' outside CSS/YAML/shell; give the dash back.
        if (text.includes('-') && !['css', 'yaml', 'sh'].includes(language)) {
          const word = text.slice(0, text.indexOf('-'));
          tokens.push({ text: word, kind: keywords.has(word) ? 'keyword' : 'plain' });
          rest = rest.slice(word.length);
          matched = true;
          break;
        }
      } else if (
        kind === 'string' &&
        (language === 'json' || language === 'yaml') &&
        /^\s*:/.test(rest.slice(text.length))
      ) {
        resolved = 'property';
      } else {
        resolved = kind;
      }
      pushToken(tokens, text, resolved);
      rest = rest.slice(text.length);
      matched = true;
      break;
    }
    if (!matched) {
      pushToken(tokens, rest[0]!, 'plain');
      rest = rest.slice(1);
    }
  }
  return tokens;
}

function pushToken(tokens: Token[], text: string, kind: TokenKind) {
  const prev = tokens.at(-1);
  if (prev && prev.kind === kind) prev.text += text;
  else tokens.push({ text, kind });
}

export interface HighlightedPiece extends Token {
  changed: boolean;
}

/** Split syntax tokens along word-diff boundaries so both can be rendered at once. */
export function mergeTokensWithSegments(
  tokens: readonly Token[],
  segments: ReadonlyArray<{ text: string; changed: boolean }> | undefined,
): HighlightedPiece[] {
  if (!segments || segments.length === 0) return tokens.map((t) => ({ ...t, changed: false }));
  const out: HighlightedPiece[] = [];
  let ti = 0;
  let tOffset = 0;
  for (const seg of segments) {
    let remaining = seg.text.length;
    while (remaining > 0 && ti < tokens.length) {
      const token = tokens[ti]!;
      const available = token.text.length - tOffset;
      const take = Math.min(available, remaining);
      out.push({ text: token.text.slice(tOffset, tOffset + take), kind: token.kind, changed: seg.changed });
      remaining -= take;
      tOffset += take;
      if (tOffset >= token.text.length) {
        ti++;
        tOffset = 0;
      }
    }
  }
  return out;
}

export const TOKEN_CLASS: Record<TokenKind, string> = {
  plain: '',
  keyword: 'text-signoff-code-keyword',
  string: 'text-signoff-code-string',
  number: 'text-signoff-code-number',
  comment: 'text-signoff-code-comment italic',
  punctuation: 'text-signoff-code-punctuation',
  property: 'text-signoff-code-keyword',
};
