// @ts-check
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { app, dialog } = require('electron');
const { readJsonWithDefaults, writeJsonAtomic, createWriteQueue } = require('./jsonStore');

const TOOLS = /** @type {const} */ (['claude', 'ffmpeg', 'whisper']);
// whispermlx (Apple Silicon-accelerated) is the preferred variant on Mac; `whisperx`
// is the cross-platform pick (Windows has no MLX support at all), and plain `whisper`
// (openai-whisper) / `mlx_whisper` are kept as selectable alternatives since all four
// are commonly installed side by side via pyenv/uv and shadow each other on PATH.
const WHISPER_VARIANTS = ['whispermlx', 'whisperx', 'mlx_whisper', 'whisper'];
const CLAUDE_MODEL_OPTIONS = ['default', 'sonnet', 'opus', 'fable'];
const CLAUDE_EFFORT_OPTIONS = ['default', 'low', 'medium', 'high', 'xhigh', 'max'];

/** @returns {object} */
function makeDefaultToolEntry() {
  return { mode: 'auto', overridePath: null, autoDetectedPath: null, resolvedPath: null, status: 'not_found', lastCheckedAt: null };
}

function defaultSettings() {
  return {
    schemaVersion: 1,
    defaultVibe: 'Cinematic & Emotional',
    defaultPacing: 'Moderate',
    ui: {
      reopenLastProjectOnLaunch: true,
      windowBounds: { width: 1440, height: 900, x: null, y: null },
    },
    workflows: { overrideDir: null },
    // 'default' for either field means "don't write it into the project's
    // .claude/settings.json at all" — Claude Code then falls back to whatever the
    // user's own global ~/.claude/settings.json already specifies.
    claudeOptions: { model: 'sonnet', effort: 'xhigh' },
    tools: {
      claude: makeDefaultToolEntry(),
      ffmpeg: makeDefaultToolEntry(),
      whisper: { ...makeDefaultToolEntry(), variant: 'whispermlx' },
    },
    // Separate from `tools` since it's a directory (a git clone), not a PATH binary —
    // same {mode, overridePath, autoDetectedPath, resolvedPath, status} shape, but
    // detected via directory-existence rather than PATH search.
    buttercut: makeDefaultToolEntry(),
    // Reusable Prompt box text, global (not per-project) so a template built for one
    // project's vision/instructions can be loaded again in a future project.
    promptTemplates: /** @type {{id: string, name: string, text: string}[]} */ ([]),
  };
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'lp5000-settings.json');
}

/** @type {object | null} */
let cache = null;
const enqueue = createWriteQueue();

function load() {
  if (cache) return cache;
  const isFirstLaunch = !fs.existsSync(settingsPath());
  cache = readJsonWithDefaults(settingsPath(), defaultSettings());
  // readJsonWithDefaults only merges shallowly, so additive nested fields (added to
  // defaultSettings() after a user's settings.json already existed) never backfill
  // on their own — an existing `tools` or missing `claudeOptions` key from before
  // these fields existed would otherwise leave `whisper.variant` as undefined.
  let backfilledWhisperVariant = false;
  if (!cache.claudeOptions) cache.claudeOptions = defaultSettings().claudeOptions;
  if (!cache.tools.whisper.variant) {
    cache.tools.whisper.variant = 'whispermlx';
    backfilledWhisperVariant = !isFirstLaunch;
  }
  if (isFirstLaunch) {
    writeJsonAtomic(settingsPath(), cache);
    // Non-blocking initial tool detection so the settings panel has real data
    // the first time the user opens it, without delaying app startup.
    for (const tool of TOOLS) detectTool(tool).catch(() => {});
    detectButtercut().catch(() => {});
  } else {
    if (backfilledWhisperVariant) {
      // An upgrade from a settings.json predating whisper variants: re-detect so a
      // stale resolvedPath pointing at the wrong whisper binary doesn't linger.
      detectTool('whisper').catch(() => {});
    }
    if (!cache.buttercut.lastCheckedAt) detectButtercut().catch(() => {});
  }
  return cache;
}

function persist() {
  const snapshot = structuredClone(cache);
  return enqueue(() => writeJsonAtomic(settingsPath(), snapshot));
}

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Deep-merge a plain-object patch into target, in place. Arrays/primitives replace
 * wholesale. Rejects __proto__/constructor/prototype keys — this patch object
 * ultimately comes from the renderer over IPC, and merging those keys unguarded
 * would let a hostile patch pollute Object.prototype in this (Node) process.
 */
function deepMergeInPlace(target, patch) {
  for (const key of Object.keys(patch)) {
    if (UNSAFE_KEYS.has(key)) continue;
    const value = patch[key];
    if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object') {
      deepMergeInPlace(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

function getSettings() {
  return structuredClone(load());
}

async function updateSettings(patch) {
  deepMergeInPlace(load(), patch);
  await persist();
  return getSettings();
}

// --- Tool path detection ---------------------------------------------------

/** @type {string[] | null} */
let cachedShellPathDirs = null;

/**
 * A GUI app launched from Finder/Dock does not inherit the user's login-shell PATH
 * the way a Terminal-launched process does, so tools installed via shims that only
 * live on the shell rc-file PATH (e.g. `uv tool install`-managed whisper) can be
 * invisible to a naive `process.env.PATH` lookup even though they work fine from
 * Terminal. Query the user's actual login shell once and merge it in.
 * @returns {string[]}
 */
function getPathDirs() {
  const fromEnv = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  if (process.platform === 'win32') return fromEnv;
  if (cachedShellPathDirs) return [...new Set([...fromEnv, ...cachedShellPathDirs])];
  try {
    const shell = process.env.SHELL || '/bin/zsh';
    const result = spawnSync(shell, ['-ilc', 'echo $PATH'], { encoding: 'utf-8', timeout: 3000 });
    cachedShellPathDirs = (result.stdout || '').trim().split(path.delimiter).filter(Boolean);
  } catch {
    cachedShellPathDirs = [];
  }
  return [...new Set([...fromEnv, ...cachedShellPathDirs])];
}

function isExecutable(candidatePath) {
  try {
    fs.accessSync(candidatePath, fs.constants.X_OK);
    return fs.statSync(candidatePath).isFile();
  } catch {
    return false;
  }
}

/**
 * @param {string} names Candidate binary base names to try, in priority order.
 * @returns {string | null}
 */
function resolveOnPath(names) {
  const dirs = getPathDirs();
  const suffixes = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of dirs) {
    for (const name of names) {
      for (const suffix of suffixes) {
        const candidate = path.join(dir, name + suffix);
        if (isExecutable(candidate)) return candidate;
      }
    }
  }
  return null;
}

function candidateNamesFor(tool) {
  if (tool === 'whisper') return [load().tools.whisper.variant || 'whispermlx'];
  return [tool];
}

/**
 * `tool` ultimately comes from the renderer over IPC — reject anything but the
 * known tool names before using it to index settings.tools[tool], since an
 * unvalidated key like "__proto__" would otherwise resolve through the prototype
 * chain to the real Object.prototype and let a hostile caller pollute it.
 * @param {string} tool
 */
function requireKnownTool(tool) {
  if (!TOOLS.includes(tool)) throw new Error(`Unknown tool: ${tool}`);
  return /** @type {'claude'|'ffmpeg'|'whisper'} */ (tool);
}

/** @param {'claude'|'ffmpeg'|'whisper'} tool */
async function detectTool(tool) {
  tool = requireKnownTool(tool);
  const settings = load();
  const entry = settings.tools[tool];
  entry.autoDetectedPath = resolveOnPath(candidateNamesFor(tool));
  entry.lastCheckedAt = new Date().toISOString();
  recomputeResolved(entry);
  await persist();
  return structuredClone(entry);
}

function recomputeResolved(entry) {
  if (entry.mode === 'manual') {
    if (entry.overridePath && isExecutable(entry.overridePath)) {
      entry.resolvedPath = entry.overridePath;
      entry.status = 'ok';
    } else {
      entry.resolvedPath = entry.autoDetectedPath || null;
      entry.status = 'invalid_override';
    }
  } else {
    entry.resolvedPath = entry.autoDetectedPath || null;
    entry.status = entry.resolvedPath ? 'ok' : 'not_found';
  }
}

/**
 * Switch which whisper binary auto-detection searches for (whispermlx/mlx_whisper/
 * whisper are distinct installs that can all be present at once, shadowing each
 * other on PATH) and immediately re-detect against the new name.
 * @param {string} variant
 */
async function setWhisperVariant(variant) {
  if (!WHISPER_VARIANTS.includes(variant)) throw new Error(`Unknown whisper variant: ${variant}`);
  load().tools.whisper.variant = variant;
  return detectTool('whisper');
}

/** @param {'claude'|'ffmpeg'|'whisper'} tool @param {string | null} overridePath */
async function setToolOverride(tool, overridePath) {
  tool = requireKnownTool(tool);
  const settings = load();
  const entry = settings.tools[tool];
  entry.mode = overridePath ? 'manual' : 'auto';
  entry.overridePath = overridePath || null;
  recomputeResolved(entry);
  await persist();
  return structuredClone(entry);
}

/** @param {'claude'|'ffmpeg'|'whisper'} tool */
async function browseForToolBinary(tool) {
  tool = requireKnownTool(tool);
  const result = await dialog.showOpenDialog({ properties: ['openFile'], title: `Locate ${tool}` });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  return setToolOverride(tool, result.filePaths[0]);
}

/** @param {'claude'|'ffmpeg'|'whisper'} tool */
function getResolvedToolPath(tool) {
  tool = requireKnownTool(tool);
  return load().tools[tool].resolvedPath || null;
}

// --- ButterCut install directory (git clone, not a PATH binary) ------------

/** @param {string} dirPath @returns {boolean} */
function isButtercutDir(dirPath) {
  try {
    return fs.existsSync(path.join(dirPath, 'lib', 'buttercut', 'version.rb')) && fs.existsSync(path.join(dirPath, 'skills'));
  } catch {
    return false;
  }
}

function recomputeButtercutResolved(entry) {
  if (entry.mode === 'manual') {
    if (entry.overridePath && isButtercutDir(entry.overridePath)) {
      entry.resolvedPath = entry.overridePath;
      entry.status = 'ok';
    } else {
      entry.resolvedPath = entry.autoDetectedPath || null;
      entry.status = 'invalid_override';
    }
  } else {
    entry.resolvedPath = entry.autoDetectedPath || null;
    entry.status = entry.resolvedPath ? 'ok' : 'not_found';
  }
}

async function detectButtercut() {
  const settings = load();
  const entry = settings.buttercut;
  const candidate = path.join(os.homedir(), 'Buttercut');
  entry.autoDetectedPath = isButtercutDir(candidate) ? candidate : null;
  entry.lastCheckedAt = new Date().toISOString();
  recomputeButtercutResolved(entry);
  await persist();
  return structuredClone(entry);
}

/** @param {string | null} dirPath */
async function setButtercutOverride(dirPath) {
  const settings = load();
  const entry = settings.buttercut;
  entry.mode = dirPath ? 'manual' : 'auto';
  entry.overridePath = dirPath || null;
  recomputeButtercutResolved(entry);
  await persist();
  return structuredClone(entry);
}

async function browseForButtercutDir() {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Locate your ButterCut folder' });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  return setButtercutOverride(result.filePaths[0]);
}

function getResolvedButtercutPath() {
  return load().buttercut.resolvedPath || null;
}

/**
 * Pulls the latest commits into the resolved ButterCut clone. Uses spawnSync with an
 * argv array (never a shell string), so the resolved directory path is passed as a
 * literal argument and can't be interpreted as shell syntax regardless of its contents.
 * Refuses to pull over uncommitted local changes rather than silently discarding them.
 */
async function updateButtercut() {
  const dirPath = getResolvedButtercutPath();
  if (!dirPath) throw new Error('ButterCut location is not set — auto-detect or browse for it first in Settings.');

  const status = spawnSync('git', ['-C', dirPath, 'status', '--porcelain'], { encoding: 'utf-8', timeout: 10000 });
  if (status.error || status.status !== 0) {
    throw new Error(`git status failed: ${status.error?.message || status.stderr || 'unknown error'}`);
  }
  if (status.stdout.trim()) {
    throw new Error('ButterCut has uncommitted local changes — commit or stash them (inside the ButterCut folder) before updating.');
  }

  const pull = spawnSync('git', ['-C', dirPath, 'pull', '--ff-only', 'origin', 'main'], { encoding: 'utf-8', timeout: 60000 });
  if (pull.error || pull.status !== 0) {
    throw new Error(`git pull failed: ${pull.error?.message || pull.stderr || pull.stdout || 'unknown error'}`);
  }
  return { output: pull.stdout.trim() };
}

// --- Workflow directory resolution -----------------------------------------

function getWorkflowsDirs() {
  const settings = load();
  const bundledDir = path.join(app.getAppPath(), 'assets', 'Workflows');
  const userDir = path.join(app.getPath('userData'), 'workflows');
  const overrideDir = settings.workflows.overrideDir;
  const effectiveDirs = overrideDir ? [overrideDir] : [bundledDir, userDir];
  return { bundledDir, userDir, overrideDir, effectiveDirs };
}

async function setWorkflowsOverrideDir(dirPath) {
  return updateSettings({ workflows: { overrideDir: dirPath || null } });
}

// --- Prompt templates (reusable Prompt box text, global across projects) ---------

function listPromptTemplates() {
  return structuredClone(load().promptTemplates || []);
}

/**
 * Creates a new template (no `id`) or overwrites an existing one (matching `id`).
 * @param {{id?: string, name: string, text: string}} template
 */
async function savePromptTemplate({ id, name, text } = {}) {
  const settings = load();
  if (!settings.promptTemplates) settings.promptTemplates = [];
  const trimmedName = String(name || '').trim();
  if (!trimmedName) throw new Error('Template name is required.');
  if (id) {
    const existing = settings.promptTemplates.find((t) => t.id === id);
    if (!existing) throw new Error(`Unknown prompt template id: ${id}`);
    existing.name = trimmedName;
    existing.text = text || '';
  } else {
    settings.promptTemplates.push({ id: crypto.randomUUID(), name: trimmedName, text: text || '' });
  }
  await persist();
  return listPromptTemplates();
}

/** @param {string} id */
async function deletePromptTemplate(id) {
  const settings = load();
  settings.promptTemplates = (settings.promptTemplates || []).filter((t) => t.id !== id);
  await persist();
  return listPromptTemplates();
}

/**
 * Merges imported templates into existing ones, matched by case-insensitive trimmed
 * name — an id collision across two machines is essentially impossible since ids are
 * random UUIDs, but the name is what a person actually recognizes as "the same
 * template" when someone hands them a file. Existing templates keep their id; new
 * ones get a fresh id so an import can never collide with the receiving machine's own.
 * @param {{id: string, name: string, text: string}[]} existing
 * @param {{name: string, text: string}[]} incoming
 */
function mergeImportedTemplates(existing, incoming) {
  const templates = existing.map((t) => ({ ...t }));
  let addedCount = 0;
  let updatedCount = 0;
  for (const raw of incoming) {
    const name = String(raw?.name || '').trim();
    if (!name) continue;
    const text = String(raw?.text || '');
    const match = templates.find((t) => t.name.trim().toLowerCase() === name.toLowerCase());
    if (match) {
      match.text = text;
      updatedCount++;
    } else {
      templates.push({ id: crypto.randomUUID(), name, text });
      addedCount++;
    }
  }
  return { templates, addedCount, updatedCount };
}

/** Writes every saved Prompt Template to a JSON file the user picks — for handing to someone else or a different machine. */
async function exportPromptTemplatesToFile() {
  const result = await dialog.showSaveDialog({
    title: 'Export Prompt Templates',
    defaultPath: 'lp5000-prompt-templates.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  const promptTemplates = listPromptTemplates();
  const payload = { schemaVersion: 1, exportedAt: new Date().toISOString(), promptTemplates };
  fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf-8');
  return { canceled: false, filePath: result.filePath, count: promptTemplates.length };
}

/** Reads a JSON file exported by `exportPromptTemplatesToFile` and merges it into this machine's templates. */
async function importPromptTemplatesFromFile() {
  const result = await dialog.showOpenDialog({
    title: 'Import Prompt Templates',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf-8'));
  } catch (err) {
    throw new Error(`Could not read that file as JSON: ${err instanceof Error ? err.message : err}`);
  }
  const incoming = Array.isArray(parsed?.promptTemplates) ? parsed.promptTemplates : Array.isArray(parsed) ? parsed : null;
  if (!incoming) throw new Error('That file does not look like an LP 5000 prompt-templates export.');
  const settings = load();
  const { templates, addedCount, updatedCount } = mergeImportedTemplates(settings.promptTemplates || [], incoming);
  settings.promptTemplates = templates;
  await persist();
  return { canceled: false, addedCount, updatedCount, totalCount: templates.length };
}

module.exports = {
  getSettings,
  updateSettings,
  detectTool,
  setToolOverride,
  setWhisperVariant,
  browseForToolBinary,
  getResolvedToolPath,
  getWorkflowsDirs,
  setWorkflowsOverrideDir,
  detectButtercut,
  setButtercutOverride,
  browseForButtercutDir,
  getResolvedButtercutPath,
  updateButtercut,
  listPromptTemplates,
  savePromptTemplate,
  deletePromptTemplate,
  exportPromptTemplatesToFile,
  importPromptTemplatesFromFile,
  WHISPER_VARIANTS,
  CLAUDE_MODEL_OPTIONS,
  CLAUDE_EFFORT_OPTIONS,
  // Exported for unit testing in isolation from Electron's `app`/`dialog` (which
  // `load()` and the dialog-driven functions above require a real Electron process
  // for) — both are pure and safe to exercise directly under plain `node --test`.
  deepMergeInPlace,
  requireKnownTool,
  mergeImportedTemplates,
};
