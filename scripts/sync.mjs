#!/usr/bin/env node
/**
 * Push the canonical token block into every consumer.
 *
 * Consumers stay self-contained (no cross-repo install, no private registry):
 * each one embeds the block between the markers below and pins its hash in
 * tokens.lock. Their CI runs the copied scripts/check-tokens.mjs, which fails
 * when the embedded block and the lock disagree.
 *
 * Usage: node scripts/sync.mjs [--check]
 *   (no flag) rewrite consumers and refresh their locks
 *   --check   only report whether every consumer is in sync (exit 1 if not)
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));

export const BEGIN_MARKER =
  '/* @bayjf/console-ui:begin — generated from bayjf/console-ui; do not edit by hand */';
export const END_MARKER = '/* @bayjf/console-ui:end */';

/** Consumers live beside this repo under 000mycodes/. */
const CONSUMERS = [
  {
    css: join(REPO, '../ops-console/src/styles/tokens.css'),
    scripts: join(REPO, '../ops-console/scripts'),
  },
  {
    css: join(REPO, '../model-hub/apps/hub/web/src/styles/tokens.css'),
    scripts: join(REPO, '../model-hub/scripts'),
  },
];

/** Extract the canonical `:root { … }` block from css text (CRLF-safe). */
export function canonicalBlockFrom(css) {
  const normalized = css.replace(/\r\n/g, '\n');
  const start = normalized.indexOf(':root {');
  const end = normalized.indexOf('\n}', start);
  if (start < 0 || end < 0) throw new Error('tokens.css has no :root block');
  return normalized.slice(start, end + 2);
}

/** Extract the canonical `:root { … }` block (the only thing shared). */
export function canonicalBlock() {
  return canonicalBlockFrom(readFileSync(join(REPO, 'tokens.css'), 'utf8'));
}

export function hashBlock(block) {
  const normalized = block
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
  return createHash('sha256').update(normalized).digest('hex');
}

function wrapped(block) {
  return `${BEGIN_MARKER}\n${block}\n${END_MARKER}`;
}

/** Keep each consumer's local checker byte-identical to the canonical one. */
function copyChecker(scriptsDir) {
  mkdirSync(scriptsDir, { recursive: true });
  copyFileSync(join(REPO, 'scripts/check-tokens.mjs'), join(scriptsDir, 'check-tokens.mjs'));
}

function replaceBlock(file, block) {
  const css = readFileSync(file, 'utf8');
  const start = css.indexOf(BEGIN_MARKER);
  const end = css.indexOf(END_MARKER);
  if (start >= 0 && end > start) {
    return css.slice(0, start) + wrapped(block) + css.slice(end + END_MARKER.length);
  }
  // First run: the hand-written block has no markers yet — replace the first
  // top-level :root block with the marked copy.
  const rootStart = css.indexOf(':root {');
  const rootEnd = css.indexOf('\n}', rootStart);
  if (rootStart < 0 || rootEnd < 0) throw new Error(`${file}: no :root block to replace`);
  return css.slice(0, rootStart) + wrapped(block) + css.slice(rootEnd + 2);
}

/**
 * Consumers come from --css/--scripts pairs when given (used against git
 * worktrees), otherwise from the default sibling layout.
 */
function resolveConsumers() {
  const args = process.argv;
  const pairs = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--css') {
      const css = args[i + 1];
      const scriptsIdx = args.indexOf('--scripts', i);
      const scripts = scriptsIdx > -1 ? args[scriptsIdx + 1] : join(dirname(css), '../../scripts');
      if (!css) throw new Error('--css requires a path');
      pairs.push({ css, scripts: scripts ?? scriptDirFor(css) });
    }
  }
  return pairs.length > 0 ? pairs : CONSUMERS;
}

function scriptDirFor(cssPath) {
  return join(dirname(cssPath), '../../scripts');
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const block = canonicalBlock();
  const hash = hashBlock(block);
  let drift = 0;

  for (const consumer of resolveConsumers()) {
    const file = consumer.css;
    if (!existsSync(file)) {
      console.warn(`skip (missing): ${file}`);
      continue;
    }
    const css = readFileSync(file, 'utf8');
    const start = css.indexOf(BEGIN_MARKER);
    const end = css.indexOf(END_MARKER);
    const embedded = start >= 0 && end > start
      ? css.slice(start + BEGIN_MARKER.length, end)
      : css.slice(css.indexOf(':root {'), css.indexOf('\n}', css.indexOf(':root {')) + 2);

    if (hashBlock(embedded) === hash) {
      if (!checkOnly) {
        writeFileSync(`${dirname(file)}/tokens.lock`, `${hash}\n`);
        copyChecker(consumer.scripts);
      }
      console.log(`ok: ${file}`);
      continue;
    }
    drift += 1;
    if (checkOnly) {
      console.error(`drift: ${file}`);
      continue;
    }
    writeFileSync(file, replaceBlock(file, block));
    writeFileSync(`${dirname(file)}/tokens.lock`, `${hash}\n`);
    copyChecker(consumer.scripts);
    console.log(`synced: ${file}`);
  }

  if (checkOnly && drift > 0) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
