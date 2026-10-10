import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/*
 * Every word a component shows or announces comes from the labels (src/lib/labels.ts), so a
 * translation covers all of it. This reads the components' source and fails on English written
 * into them: text between tags, a string where text or an accessible name goes, or a string handed
 * to the live region or a scroll region's name. labels-locale.test.tsx checks the rendered result.
 */

const src = join(dirname(fileURLToPath(import.meta.url)), '../src');

/** The modules that render or announce: components, their hooks, and the shared primitives. */
const files = [...readdirSync(src).filter((f) => f.endsWith('.tsx') || /^use-.*\.ts$/.test(f)), 'lib/primitives.tsx'];

/** Attributes people read or hear. */
const TEXT_ATTRIBUTES = new Set([
  'aria-label',
  'aria-description',
  'aria-roledescription',
  'aria-valuetext',
  'aria-placeholder',
  'title',
  'placeholder',
  'alt',
  // Our own components' names for what they render (JsonView, the scroll regions).
  'label',
]);

/** Calls whose string arguments are read out. */
const TEXT_CALLS = new Set(['setAnnouncement', 'useScrollRegion', 'announce']);

const WORD = /[A-Za-z]{2,}/;

/** The literal text in a string or template, without its substitutions. */
function literalText(node: ts.Node): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node))
    return [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(' ');
  return undefined;
}

/** Strings an expression can evaluate to directly: through conditionals, `&&`, `??`, `||` and parentheses. */
function resultStrings(node: ts.Expression): ts.Expression[] {
  if (ts.isParenthesizedExpression(node)) return resultStrings(node.expression);
  if (ts.isConditionalExpression(node)) return [...resultStrings(node.whenTrue), ...resultStrings(node.whenFalse)];
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return resultStrings(node.right);
    if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken)
      return [...resultStrings(node.left), ...resultStrings(node.right)];
    if (op === ts.SyntaxKind.PlusToken) return [...resultStrings(node.left), ...resultStrings(node.right)];
  }
  return literalText(node) === undefined ? [] : [node];
}

interface Finding {
  file: string;
  line: number;
  text: string;
}

function scan(file: string, code = readFileSync(join(src, file), 'utf8')): Finding[] {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: Finding[] = [];
  const report = (node: ts.Node, text: string) => {
    if (!WORD.test(text)) return;
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    found.push({ file, line: line + 1, text: text.trim() });
  };
  const visit = (node: ts.Node) => {
    // Text between tags.
    if (ts.isJsxText(node)) report(node, node.text);
    // {'text'} or {cond ? 'a' : 'b'} as a child.
    if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent)) {
      for (const s of resultStrings(node.expression)) report(s, literalText(s)!);
    }
    // aria-label="…", title={'…'}, placeholder={`…`}.
    if (ts.isJsxAttribute(node) && TEXT_ATTRIBUTES.has(node.name.getText(source)) && node.initializer) {
      const value = node.initializer;
      if (ts.isStringLiteral(value)) report(value, value.text);
      else if (ts.isJsxExpression(value) && value.expression)
        for (const s of resultStrings(value.expression)) report(s, literalText(s)!);
    }
    // { 'aria-label': '…' } in a prop getter.
    if (
      ts.isPropertyAssignment(node) &&
      TEXT_ATTRIBUTES.has(literalText(node.name) ?? node.name.getText(source)) &&
      node.name.getText(source) !== 'label'
    ) {
      for (const s of resultStrings(node.initializer)) report(s, literalText(s)!);
    }
    // setAnnouncement('…'), useScrollRegion(`…`).
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : undefined;
      const base = name?.replace(/<.*$/, '');
      if (base && TEXT_CALLS.has(base))
        for (const arg of node.arguments) for (const s of resultStrings(arg)) report(s, literalText(s)!);
    }
    // A default for a prop that is text: `title = 'Review changes'`.
    if (
      ts.isBindingElement(node) &&
      node.initializer &&
      /^(title|label|placeholder|\w+Label|\w+Placeholder)$/.test(
        node.propertyName?.getText(source) ?? node.name.getText(source),
      )
    ) {
      for (const s of resultStrings(node.initializer)) report(s, literalText(s)!);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('labels: no English in the components', () => {
  it('reads the files it should', () => {
    expect(files).toEqual(
      expect.arrayContaining([
        'agent-message.tsx',
        'approval-card.tsx',
        'diff-review.tsx',
        'use-diff-review.ts',
        'tool-call-timeline.tsx',
        'lib/primitives.tsx',
      ]),
    );
  });

  it.each(files)('%s takes its words from the labels', (file) => {
    expect(scan(file).map((f) => `${f.file}:${f.line}: ${f.text}`)).toEqual([]);
  });

  it('catches English written into a component', () => {
    const code = `
      export function Card({ title = 'Untitled', onClose }) {
        const [a, setAnnouncement] = useState('');
        const ref = useScrollRegion('Command');
        const close = () => setAnnouncement(\`Closed \${title}\`);
        return (
          <section aria-label="Approval" title={busy ? 'Working' : undefined}>
            <h3>{title}</h3>
            Approve now
            {done && ' so far'}
            <input placeholder={\`Why\`} />
            <JsonView label="Input" value={1} />
            <Kbd>Y</Kbd> <span>{count}/{total}</span> <span>·</span>
          </section>
        );
      }
      const props = () => ({ 'aria-label': ok ? 'Accepted' : name });
    `;
    expect(scan('sample.tsx', code).map((f) => f.text)).toEqual([
      'Untitled',
      'Command',
      'Closed',
      'Approval',
      'Working',
      'Approve now',
      'so far',
      'Why',
      'Input',
      'Accepted',
    ]);
  });
});
