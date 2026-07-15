// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Read a JSON file, merging its contents shallowly over `defaults`.
 * Missing file -> defaults. Corrupt file -> quarantined (renamed aside) and defaults returned,
 * so a bad write never prevents the app from launching.
 * @param {string} filePath
 * @param {object} defaults
 * @returns {object}
 */
function readJsonWithDefaults(filePath, defaults) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return structuredClone(defaults);
    throw err;
  }
  try {
    const parsed = JSON.parse(raw);
    return { ...structuredClone(defaults), ...parsed };
  } catch {
    try {
      fs.renameSync(filePath, `${filePath}.corrupt-${Date.now()}`);
    } catch {
      // best-effort quarantine; fall through to defaults regardless
    }
    return structuredClone(defaults);
  }
}

/**
 * Write JSON atomically: write to a temp file in the same directory, then rename over the target.
 * Rename is atomic on the same volume on both POSIX and NTFS, so a crash mid-write can't
 * leave a half-written, corrupt store file.
 * @param {string} filePath
 * @param {object} data
 */
function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`);
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

/**
 * Serialize async writes against one file so concurrent mutations (e.g. a background
 * status refresh and a user edit landing at the same time) can't race each other.
 * @returns {(fn: () => any) => Promise<any>}
 */
function createWriteQueue() {
  let chain = Promise.resolve();
  return (fn) => {
    chain = chain.then(fn, fn);
    return chain;
  };
}

module.exports = { readJsonWithDefaults, writeJsonAtomic, createWriteQueue };
