// @ts-check
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { ipcMain, shell, dialog } = require('electron');
const engine = require('./engine');
const settingsStore = require('./store/settingsStore');
const projectStore = require('./store/projectStore');
const { launchClaudeInTerminal } = require('./terminalHandoff');

/** Wrap a handler so every IPC response has a uniform {ok, ...} / {ok:false, error} shape. */
function wrap(fn) {
  return async (_event, ...args) => {
    try {
      const data = await fn(...args);
      return { ok: true, ...(data && typeof data === 'object' && !Array.isArray(data) ? data : { data }) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  };
}

function handle(channel, fn) {
  ipcMain.handle(channel, wrap(fn));
}

function workflowsDirsEnsuredSeeded() {
  const dirs = settingsStore.getWorkflowsDirs();
  engine.seedUserWorkflowsDir({ bundledDir: dirs.bundledDir, userDir: dirs.userDir });
  return dirs;
}

function registerIpcHandlers() {
  // --- projectStore ---
  handle('projectStore:listProjects', () => ({ projects: projectStore.listProjects() }));
  handle('projectStore:getProject', (id) => ({ project: projectStore.getProject(id) }));
  handle('projectStore:openProjectDialog', () => projectStore.openProjectDialog());
  handle('projectStore:commitProject', (projectPath, opts) => projectStore.commitProject(projectPath, opts).then((project) => ({ project })));
  handle('projectStore:setActiveProject', (id) => projectStore.setActiveProject(id).then((project) => ({ project })));
  handle('projectStore:scaffoldProject', (projectPath) => projectStore.scaffoldProject(projectPath));
  handle('projectStore:refreshProjectStatus', (id) => projectStore.refreshProjectStatus(id).then((status) => ({ status })));
  handle('projectStore:updateProjectLastSettings', (id, patch) => projectStore.updateProjectLastSettings(id, patch).then((project) => ({ project })));
  handle('projectStore:renameProjectLabel', (id, label) => projectStore.renameProjectLabel(id, label).then((project) => ({ project })));
  handle('projectStore:relinkProject', (id, newPath) => projectStore.relinkProject(id, newPath).then((project) => ({ project })));
  handle('projectStore:archiveProject', (id, archived) => projectStore.archiveProject(id, archived).then((project) => ({ project })));
  handle('projectStore:removeProject', (id) => projectStore.removeProject(id));
  handle('projectStore:revealInFileManager', (id) => projectStore.revealInFileManager(id));

  // --- settingsStore ---
  handle('settingsStore:getSettings', () => ({ settings: settingsStore.getSettings() }));
  handle('settingsStore:updateSettings', (patch) => settingsStore.updateSettings(patch).then((settings) => ({ settings })));
  handle('settingsStore:detectTool', (tool) => settingsStore.detectTool(tool).then((status) => ({ status })));
  handle('settingsStore:setToolOverride', (tool, overridePath) => settingsStore.setToolOverride(tool, overridePath).then((status) => ({ status })));
  handle('settingsStore:setWhisperVariant', (variant) => settingsStore.setWhisperVariant(variant).then((status) => ({ status })));
  handle('settingsStore:browseForToolBinary', (tool) => settingsStore.browseForToolBinary(tool));
  handle('settingsStore:getResolvedToolPath', (tool) => ({ resolvedPath: settingsStore.getResolvedToolPath(tool) }));
  handle('settingsStore:getWorkflowsDirs', () => ({ dirs: settingsStore.getWorkflowsDirs() }));
  handle('settingsStore:setWorkflowsOverrideDir', (dirPath) => settingsStore.setWorkflowsOverrideDir(dirPath).then((settings) => ({ settings })));
  handle('settingsStore:getOptionLists', () => ({
    whisperVariants: settingsStore.WHISPER_VARIANTS,
    claudeModels: settingsStore.CLAUDE_MODEL_OPTIONS,
    claudeEfforts: settingsStore.CLAUDE_EFFORT_OPTIONS,
  }));
  handle('settingsStore:detectButtercut', () => settingsStore.detectButtercut().then((status) => ({ status })));
  handle('settingsStore:setButtercutOverride', (dirPath) => settingsStore.setButtercutOverride(dirPath).then((status) => ({ status })));
  handle('settingsStore:browseForButtercutDir', () => settingsStore.browseForButtercutDir());
  handle('settingsStore:updateButtercut', () => settingsStore.updateButtercut());
  handle('settingsStore:listPromptTemplates', () => ({ templates: settingsStore.listPromptTemplates() }));
  handle('settingsStore:savePromptTemplate', (template) => settingsStore.savePromptTemplate(template).then((templates) => ({ templates })));
  handle('settingsStore:deletePromptTemplate', (id) => settingsStore.deletePromptTemplate(id).then((templates) => ({ templates })));
  handle('settingsStore:exportPromptTemplates', () => settingsStore.exportPromptTemplatesToFile());
  handle('settingsStore:importPromptTemplates', () => settingsStore.importPromptTemplatesFromFile());

  // --- media ---
  handle('media:scan', (projectPath) => ({ files: engine.scanMediaFiles(projectPath) }));

  // --- footage import (symlink raw footage into the project in place) ---
  handle('footage:listCategories', () => ({ categories: Object.keys(engine.FOOTAGE_CATEGORIES) }));
  handle('footage:listCameraLabels', (projectPath) => ({ labels: engine.listCameraLabels(projectPath) }));
  handle('footage:scanLoose', (projectPath) => ({ files: engine.scanLooseFiles(projectPath) }));
  handle('footage:pickFiles', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] });
    if (result.canceled) return { canceled: true, files: [] };
    return { canceled: false, files: result.filePaths };
  });
  handle('footage:link', (projectPath, assignments) => engine.linkFootageIntoProject(projectPath, assignments));
  handle('footage:list', (projectPath) => ({ items: engine.listLinkedFootage(projectPath) }));
  handle('footage:unlink', (linkPath) => { engine.unlinkFootage(linkPath); return {}; });
  handle('footage:getFileLabels', (projectPath) => ({ labels: engine.getFileLabels(projectPath) }));
  handle('footage:setFileLabel', (projectPath, relativePath, label) => ({ labels: engine.setFileLabel(projectPath, relativePath, label) }));

  // --- workflows ---
  handle('workflows:listOptions', () => ({ options: engine.getWorkflowOptions(workflowsDirsEnsuredSeeded()) }));
  handle('workflows:getFormState', (templateName, flags = {}) => {
    const workflowsDirs = workflowsDirsEnsuredSeeded();
    const { tags, stages, triggers } = engine.getWorkflowFormState(workflowsDirs, templateName, flags);
    return { tags: tags ? [...tags] : null, stages, triggers };
  });
  handle('workflows:openFolder', () => {
    const dirs = workflowsDirsEnsuredSeeded();
    return shell.openPath(dirs.userDir).then((err) => {
      if (err) throw new Error(err);
    });
  });

  // --- prereqs ---
  handle('prereqs:check', (projectPath, selectedFiles) => engine.checkPrerequisites(projectPath, selectedFiles || []));

  // --- engine (orchestration: gather -> build -> write -> spawn) ---
  handle('engine:buildAndRun', async (payload) => {
    const {
      projectId, projectPath, templateName, dynamicVars = {}, customProjName = '',
      vibe, pacing, masterAudio, syncMethod, transcriptionSource,
      activeTasks = [], projectPrompt = '', selectedFiles = [],
    } = payload;

    const workflowsDirs = workflowsDirsEnsuredSeeded();
    const stages = engine.getStagesFromTemplate(
      workflowsDirs, templateName,
      activeTasks.includes(engine.MULTICAM_SYNC_TASK),
      activeTasks.includes(engine.USE_BROLL_TASK),
    );

    const { hasLibrary, missingTranscriptsFor } = engine.checkPrerequisites(projectPath, selectedFiles);
    const injectedTasks = engine.resolvePrerequisites({ activeTasks, stages, hasLibrary, missingTranscriptsFor });
    const finalTasks = [...new Set([...injectedTasks, ...activeTasks])];

    engine.verifyClaudeSettings(projectPath, settingsStore.getSettings().claudeOptions);
    const buttercutPath = settingsStore.getResolvedButtercutPath();
    const whisperPath = settingsStore.getResolvedToolPath('whisper');
    const ffmpegPath = settingsStore.getResolvedToolPath('ffmpeg');
    const fileLabels = engine.getFileLabels(projectPath);
    const xmlExportDir = settingsStore.getXmlExportDir();
    const md = engine.buildClaudeMd({
      workflowsDirs, templateName, dynamicVars, customProjName, vibe, pacing, masterAudio,
      syncMethod, transcriptionSource, projectPrompt, whisperPath, ffmpegPath, selectedFiles, fileLabels, buttercutPath,
      xmlExportDir,
    });
    const claudeMdPath = path.join(projectPath, '.claude', 'CLAUDE.md');
    fs.mkdirSync(path.dirname(claudeMdPath), { recursive: true });
    fs.writeFileSync(claudeMdPath, md, 'utf-8');

    const prompt = engine.buildRunPrompt(finalTasks, projectPrompt, selectedFiles);
    launchClaudeInTerminal(projectPath, prompt, { claudeBinary: settingsStore.getResolvedToolPath('claude') });

    if (projectId) {
      await projectStore.updateProjectLastSettings(projectId, {
        workflowTemplate: templateName, vibe, pacing, masterAudioSource: masterAudio,
        syncMethod, transcriptionSource,
        customProjectName: customProjName, dynamicTagValues: dynamicVars,
        checkedTasks: Object.fromEntries(activeTasks.map((t) => [t, true])),
        projectPrompt,
      });
      await projectStore.markRun(projectId);
    }

    return { injectedTasks, finalTasks, claudeMdPath, prompt };
  });

  handle('engine:wrapUp', (projectPath) => {
    launchClaudeInTerminal(projectPath, engine.getWrapUpPrompt(), { claudeBinary: settingsStore.getResolvedToolPath('claude') });
    return {};
  });

  // Recovers an interrupted session (e.g. the terminal got closed mid-run) via
  // Claude Code's own `--continue` — resumes the most recent conversation for this
  // project directory. No prompt/clipboard involved; Claude picks up where it left off.
  handle('engine:resumeSession', async (projectPath, projectId) => {
    launchClaudeInTerminal(projectPath, '', { claudeBinary: settingsStore.getResolvedToolPath('claude'), resume: true });
    if (projectId) await projectStore.markRun(projectId);
    return {};
  });
}

module.exports = { registerIpcHandlers };
