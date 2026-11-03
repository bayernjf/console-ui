import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BEGIN_MARKER,
  END_MARKER,
  canonicalBlockFrom,
  extractEmbeddedBlock,
  hashBlock,
} from './sync.mjs';

const CANONICAL = `:root {
  --ink: #e8edf2;
  --surface: #10151b;
}
`;
// canonicalBlockFrom slices up to and including the closing brace, without
// the trailing newline.
const BLOCK = CANONICAL.trimEnd();

test('canonicalBlockFrom extracts the :root block', () => {
  assert.equal(canonicalBlockFrom(`/* header */\n${CANONICAL}\n.other {}\n`), BLOCK);
});

test('canonicalBlockFrom tolerates CRLF input (P2-3)', () => {
  const crlf = CANONICAL.replace(/\n/g, '\r\n');
  assert.equal(canonicalBlockFrom(crlf), BLOCK);
});

test('canonicalBlockFrom rejects css without a :root block', () => {
  assert.throws(() => canonicalBlockFrom('.a { color: red }\n'), /no :root block/);
});

test('extractEmbeddedBlock prefers the marked block', () => {
  const css = `x\n${BEGIN_MARKER}\n${CANONICAL}\n${END_MARKER}\ny\n`;
  assert.equal(extractEmbeddedBlock(css, 'consumer/tokens.css'), `\n${CANONICAL}\n`);
});

test('extractEmbeddedBlock falls back to the first :root block', () => {
  assert.equal(extractEmbeddedBlock(`p {}\n${CANONICAL}`, 'consumer/tokens.css'), BLOCK);
});

test('extractEmbeddedBlock errors clearly when neither markers nor :root exist (P2-2)', () => {
  assert.throws(
    () => extractEmbeddedBlock('/* nothing here */\n', 'consumer/tokens.css'),
    /consumer\/tokens\.css: missing sync markers/,
  );
});

test('CRLF consumer file hashes identically to the LF canonical block (P2-3)', () => {
  const marked = `${BEGIN_MARKER}\r\n${CANONICAL.replace(/\n/g, '\r\n')}\r\n${END_MARKER}\r\n`;
  assert.equal(hashBlock(extractEmbeddedBlock(marked, 'c')), hashBlock(CANONICAL));
});
