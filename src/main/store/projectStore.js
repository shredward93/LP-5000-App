// @ts-check
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { app, dialog, shell } = require('electron');
const { readJsonWithDefaults, writeJsonAtomic, createWriteQueue } = require('./jsonStore');

// Ported from setup.py's folder list, plus .claude/ and libraries/ which the
// Python version never created up front (relying on lazy makedirs elsewhere) —
// both need to exist before Buttercut/engine.js ever try to write into them.
// A-Roll deliberately has no fixed per-camera subfolders here — a shoot can use any
// number of camera angles, so Cam_<label> folders are created on demand by
// engine.js's linkFootageIntoProject as footage is actually assigned to a camera.
const SCAFFOLD_FOLDERS = [
  '01_Footage/A-Roll',
  '01_Footage/B-Roll/Gimbal',
  '01_Footage/B-Roll/Drone',
  '02_Audio/Ext_Audio',
  '02_Audio/Music',
  '03_Edit/Resolve_Projects',
  '03_Edit/XML_Exports',
  '03_Edit/Transcripts',
  '04_Graphics/Lower_Thirds',
  '05_VFX/After_Effects_Comps',
  '06_Preview/FrameIO_Exports',
  '07_Master/High_Res_ProRes',
  '.claude',
  'libraries',
];

const TOP_LEVEL_FOLDERS = ['01_Footage', '02_Audio', '03_Edit', '04_Graphics', '05_VFX', '06_Preview', '07_Master'];

function defaultProjects() {
  return { schemaVersion: 1, projects: [] };
}

function projectsPath() {
  return path.join(app.getPath('userData'), 'lp5000-projects.json');
}

/** @type {object | null} */
let cache = null;
const enqueue = createWriteQueue();

function load() {
  if (!cache) {
    const isFirstLaunch = !fs.existsSync(projectsPath());
    cache = readJsonWithDefaults(projectsPath(), defaultProjects());
    if (isFirstLaunch) writeJsonAtomic(projectsPath(), cache);
  }
  return cache;
}

function persist() {
  const snapshot = structuredClone(cache);
  return enqueue(() => writeJsonAtomic(projectsPath(), snapshot));
}

/** Case-insensitive compare on platforms whose native filesystem typically is; exact on Linux. */
function samePath(a, b) {
  const na = path.resolve(a);
  const nb = path.resolve(b);
  return process.platform === 'linux' ? na === nb : na.toLowerCase() === nb.toLowerCase();
}

function findByPath(p) {
  return load().projects.find((proj) => samePath(proj.path, p)) || null;
}

function findById(id) {
  return load().projects.find((proj) => proj.id === id) || null;
}

function requireById(id) {
  const record = findById(id);
  if (!record) throw new Error(`Unknown project id: ${id}`);
  return record;
}

function listProjects() {
  return structuredClone(load().projects).sort((a, b) => (b.lastOpenedAt || '').localeCompare(a.lastOpenedAt || ''));
}

function getProject(id) {
  const record = findById(id);
  return record ? structuredClone(record) : null;
}

function inspectFolder(projectPath) {
  let entries = [];
  try {
    entries = fs.readdirSync(projectPath);
  } catch {
    entries = [];
  }
  const isEmpty = entries.length === 0;
  const missingFolders = TOP_LEVEL_FOLDERS.filter((f) => !fs.existsSync(path.join(projectPath, f)));
  const structureValid = missingFolders.length === 0;
  const looksUnrelated = !isEmpty && missingFolders.length === TOP_LEVEL_FOLDERS.length;
  return { isEmpty, structureValid, missingFolders, looksUnrelated };
}

async function openProjectDialog() {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const projectPath = result.filePaths[0];
  const known = findByPath(projectPath);
  const { isEmpty, structureValid, missingFolders, looksUnrelated } = inspectFolder(projectPath);
  return {
    canceled: false,
    path: projectPath,
    isKnown: Boolean(known),
    knownProjectId: known ? known.id : null,
    isEmpty,
    structureValid,
    missingFolders,
    looksUnrelated,
  };
}

function scaffoldProject(projectPath) {
  const created = [];
  for (const folder of SCAFFOLD_FOLDERS) {
    const full = path.join(projectPath, folder);
    if (!fs.existsSync(full)) {
      fs.mkdirSync(full, { recursive: true });
      created.push(folder);
    }
  }
  return { created };
}

function defaultLastSettings() {
  return {
    workflowTemplate: null,
    vibe: null,
    pacing: null,
    masterAudioSource: null,
    syncMethod: null,
    transcriptionSource: null,
    customProjectName: '',
    dynamicTagValues: {},
    checkedTasks: {},
    projectPrompt: '',
  };
}

async function commitProject(projectPath, opts = {}) {
  const { scaffoldMissing = false } = opts;
  if (scaffoldMissing) scaffoldProject(projectPath);

  const now = new Date().toISOString();
  const store = load();
  let record = findByPath(projectPath);
  if (!record) {
    record = {
      id: crypto.randomUUID(),
      path: projectPath,
      label: path.basename(projectPath),
      createdAt: now,
      lastOpenedAt: now,
      lastRunAt: null,
      archived: false,
      lastSettings: defaultLastSettings(),
      cachedStatus: null,
    };
    store.projects.push(record);
  } else {
    record.lastOpenedAt = now;
  }
  await persist();
  return structuredClone(record);
}

async function setActiveProject(id) {
  const record = requireById(id);
  record.lastOpenedAt = new Date().toISOString();
  await persist();
  return structuredClone(record);
}

async function refreshProjectStatus(id) {
  const record = requireById(id);
  const TIMEOUT_MS = 2000;
  const timeout = (ms) => new Promise((resolve) => setTimeout(() => resolve('timeout'), ms));

  const check = (async () => {
    const { structureValid, missingFolders } = inspectFolder(record.path);
    const hasLibraryYaml = fs.existsSync(path.join(record.path, 'libraries', 'library.yaml'));
    let transcriptsCount = 0;
    try {
      const files = await fsp.readdir(path.join(record.path, '03_Edit', 'Transcripts'));
      transcriptsCount = files.length;
    } catch {
      transcriptsCount = 0;
    }
    return { structureValid, missingFolders, hasLibraryYaml, transcriptsCount };
  })();

  const outcome = await Promise.race([check, timeout(TIMEOUT_MS)]);
  const reachable = outcome !== 'timeout';
  const status = reachable
    ? { checkedAt: new Date().toISOString(), reachable: true, ...outcome }
    : { checkedAt: new Date().toISOString(), reachable: false, structureValid: false, missingFolders: TOP_LEVEL_FOLDERS, hasLibraryYaml: false, transcriptsCount: 0 };

  record.cachedStatus = status;
  await persist();
  return structuredClone(status);
}

async function updateProjectLastSettings(id, patch) {
  const record = requireById(id);
  record.lastSettings = { ...record.lastSettings, ...patch };
  await persist();
  return structuredClone(record);
}

async function markRun(id) {
  const record = requireById(id);
  record.lastRunAt = new Date().toISOString();
  await persist();
  return structuredClone(record);
}

async function renameProjectLabel(id, label) {
  const record = requireById(id);
  record.label = label;
  await persist();
  return structuredClone(record);
}

async function relinkProject(id, newPath) {
  const record = requireById(id);
  record.path = newPath;
  await persist();
  return structuredClone(record);
}

async function archiveProject(id, archived) {
  const record = requireById(id);
  record.archived = Boolean(archived);
  await persist();
  return structuredClone(record);
}

async function removeProject(id) {
  const store = load();
  store.projects = store.projects.filter((p) => p.id !== id);
  await persist();
}

async function revealInFileManager(id) {
  const record = requireById(id);
  shell.showItemInFolder(record.path);
}

module.exports = {
  listProjects,
  getProject,
  openProjectDialog,
  commitProject,
  setActiveProject,
  scaffoldProject,
  refreshProjectStatus,
  updateProjectLastSettings,
  markRun,
  renameProjectLabel,
  relinkProject,
  archiveProject,
  removeProject,
  revealInFileManager,
};
