// @ts-check
'use strict';

// settingsStore.js requires('electron') at the top, but under plain `node --test`
// (not run inside a real Electron process) that resolves to a harmless string, not
// the real API — so anything touching `app.getPath` (i.e. load()/getSettings/etc.)
// would throw. Only the two pure, exported helpers below are safe/meaningful to
// test outside Electron; the rest is exercised by manual/live app testing instead.

const test = require('node:test');
const assert = require('node:assert/strict');
const { deepMergeInPlace, requireKnownTool } = require('../src/main/store/settingsStore');

test('security regression: deepMergeInPlace rejects a __proto__ patch key instead of polluting Object.prototype', () => {
  const target = { a: 1 };
  const patch = JSON.parse('{"__proto__":{"polluted":"yes"}, "a": 2}');
  deepMergeInPlace(target, patch);
  assert.equal(target.a, 2, 'legitimate keys should still merge normally');
  assert.equal(Object.prototype.polluted, undefined, 'Object.prototype must not be polluted');
  assert.equal(({}).polluted, undefined);
});

test('security regression: deepMergeInPlace rejects constructor/prototype patch keys', () => {
  const target = { nested: { x: 1 } };
  deepMergeInPlace(target, { nested: { constructor: { polluted2: 'yes' }, prototype: { polluted3: 'yes' } } });
  assert.equal(Object.prototype.polluted2, undefined);
  assert.equal(Object.prototype.polluted3, undefined);
});

test('deepMergeInPlace still deep-merges normal nested objects and replaces arrays/primitives wholesale', () => {
  const target = { ui: { windowBounds: { width: 900, height: 1000 } }, list: [1, 2] };
  deepMergeInPlace(target, { ui: { windowBounds: { width: 1200 } }, list: [9] });
  assert.deepEqual(target, { ui: { windowBounds: { width: 1200, height: 1000 } }, list: [9] });
});

test('security regression: requireKnownTool rejects "__proto__" and other unknown tool names', () => {
  assert.throws(() => requireKnownTool('__proto__'));
  assert.throws(() => requireKnownTool('constructor'));
  assert.throws(() => requireKnownTool('not-a-real-tool'));
});

test('requireKnownTool accepts the three known tool names', () => {
  for (const tool of ['claude', 'ffmpeg', 'whisper']) {
    assert.equal(requireKnownTool(tool), tool);
  }
});
