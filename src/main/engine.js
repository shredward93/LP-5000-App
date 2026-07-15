// @ts-check
'use strict';

// Pure Node port of engine.py — no Electron imports, so this module can be
// unit-tested with plain `node --test` and reasoned about independently of
// the app shell.

const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');

const BUILD_FROM_SCRATCH = '🛠️ Build from scratch';
const GENERAL_WORKFLOW = 'General_Workflow.md';
const MULTICAM_SYNC_TASK = 'Multicam - Sync & stack all A-Roll angles + Master Audio';
// Sentinel Master Audio Source value for a batch of unrelated single-camera sources
// (e.g. separate sermons from different campuses) — the opposite of picking one
// shared master audio track for a real multicam sync. Selecting it tells Claude each
// source file is its own independent job using its own on-camera audio.
const INDEPENDENT_JOBS_MASTER_AUDIO = "Each Camera's Own Audio (independent per-file jobs, not multicam)";
const USE_BROLL_TASK = 'Use B-Roll Footage';
const TRANSCRIBE_TASK = 'Transcribe Master Audio ONLY (Ignore Vision/Other Cams)';
const AUTO_CUT_TASK = 'Auto-cut to B-Cam for intimate/emotional moments (Transcript-based)';
const BROLL_EXTRA_TASKS = [
  'Insert appropriate B-Roll on V2 based on context of transcript.',
  'Create separate sequence of all usable B-Roll.',
];
const DEFAULT_TRIGGERS = [MULTICAM_SYNC_TASK, USE_BROLL_TASK];
const MEDIA_EXTENSIONS = ['.mp4', '.mov', '.wav', '.mp3'];

/**
 * A reusable, precise track layout for multi-angle + B-Roll cuts — confirmed against
 * a real hand-authored export (Chance_Testimony_679_ROUGHCUT.xml) that already used
 * this exact V1/V2 enabled-toggle + locked-A1 technique. Always included in generated
 * CLAUDE.md; Claude only applies it when a cut actually needs more than one angle
 * and/or B-Roll — for a simple single-camera Franken-bite it's simply unused.
 */
const MULTI_ANGLE_BROLL_PROTOCOL = `
- **Track Protocol (multi-angle + B-Roll):** Use this exact structure whenever a cut needs more than one camera angle and/or B-Roll — a reusable layout that scales to however many camera angles this shoot actually has (2, 3, 5, whatever was shot), not a fixed 2-camera special case:
  - **V1..VN = one track per camera angle in use this run.** N is not fixed — use exactly as many angle tracks as there are angles (V1 for the first, V2 for the second, V3 for a third, and so on, one per \`01_Footage/A-Roll/Cam_*\` folder actually used). EVERY angle track has full-duration coverage: a clipitem at every position in the timeline, even where that angle isn't the one being shown.
  - **B-Roll gets the next track after the last angle track** (e.g. V4 if there are 3 camera angles in play) — optional, only when a B-Roll task is active, and sparse (only where B-roll actually covers).
  - **Enabled/disabled, never present/absent.** At any position, exactly ONE angle track is live. ALL angle tracks carry a clipitem there; every angle track that isn't live at that position has \`<enabled>FALSE</enabled>\`. Never delete a clip to indicate a cut is off — disable it, so any angle stays re-cuttable later without rebuilding the timeline.
  - **A1 = Master audio, locked, one source, NEVER re-sourced** — the same audio file for the entire timeline regardless of which angle track is enabled at that moment. Cutting between angles must never change which file A1 pulls from.
  - **A2 = B-Roll nat sound** (optional) — only present under the B-Roll video track's clips, muted by default unless asked to bring up B-roll's own audio.
  - Worked skeleton for 3 angles + B-Roll (adapt clip counts/timings/track count to however many angles this shoot actually has — keep this shape):
    \`\`\`xml
    <video>
      <track><!-- V1: angle 1, full coverage -->
        <clipitem id="v1-clip-00"><enabled>TRUE</enabled>...</clipitem>
        <clipitem id="v1-clip-01"><enabled>FALSE</enabled>...</clipitem><!-- another angle live here instead -->
      </track>
      <track><!-- V2: angle 2, full coverage, same timing as V1 -->
        <clipitem id="v2-clip-00"><enabled>FALSE</enabled>...</clipitem>
        <clipitem id="v2-clip-01"><enabled>TRUE</enabled>...</clipitem>
      </track>
      <track><!-- V3: angle 3, full coverage, same timing as V1/V2 -->
        <clipitem id="v3-clip-00"><enabled>FALSE</enabled>...</clipitem>
        <clipitem id="v3-clip-01"><enabled>FALSE</enabled>...</clipitem>
      </track>
      <track><!-- V4: optional B-Roll overlay, sparse, one track after the last angle --><clipitem id="v4-broll-00">...</clipitem></track>
    </video>
    <audio>
      <track><locked>TRUE</locked><!-- A1: master audio, one source, never switches -->
        <clipitem id="a1-clip-00">...</clipitem>
        <clipitem id="a1-clip-01">...</clipitem>
      </track>
      <track><!-- A2: B-Roll nat sound, sparse, matches the B-Roll video track --><clipitem id="a2-broll-00">...</clipitem></track>
    </audio>
    \`\`\``;

/**
 * Build the .claude/settings.json contents. `model`/`effort` come from the app's
 * Settings panel (settingsStore.claudeOptions); 'default' for either means "omit
 * this field" so Claude Code falls back to the user's own global settings.json
 * instead of this project-level file silently overriding it every run.
 * @param {{model?: string, effort?: string}} [claudeOptions]
 * @returns {object}
 */
function buildClaudeSettingsJson(claudeOptions = {}) {
  const settings = {
    permissions: {
      defaultMode: 'acceptEdits',
      allow: [
        'Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep', 'LS', 'Bash',
        'Read(//J:/**)', 'Write(//J:/**)', 'Read(//Volumes/**)', 'Write(//Volumes/**)',
      ],
    },
  };
  const model = claudeOptions.model || 'sonnet';
  const effort = claudeOptions.effort || 'xhigh';
  if (model !== 'default') settings.model = model;
  if (effort !== 'default') settings.effortLevel = effort;
  return settings;
}

// --- Frontmatter parsing -----------------------------------------------------

/** @param {string} text @returns {Record<string, string[]>} */
function parseFrontmatter(text) {
  const result = {};
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(/^(Stage [1-4]|triggers):\s*$/);
    if (m) {
      const key = m[1];
      const items = [];
      i += 1;
      while (i < lines.length && /^\s+-\s+/.test(lines[i])) {
        const raw = lines[i].trim();
        if (raw.startsWith('- ')) {
          let item = raw.slice(2).trim();
          if (item.startsWith('"') && item.endsWith('"')) item = item.slice(1, -1);
          items.push(item);
        }
        i += 1;
      }
      result[key] = items;
      continue;
    }
    i += 1;
  }
  return result;
}

/** @param {string} content @returns {[string, string] | null} */
function readFrontmatterBlockFromContent(content) {
  if (!content.trim().startsWith('---')) return null;
  // trimStart (not a raw split) so a leading blank line before the "---" fence
  // doesn't make lines[0] empty and fail this check right after the equivalent
  // .trim() check above just passed it.
  const lines = content.replace(/\r\n/g, '\n').trimStart().split('\n');
  if (lines[0].trim() !== '---') return null;
  let endIdx = null;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { endIdx = i; break; }
  }
  if (endIdx === null) return null;
  return [lines.slice(1, endIdx).join('\n'), lines.slice(endIdx + 1).join('\n')];
}

/** @param {string} filePath @returns {[string, string] | null} */
function readFrontmatterBlock(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return readFrontmatterBlockFromContent(fs.readFileSync(filePath, 'utf-8'));
}

/** @param {string} content @returns {string} */
function stripFrontmatterFromContent(content) {
  if (!content.trim().startsWith('---')) return content;
  const lines = content.replace(/\r\n/g, '\n').trimStart().split('\n');
  if (lines.length === 0 || lines[0].trim() !== '---') return content;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') return lines.slice(i + 1).join('\n');
  }
  return content;
}

// --- .claude/settings.json ---------------------------------------------------

/** @param {string} projectPath @param {{model?: string, effort?: string}} [claudeOptions] */
function verifyClaudeSettings(projectPath, claudeOptions) {
  const settingsDir = path.join(projectPath, '.claude');
  fs.mkdirSync(settingsDir, { recursive: true });
  const settingsFile = path.join(settingsDir, 'settings.json');
  const recommended = buildClaudeSettingsJson(claudeOptions);
  if (fs.existsSync(settingsFile)) {
    try {
      const existing = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
      if (isDeepStrictEqual(existing, recommended)) return;
    } catch {
      // unreadable/corrupt — fall through and rewrite
    }
  }
  fs.writeFileSync(settingsFile, JSON.stringify(recommended, null, 2), 'utf-8');
}

// --- Media scanning -----------------------------------------------------------

/** @param {string} projectPath @returns {string[]} */
function scanMediaFiles(projectPath) {
  const out = [];
  function walk(dir) {
    if (dir.includes('.git') || dir.includes('.claude')) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        (full.includes('01_Footage') || full.includes('02_Audio')) &&
        !entry.name.startsWith('.') &&
        MEDIA_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())
      ) {
        out.push(path.relative(projectPath, full));
      }
    }
  }
  walk(projectPath);
  return out;
}

// --- Footage import (symlink-in-place for external sources; real move for --
// --- loose files already sitting inside the project — never copy/move -----
// --- footage that lives outside the project, since that's irreplaceable) --

/**
 * Fixed, bounded footage categories. 'A-Roll' is deliberately NOT enumerated per-camera
 * here — unlike B-Roll/audio, the number of camera angles on a shoot is unbounded, so
 * each A-Roll assignment carries its own free-form cameraLabel and gets its own
 * Cam_<label> subfolder created on demand (see linkFootageIntoProject).
 */
const FOOTAGE_CATEGORIES = {
  'A-Roll': path.join('01_Footage', 'A-Roll'),
  'B-Roll Gimbal': path.join('01_Footage', 'B-Roll', 'Gimbal'),
  'B-Roll Drone': path.join('01_Footage', 'B-Roll', 'Drone'),
  'Ext Audio': path.join('02_Audio', 'Ext_Audio'),
  'Music': path.join('02_Audio', 'Music'),
};

// Top-level entries that are part of the standard scaffold (or app/VCS internals) —
// scanLooseFiles skips descending into these since anything under them is already sorted.
const KNOWN_TOP_LEVEL_DIRS = ['01_Footage', '02_Audio', '03_Edit', '04_Graphics', '05_VFX', '06_Preview', '07_Master', 'libraries'];

/**
 * Media files sitting loose in the project folder — outside the standard 01_Footage/
 * 02_Audio tree — e.g. dragged in via Finder before adopting Import Footage, or a card
 * dumped straight into the project root. Detection only: nothing is moved here. The
 * renderer stages these in the Import Footage list so the user assigns a category (and
 * camera, for A-Roll) and explicitly clicks Link — at which point linkFootageIntoProject
 * moves them into place, since they're already inside the project (unlike footage
 * browsed in from an external card/drive, which stays symlinked).
 * @param {string} projectPath
 * @returns {string[]} absolute paths
 */
function scanLooseFiles(projectPath) {
  const out = [];
  function walk(dir, isRoot) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (isRoot && KNOWN_TOP_LEVEL_DIRS.includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, false);
      } else if (MEDIA_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
        out.push(full);
      }
    }
  }
  walk(projectPath, true);
  return out;
}

/**
 * Turns a free-form camera name (user-typed, arbitrary) into a safe filesystem
 * folder-name component. The caller always prefixes the result with `Cam_`, so a
 * redundant leading "Cam"/"Camera" the user typed themselves (out of habit from the
 * old fixed Cam A-D convention) is stripped first — "Cam A" and "A" both land in the
 * same `Cam_A` folder — while a name that merely starts with "cam" (e.g. "Cameron")
 * is left alone via a word-boundary check. Strips everything else but alphanumerics
 * down to underscores, which specifically prevents path traversal (`../../etc`
 * collapses to `etc`, never survives as a literal `/` or `..` segment) since the
 * result becomes part of a real path via path.join.
 * @param {string} label
 * @returns {string}
 */
function slugifyCameraLabel(label) {
  const trimmed = String(label).trim();
  const withoutCamPrefix = trimmed.replace(/^cam(?:era)?\b\s*/i, '').trim();
  const base = withoutCamPrefix || trimmed;
  const slug = base.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return slug || 'Unnamed';
}

/**
 * Places raw footage into its assigned category (and, for A-Roll, camera) folder
 * within the project structure. Footage from outside the project (a card, an external
 * drive) is symlinked — source files are NEVER copied or moved, so nothing on
 * removable media is ever at risk. A file that's already sitting loose inside the
 * project folder itself (e.g. found by scanLooseFiles) is instead moved — a symlink
 * would just leave the original clutter behind, which defeats the point of sorting it.
 * Claude/ffmpeg/whisper all follow symlinks transparently, so the existing
 * 01_Footage/02_Audio folder convention (and every workflow template that reads from
 * it) keeps working unmodified either way.
 * @param {string} projectPath
 * @param {{sourcePath: string, category: string, cameraLabel?: string}[]} assignments
 * @returns {{linked: {sourcePath: string, linkPath: string, role: string}[], skipped: {sourcePath: string, reason: string}[]}}
 */
function linkFootageIntoProject(projectPath, assignments) {
  const linked = [];
  const skipped = [];
  const projectRoot = path.resolve(projectPath) + path.sep;
  for (const { sourcePath, category, cameraLabel } of assignments) {
    const categoryDir = FOOTAGE_CATEGORIES[category];
    if (!categoryDir) { skipped.push({ sourcePath, reason: `Unknown category: ${category}` }); continue; }
    if (!fs.existsSync(sourcePath)) { skipped.push({ sourcePath, reason: 'Source file no longer exists' }); continue; }

    let roleDir = categoryDir;
    let role = category;
    if (category === 'A-Roll') {
      const trimmedLabel = String(cameraLabel || '').trim();
      if (!trimmedLabel) { skipped.push({ sourcePath, reason: 'A-Roll footage needs a camera name' }); continue; }
      // Use the normalized slug (not the raw input) for the display role too, so
      // "Cam A" and "A" — which land in the same Cam_A folder — always report back
      // the same canonical label, matching what listLinkedFootage derives later from
      // the folder name on disk.
      const slug = slugifyCameraLabel(trimmedLabel);
      roleDir = path.join(categoryDir, `Cam_${slug}`);
      role = `A-Roll: ${slug.replace(/_/g, ' ')}`;
    }

    const targetDir = path.join(projectPath, roleDir);
    fs.mkdirSync(targetDir, { recursive: true });

    const baseName = path.basename(sourcePath);
    const ext = path.extname(baseName);
    const stem = path.basename(baseName, ext);
    let linkPath = path.join(targetDir, baseName);
    let alreadyLinked = false;

    if (fs.existsSync(linkPath)) {
      try {
        if (fs.readlinkSync(linkPath) === sourcePath) alreadyLinked = true;
      } catch {
        // existing entry is a real file or a symlink to something else — treat as a
        // name collision below rather than silently overwriting it.
      }
      if (!alreadyLinked) {
        let n = 2;
        while (fs.existsSync(linkPath)) {
          linkPath = path.join(targetDir, `${stem}-${n}${ext}`);
          n += 1;
        }
      }
    }

    if (alreadyLinked) { linked.push({ sourcePath, linkPath, role }); continue; }
    const isInsideProject = path.resolve(sourcePath).startsWith(projectRoot);
    try {
      if (isInsideProject) {
        fs.renameSync(sourcePath, linkPath);
      } else {
        fs.symlinkSync(sourcePath, linkPath, 'file');
      }
      linked.push({ sourcePath, linkPath, role });
    } catch (err) {
      skipped.push({ sourcePath, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return { linked, skipped };
}

/**
 * isSymlink distinguishes a real (moved-in-place) file from a symlink so callers don't
 * misreport a legitimately-moved file as a broken link — only a symlink whose target
 * can't be read is actually broken.
 * @param {string} dirPath
 * @returns {{linkPath: string, sourcePath: string | null, isSymlink: boolean}[]}
 */
function listDirEntries(dirPath) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const linkPath = path.join(dirPath, entry.name);
    const isSymlink = entry.isSymbolicLink();
    let sourcePath = null;
    if (isSymlink) {
      try { sourcePath = fs.readlinkSync(linkPath); } catch { /* broken link */ }
    }
    out.push({ linkPath, sourcePath, isSymlink });
  }
  return out;
}

/**
 * Camera labels already in use in this project (derived from existing Cam_<label>
 * folders), so the Import Footage UI can offer them as autocomplete suggestions
 * instead of making the user retype an exact spelling every time.
 * @param {string} projectPath
 * @returns {string[]}
 */
function listCameraLabels(projectPath) {
  const aRollDir = path.join(projectPath, FOOTAGE_CATEGORIES['A-Roll']);
  let dirs;
  try {
    dirs = fs.readdirSync(aRollDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch {
    return [];
  }
  return dirs.map((d) => d.name.replace(/^Cam_/, '').replace(/_/g, ' '));
}

/**
 * Lists footage already linked into the project, grouped by role, for the Import
 * Footage panel to render current assignments. A-Roll cameras are discovered
 * dynamically (however many Cam_<label> folders actually exist) rather than assumed
 * from a fixed list, since a shoot can use any number of camera angles.
 * @param {string} projectPath
 * @returns {{role: string, linkPath: string, sourcePath: string | null, isSymlink: boolean, relativePath: string}[]}
 */
function listLinkedFootage(projectPath) {
  const out = [];
  for (const [category, categoryDir] of Object.entries(FOOTAGE_CATEGORIES)) {
    if (category === 'A-Roll') continue; // handled dynamically below
    for (const entry of listDirEntries(path.join(projectPath, categoryDir))) {
      out.push({ role: category, ...entry });
    }
  }
  const aRollDir = path.join(projectPath, FOOTAGE_CATEGORIES['A-Roll']);
  let camDirs;
  try {
    camDirs = fs.readdirSync(aRollDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch {
    camDirs = [];
  }
  for (const camDir of camDirs) {
    const label = camDir.name.replace(/^Cam_/, '').replace(/_/g, ' ');
    for (const entry of listDirEntries(path.join(aRollDir, camDir.name))) {
      out.push({ role: `A-Roll: ${label}`, ...entry });
    }
  }
  return out.map((item) => ({ ...item, relativePath: path.relative(projectPath, item.linkPath) }));
}

/**
 * Removes a symlink previously created by linkFootageIntoProject. Refuses to touch
 * anything that isn't actually a symlink, so this can never delete real project
 * files or original source footage.
 * @param {string} linkPath
 */
function unlinkFootage(linkPath) {
  const stat = fs.lstatSync(linkPath);
  if (!stat.isSymbolicLink()) throw new Error(`Refusing to remove a non-symlink: ${linkPath}`);
  fs.unlinkSync(linkPath);
}

// --- Workflow directory / template resolution --------------------------------

/**
 * Copy any bundled default template not already present in the user's writable
 * workflows dir. Idempotent — safe to call on every listOptions()/getFormState() call.
 * @param {{bundledDir: string, userDir: string}} dirs
 */
function seedUserWorkflowsDir({ bundledDir, userDir }) {
  if (!fs.existsSync(bundledDir)) return;
  fs.mkdirSync(userDir, { recursive: true });
  for (const f of fs.readdirSync(bundledDir)) {
    if (!f.toLowerCase().endsWith('.md') || f.toLowerCase() === 'readme.md') continue;
    const dest = path.join(userDir, f);
    if (!fs.existsSync(dest)) fs.copyFileSync(path.join(bundledDir, f), dest);
  }
}

/** @param {string[]} effectiveDirs @param {string} filename @returns {string | null} */
function resolveWorkflowFile(effectiveDirs, filename) {
  for (const dir of [...effectiveDirs].reverse()) {
    const candidate = path.join(dir, filename);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** @param {string[]} effectiveDirs @returns {string[]} */
function listWorkflowFilenames(effectiveDirs) {
  const names = new Set();
  for (const dir of effectiveDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.toLowerCase().endsWith('.md') && f.toLowerCase() !== 'readme.md') names.add(f);
    }
  }
  return [...names];
}

/** @param {{effectiveDirs: string[]}} workflowsDirs @returns {string[]} */
function getWorkflowOptions(workflowsDirs) {
  return [BUILD_FROM_SCRATCH, ...listWorkflowFilenames(workflowsDirs.effectiveDirs)];
}

/** @param {{effectiveDirs: string[]}} workflowsDirs @param {string} templateName @returns {Set<string> | null} */
function getTemplateTags(workflowsDirs, templateName) {
  if (templateName === BUILD_FROM_SCRATCH) return null;
  const filePath = resolveWorkflowFile(workflowsDirs.effectiveDirs, templateName);
  if (!filePath) return new Set();
  const content = fs.readFileSync(filePath, 'utf-8');
  return new Set([...content.matchAll(/\{\{(.*?)\}\}/g)].map((m) => m[1]));
}

/**
 * Resolve + read a template file's content ONCE, applying the Build-from-scratch ->
 * General_Workflow.md substitution and the empty-Stage-1 fallback. Returns both the
 * parsed frontmatter and the raw content actually used, so a caller needing several
 * derived views of the same template (tags + stages + triggers) doesn't have to
 * independently re-resolve and re-read the file for each one.
 * @param {{effectiveDirs: string[]}} workflowsDirs
 * @param {string} templateName
 * @returns {{ fm: Record<string, string[]>, content: string | null }}
 */
function resolveTemplate(workflowsDirs, templateName) {
  const name = templateName === BUILD_FROM_SCRATCH ? GENERAL_WORKFLOW : templateName;
  const filePath = resolveWorkflowFile(workflowsDirs.effectiveDirs, name);
  const content = filePath ? fs.readFileSync(filePath, 'utf-8') : null;
  const block = content !== null ? readFrontmatterBlockFromContent(content) : null;
  if (block === null) {
    if (name !== GENERAL_WORKFLOW) return resolveTemplate(workflowsDirs, GENERAL_WORKFLOW);
    return { fm: {}, content };
  }
  const [yamlText] = block;
  const fm = parseFrontmatter(yamlText);
  if ((!fm['Stage 1'] || fm['Stage 1'].length === 0) && name !== GENERAL_WORKFLOW) {
    return resolveTemplate(workflowsDirs, GENERAL_WORKFLOW);
  }
  return { fm, content };
}

/** @param {{effectiveDirs: string[]}} workflowsDirs @param {string} templateName @returns {Record<string, string[]>} */
function getTemplateFrontmatter(workflowsDirs, templateName) {
  return resolveTemplate(workflowsDirs, templateName).fm;
}

/**
 * @param {Record<string, string[]>} fm
 * @param {boolean} mSyncActive
 * @param {boolean} brollActive
 */
function stagesFromFrontmatter(fm, mSyncActive, brollActive) {
  const tasks = {
    'Stage 1': [...(fm['Stage 1'] || [])],
    'Stage 2': [...(fm['Stage 2'] || [])],
    'Stage 3': [...(fm['Stage 3'] || [])],
    'Stage 4': [...(fm['Stage 4'] || [])],
  };
  // Gate on the CURRENT template actually offering multicam sync, not just the flag —
  // a stale "multicam checked" state carried over from a previously-selected template
  // (renderer.js intentionally preserves checked-task state across template switches)
  // must not leak this task into a template with no multicam concept at all.
  const templateHasMulticam = tasks['Stage 1'].includes(MULTICAM_SYNC_TASK);
  if (mSyncActive && templateHasMulticam && !tasks['Stage 3'].includes(AUTO_CUT_TASK)) {
    tasks['Stage 3'].push(AUTO_CUT_TASK);
  }
  const isBrollOnly = tasks['Stage 1'].length === 1 && tasks['Stage 1'][0] === USE_BROLL_TASK;
  if (brollActive && !isBrollOnly) {
    for (const extra of BROLL_EXTRA_TASKS) {
      if (!tasks['Stage 3'].includes(extra)) tasks['Stage 3'].push(extra);
    }
  }
  return tasks;
}

/**
 * @param {{effectiveDirs: string[]}} workflowsDirs
 * @param {string} templateName
 * @param {boolean} mSyncActive
 * @param {boolean} brollActive
 */
function getStagesFromTemplate(workflowsDirs, templateName, mSyncActive, brollActive) {
  return stagesFromFrontmatter(getTemplateFrontmatter(workflowsDirs, templateName), mSyncActive, brollActive);
}

/** @param {Record<string, string[]>} fm @returns {string[]} */
function triggersFromFrontmatter(fm) {
  return [...(fm.triggers !== undefined ? fm.triggers : DEFAULT_TRIGGERS)];
}

/** @param {{effectiveDirs: string[]}} workflowsDirs @param {string} templateName @returns {string[]} */
function getTriggersFromTemplate(workflowsDirs, templateName) {
  return triggersFromFrontmatter(getTemplateFrontmatter(workflowsDirs, templateName));
}

/**
 * Combined tags + stages + triggers for one template, resolving/reading the file
 * exactly once (vs. calling getTemplateTags/getStagesFromTemplate/getTriggersFromTemplate
 * independently, which would each redundantly re-resolve and re-read/re-parse it).
 * @param {{effectiveDirs: string[]}} workflowsDirs
 * @param {string} templateName
 * @param {{multicamActive?: boolean, brollActive?: boolean}} flags
 */
function getWorkflowFormState(workflowsDirs, templateName, flags = {}) {
  // Tags deliberately do NOT follow the General_Workflow.md fallback (matching the
  // original getTemplateTags behavior) — an unrecognized/empty template just has no
  // tags, whereas Stage/trigger info (fm, below) does fall back so the form still
  // shows sensible defaults. So this reads the originally-requested file directly,
  // separately from fm's (possibly-fallen-back) resolution.
  let tags = null;
  if (templateName !== BUILD_FROM_SCRATCH) {
    const filePath = resolveWorkflowFile(workflowsDirs.effectiveDirs, templateName);
    const rawContent = filePath ? fs.readFileSync(filePath, 'utf-8') : '';
    tags = new Set([...rawContent.matchAll(/\{\{(.*?)\}\}/g)].map((m) => m[1]));
  }
  // Single shared frontmatter resolution for both stages and triggers, instead of
  // each independently re-resolving and re-reading/re-parsing the same file.
  const fm = getTemplateFrontmatter(workflowsDirs, templateName);
  return {
    tags,
    stages: stagesFromFrontmatter(fm, Boolean(flags.multicamActive), Boolean(flags.brollActive)),
    triggers: triggersFromFrontmatter(fm),
  };
}

// --- CLAUDE.md / prompt building --------------------------------------------

/**
 * @param {object} opts
 * @param {{effectiveDirs: string[]}} opts.workflowsDirs
 * @param {string} opts.templateName
 * @param {Record<string,string>} opts.dynamicVars
 * @param {string} opts.customProjName
 * @param {string} opts.vibe
 * @param {string} opts.pacing
 * @param {string} opts.masterAudio
 * @param {string} [opts.projectPrompt]
 * @param {string | null} [opts.whisperPath]
 * @param {string | null} [opts.ffmpegPath]
 * @param {string[]} [opts.selectedFiles]
 * @returns {string}
 */
function buildClaudeMd({
  workflowsDirs, templateName, dynamicVars, customProjName, vibe, pacing, masterAudio,
  projectPrompt, whisperPath, ffmpegPath, selectedFiles, buttercutPath,
}) {
  let md;
  if (templateName === BUILD_FROM_SCRATCH) {
    md = `# PROJECT: ${customProjName}\n## 🎨 GUIDELINES\n- Pause & Resume Protocol: Wait for approval. Remember tasks.\n`;
  } else {
    const filePath = resolveWorkflowFile(workflowsDirs.effectiveDirs, templateName);
    if (!filePath) throw new Error(`Workflow template not found: ${templateName}`);
    let content = stripFrontmatterFromContent(fs.readFileSync(filePath, 'utf-8'));
    for (const [tag, value] of Object.entries(dynamicVars || {})) {
      content = content.replaceAll(`{{${tag}}}`, value);
    }
    md = content;
  }
  const masterAudioLine = masterAudio === INDEPENDENT_JOBS_MASTER_AUDIO
    ? '- Master Audio Source: Each selected source file uses its own on-camera audio track. '
      + 'These are independent, unrelated recordings (e.g. separate sermons from different campuses) — '
      + 'NOT multiple angles of the same event. Do NOT multicam-sync them together or cross-mix audio '
      + 'between them. Treat every selected file as its own separate job and produce a separate output '
      + 'for each one, all within this session.'
    : `- Master Audio Source: ${masterAudio}`;
  md += `\n\n## 🌍 PROJECT CONFIG\n- Vibe: ${vibe}\n- Pacing: ${pacing}\n${masterAudioLine}`;
  if (projectPrompt && projectPrompt.trim()) {
    md += `\n\n## 🧭 Project Vision & Instructions\n${projectPrompt.trim()}`;
  }
  md += MULTI_ANGLE_BROLL_PROTOCOL;
  md += '\n- **Library Landmark:** Your source of truth is `library.yaml`. Because the BUTTERCUT_PROJECT_DIR environment variable is enforced, this file will ALWAYS be generated and located strictly inside the `libraries/` directory within the current project root.';
  md += buttercutPath
    ? `\n- **ButterCut Reference:** ButterCut (source clone) lives at \`${buttercutPath}\` — its \`lib/buttercut/\` Ruby helpers (contact sheets, script_extractor, library.yaml migrations, backup_libraries.rb) and \`skills/\` are available there for reference. Not required for every task: hand-authoring FCP7 XML directly (see Track Protocol above) has worked reliably for multi-angle/B-Roll cuts without going through ButterCut's own exporter.`
    : '\n- **ButterCut Reference:** ButterCut location is not configured in Settings — its Ruby helpers/skills are unavailable this run; hand-author FCP7 XML directly per the Track Protocol above.';
  // Settings' resolved tool paths otherwise never reach Claude at all — without this,
  // picking a whisper variant in Settings has no effect on which binary actually gets
  // invoked during a session, since Claude just falls back to whatever it finds itself.
  md += `\n- **Transcription (Whisper):** Use exactly this binary — do NOT substitute a different whisper install even if another is also on PATH: \`${whisperPath || 'whisper (not resolved by LP5000 — falls back to a bare PATH lookup)'}\``;
  md += `\n- **ffmpeg:** Use exactly this binary: \`${ffmpegPath || 'ffmpeg (not resolved by LP5000 — falls back to a bare PATH lookup)'}\``;
  md += '\n- **Global Rules:** Extract true SMPTE timecode. No 0-base anchoring. Use Telegraphic visual transcripts. Pause for Sync Map review and take note of remaining tasks. ALWAYS export timelines using the FCP7 XML standard (.xml / <xmeml> format) for DaVinci Resolve compatibility. NEVER export as FCPXML (.fcpxml).';
  if (selectedFiles && selectedFiles.length > 0) {
    md += '\n\n## 📼 TARGET SOURCE FILES (this run)\n'
        + 'Use EXACTLY these source file(s). Do NOT use or search for any other files under '
        + '01_Footage/02_Audio even if present:\n'
        + selectedFiles.map((f) => `- ${f}`).join('\n');
  }
  return md;
}

/** @param {string[]} activeTasks @param {string} projectPrompt @param {string[]} [selectedFiles] @returns {string} */
function buildRunPrompt(activeTasks, projectPrompt, selectedFiles) {
  let prompt = `Read ./.claude/CLAUDE.md. Execute: ${activeTasks.join(', ')}.`;
  const note = (projectPrompt || '').replaceAll('"', "'");
  if (note.trim()) prompt += ` Note: ${note.trim()}.`;
  if (selectedFiles && selectedFiles.length > 0) {
    prompt += ` Use exactly these source files: ${selectedFiles.join(', ')}.`;
  }
  return prompt;
}

/** @returns {string} */
function getWrapUpPrompt() {
  return (
    'Project complete. 1. Run the Buttercut backup_libraries.rb script to zip the library.yaml and transcripts into the backups/ folder. '
    + '2. Review our chat history for this project. If I gave you any stylistic corrections or new editing rules, permanently save them to your global memory. '
    + "3. Print a big bold message reminding me to type /clear to wipe your context window."
  );
}

// --- Stage 1/2 prerequisite check + auto-injection (bug fix #2) -------------

/**
 * @param {string} projectPath
 * @param {string[]} selectedFiles
 * @returns {{hasLibrary: boolean, missingTranscriptsFor: string[]}}
 */
function checkPrerequisites(projectPath, selectedFiles) {
  const hasLibrary = fs.existsSync(path.join(projectPath, 'libraries', 'library.yaml'));
  const transcriptsDir = path.join(projectPath, '03_Edit', 'Transcripts');
  let existing = [];
  try {
    existing = fs.readdirSync(transcriptsDir);
  } catch {
    existing = [];
  }
  const files = selectedFiles || [];
  let missingTranscriptsFor;
  if (files.length > 0) {
    // Best-effort match: transcript filename stem contains the source file's stem.
    // ASSUMPTION: Buttercut's exact transcript naming convention hasn't been observed
    // yet from this repo (Buttercut is external) — tighten this once real output is seen.
    missingTranscriptsFor = files.filter((f) => {
      const stem = path.basename(f, path.extname(f));
      return !existing.some((t) => t.includes(stem));
    });
  } else if (existing.length === 0) {
    // No specific file was selected, so there's nothing to name per-file — but an
    // entirely empty transcripts folder still means Stage 2 hasn't run. Use a
    // non-filename placeholder so resolvePrerequisites' length check still trips.
    missingTranscriptsFor = ['(no files selected)'];
  } else {
    missingTranscriptsFor = [];
  }
  return { hasLibrary, missingTranscriptsFor };
}

/**
 * @param {object} args
 * @param {string[]} args.activeTasks
 * @param {Record<string, string[]>} args.stages
 * @param {boolean} args.hasLibrary
 * @param {string[]} args.missingTranscriptsFor
 * @returns {string[]} tasks to prepend, in order
 */
function resolvePrerequisites({ activeTasks, stages, hasLibrary, missingTranscriptsFor }) {
  const toPrepend = [];
  const touchesStage3or4 = activeTasks.some((t) => stages['Stage 3'].includes(t) || stages['Stage 4'].includes(t));
  if (touchesStage3or4) {
    if (stages['Stage 1'].includes(MULTICAM_SYNC_TASK) && !hasLibrary && !activeTasks.includes(MULTICAM_SYNC_TASK)) {
      toPrepend.push(MULTICAM_SYNC_TASK);
    }
    if (stages['Stage 2'].includes(TRANSCRIBE_TASK) && missingTranscriptsFor.length > 0 && !activeTasks.includes(TRANSCRIBE_TASK)) {
      toPrepend.push(TRANSCRIBE_TASK);
    }
  }
  return toPrepend;
}

module.exports = {
  BUILD_FROM_SCRATCH,
  GENERAL_WORKFLOW,
  MULTICAM_SYNC_TASK,
  USE_BROLL_TASK,
  TRANSCRIBE_TASK,
  INDEPENDENT_JOBS_MASTER_AUDIO,
  parseFrontmatter,
  readFrontmatterBlock,
  stripFrontmatterFromContent,
  buildClaudeSettingsJson,
  verifyClaudeSettings,
  scanMediaFiles,
  FOOTAGE_CATEGORIES,
  slugifyCameraLabel,
  scanLooseFiles,
  linkFootageIntoProject,
  listLinkedFootage,
  listCameraLabels,
  unlinkFootage,
  seedUserWorkflowsDir,
  resolveWorkflowFile,
  listWorkflowFilenames,
  getWorkflowOptions,
  getTemplateTags,
  getTemplateFrontmatter,
  stagesFromFrontmatter,
  getStagesFromTemplate,
  triggersFromFrontmatter,
  getTriggersFromTemplate,
  getWorkflowFormState,
  MULTI_ANGLE_BROLL_PROTOCOL,
  buildClaudeMd,
  buildRunPrompt,
  getWrapUpPrompt,
  checkPrerequisites,
  resolvePrerequisites,
};
