// The package publishes the repository's README, so there is one README to keep up to date.
// npm takes README.md from the package folder, so while the package is packed this writes
// one there from ../../README.md, made to work on npm:
// - the demo video (a github.com/user-attachments URL, which only plays on github.com and
//   404s elsewhere for anyone signed out) is swapped for the image in the
//   `<!-- npm-readme:image … -->` comment that follows `<!-- npm-readme:video -->`;
// - relative links and images (`docs/media/…`, `examples/…`, `./LICENSE`) point at GitHub,
//   since npm would resolve them against this package's folder.
//
//   node scripts/npm-readme.mjs prepack    writes README.md for the tarball
//   node scripts/npm-readme.mjs postpack   removes it again
//   node scripts/npm-readme.mjs --print    prints it, changing nothing
import fs from 'node:fs';
import path from 'node:path';

const pkg = path.resolve(import.meta.dirname, '..');
const source = path.join(pkg, '../../README.md');
const target = path.join(pkg, 'README.md');

const BLOB = 'https://github.com/dgesteves/agent-ui-kit/blob/main/';
const RAW = 'https://raw.githubusercontent.com/dgesteves/agent-ui-kit/main/';
const VIDEO = '<!-- npm-readme:video -->';
const IMAGE = '<!-- npm-readme:image';
const RELATIVE = /^(?![a-z][a-z\d+.-]*:|#|\/\/)/i;

function swapVideo(text) {
  const start = text.indexOf(VIDEO);
  const image = text.indexOf(IMAGE);
  const end = image === -1 ? -1 : text.indexOf('-->', image);
  if (start === -1 || image < start || end === -1) {
    throw new Error(`README.md: expected ${VIDEO}, then ${IMAGE} … --> around the demo video`);
  }
  const replacement = text.slice(image + IMAGE.length, end).trim();
  return `${text.slice(0, start)}${replacement}\n${text.slice(end + 3).replace(/^[ \t]*\n/, '')}`;
}

const absolute = (base, url) => (RELATIVE.test(url) ? base + url.replace(/^\.\//, '') : url);

export function toNpmReadme(text) {
  const out = swapVideo(text)
    .replace(/(!\[[^\]]*\]\()([^)\s]+)/g, (_, head, url) => head + absolute(RAW, url))
    // Images are absolute by now, so whatever is still relative here is a link (badges included).
    .replace(/(\]\()([^)\s]+)/g, (_, head, url) => head + absolute(BLOB, url))
    .replace(/(<(?:img|source)\b[^>]*\bsrc=")([^"]+)/g, (_, head, url) => head + absolute(RAW, url))
    .replace(/(<a\b[^>]*\bhref=")([^"]+)/g, (_, head, url) => head + absolute(BLOB, url));
  if (/https:\/\/github\.com\/user-attachments\//.test(out)) {
    throw new Error('README.md: a github.com/user-attachments link is left for npm');
  }
  const relative = [...out.matchAll(/\]\(([^)\s]+)|\b(?:src|href)="([^"]+)"/g)]
    .map((m) => m[1] ?? m[2])
    .filter((url) => RELATIVE.test(url));
  if (relative.length) throw new Error(`README.md: relative links left for npm: ${relative.join(', ')}`);
  return out;
}

const mode = process.argv[2];
if (mode === '--print') {
  process.stdout.write(toNpmReadme(fs.readFileSync(source, 'utf8')));
} else if (mode === 'prepack') {
  fs.writeFileSync(target, toNpmReadme(fs.readFileSync(source, 'utf8')));
} else if (mode === 'postpack') {
  fs.rmSync(target, { force: true });
} else {
  console.error('usage: node scripts/npm-readme.mjs prepack | postpack | --print');
  process.exit(1);
}
