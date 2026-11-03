import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalBlockFrom } from './sync.mjs';

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
