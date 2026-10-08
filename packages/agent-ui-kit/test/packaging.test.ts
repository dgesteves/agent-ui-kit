import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as core from '../src/core';
import * as index from '../src/index';

/*
 * React Server Components: client components and hooks need a 'use client'
 * directive in their own module (the registry copies src/ verbatim, and the
 * build preserves per-module directives), while the pure helpers must stay
 * free of it so Server Components and Route Handlers can call them.
 */

const src = join(dirname(fileURLToPath(import.meta.url)), '../src');

function modules(dir = src): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'styles' ? [] : modules(path);
    return /\.tsx?$/.test(entry.name) ? [relative(src, path)] : [];
  });
}

const code = (file: string) => readFileSync(join(src, file), 'utf8');
const isClient = (file: string) => /^(['"])use client\1;/.test(code(file));

/** Runtime (non-type) relative imports, resolved to files under src/. */
function localImports(file: string): string[] {
  const out: string[] = [];
  for (const m of code(file).matchAll(/^(?:import|export)(?!\s+type\b)[^;]*?from\s+'(\.[^']+)'/gm)) {
    const base = join(dirname(file), m[1]!);
    const found = ['.ts', '.tsx'].map((ext) => base + ext).find((f) => modules().includes(f));
    if (found) out.push(found);
  }
  return out;
}

function closure(entry: string): string[] {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    localImports(file).forEach(visit);
  };
  visit(entry);
  return [...seen];
}

describe('server/client module boundaries', () => {
  it('marks every module that uses hooks, state or event handlers as a client module', () => {
    const needsDirective = modules().filter((file) =>
      /\b(use[A-Z]\w*|memo)\(|from 'radix-ui'|\bon[A-Z]\w*=\{/.test(code(file)),
    );
    expect(needsDirective.length).toBeGreaterThan(5);
    expect(needsDirective.filter((file) => !isClient(file))).toEqual([]);
  });

  it('keeps the entry points and the pure helpers free of the directive', () => {
    expect(isClient('index.ts')).toBe(false);
    expect(isClient('core.ts')).toBe(false);
    const coreModules = closure('core.ts');
    expect(coreModules.filter(isClient)).toEqual([]);
    // No React at runtime: the core entry is safe in Route Handlers and plain Node.
    expect(coreModules.filter((file) => file.endsWith('.tsx') || /from 'react'/.test(code(file)))).toEqual([]);
    // The AG-UI entry: its hook is a client module, its converters and reducer are not.
    expect(isClient('ag-ui.ts')).toBe(false);
    expect(isClient('use-ag-ui-agent.ts')).toBe(true);
    expect(closure('lib/ag-ui.ts').filter((file) => isClient(file) || /from 'react'/.test(code(file)))).toEqual([]);
  });

  it('exposes the pure helpers from /core and re-exports them from the main entry', () => {
    for (const name of [
      'applyHunks',
      'parseFileChange',
      'inferLanguage',
      'computeReviewResult',
      'addUsage',
      'estimateCost',
      'formatCost',
      'formatDuration',
      'formatTokens',
      'humanizeToolName',
      'deriveAgentState',
      'getApprovalStatus',
      'getSourceParts',
      'getToolPartName',
      'getToolParts',
      'getToolPhase',
      'isSourcePart',
      'isToolPart',
      'observeToolTimings',
      'toSourceItem',
      'cn',
      'AGENT_STATE_LABEL',
      'TOOL_PHASE_LABEL',
      'TOOL_STATES',
    ]) {
      expect(core, name).toHaveProperty(name);
      expect((index as Record<string, unknown>)[name], name).toBe((core as Record<string, unknown>)[name]);
    }
  });
});

describe('ai peer range', () => {
  const pkg = JSON.parse(readFileSync(join(src, '../package.json'), 'utf8')) as {
    peerDependencies: Record<string, string>;
  };
  const range = pkg.peerDependencies.ai!;

  it('takes AI SDK 6, and AI SDK 7 from the release that settles automatically denied calls', () => {
    // CI runs the suite against AI SDK 6 too. On 7, before 7.0.102 a call that a toolApproval
    // policy denied could stay unsettled and read "Running".
    const [six, seven] = range.split(' || ');
    expect(six).toBe('^6.0.0');
    const [, minor, patch] = /^\^7\.(\d+)\.(\d+)$/.exec(seven ?? '') ?? [];
    expect({ range, ok: Number(minor) > 0 || Number(patch) >= 102 }).toEqual({ range, ok: true });
  });

  it('is the range the READMEs state', () => {
    for (const readme of ['../README.md', '../../../README.md']) {
      expect(readFileSync(join(src, readme), 'utf8')).toContain(`ai@${range}`);
    }
  });
});
