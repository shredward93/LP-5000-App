// @ts-check
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  projectStore: {
    listProjects: () => ipcRenderer.invoke('projectStore:listProjects'),
    getProject: (id) => ipcRenderer.invoke('projectStore:getProject', id),
    openProjectDialog: () => ipcRenderer.invoke('projectStore:openProjectDialog'),
    commitProject: (projectPath, opts) => ipcRenderer.invoke('projectStore:commitProject', projectPath, opts),
    setActiveProject: (id) => ipcRenderer.invoke('projectStore:setActiveProject', id),
    scaffoldProject: (projectPath) => ipcRenderer.invoke('projectStore:scaffoldProject', projectPath),
    refreshProjectStatus: (id) => ipcRenderer.invoke('projectStore:refreshProjectStatus', id),
    updateProjectLastSettings: (id, patch) => ipcRenderer.invoke('projectStore:updateProjectLastSettings', id, patch),
    renameProjectLabel: (id, label) => ipcRenderer.invoke('projectStore:renameProjectLabel', id, label),
    relinkProject: (id, newPath) => ipcRenderer.invoke('projectStore:relinkProject', id, newPath),
    archiveProject: (id, archived) => ipcRenderer.invoke('projectStore:archiveProject', id, archived),
    removeProject: (id) => ipcRenderer.invoke('projectStore:removeProject', id),
    revealInFileManager: (id) => ipcRenderer.invoke('projectStore:revealInFileManager', id),
  },
  settingsStore: {
    getSettings: () => ipcRenderer.invoke('settingsStore:getSettings'),
    updateSettings: (patch) => ipcRenderer.invoke('settingsStore:updateSettings', patch),
    detectTool: (tool) => ipcRenderer.invoke('settingsStore:detectTool', tool),
    setToolOverride: (tool, overridePath) => ipcRenderer.invoke('settingsStore:setToolOverride', tool, overridePath),
    setWhisperVariant: (variant) => ipcRenderer.invoke('settingsStore:setWhisperVariant', variant),
    browseForToolBinary: (tool) => ipcRenderer.invoke('settingsStore:browseForToolBinary', tool),
    getResolvedToolPath: (tool) => ipcRenderer.invoke('settingsStore:getResolvedToolPath', tool),
    getWorkflowsDirs: () => ipcRenderer.invoke('settingsStore:getWorkflowsDirs'),
    setWorkflowsOverrideDir: (dirPath) => ipcRenderer.invoke('settingsStore:setWorkflowsOverrideDir', dirPath),
    getOptionLists: () => ipcRenderer.invoke('settingsStore:getOptionLists'),
    detectButtercut: () => ipcRenderer.invoke('settingsStore:detectButtercut'),
    setButtercutOverride: (dirPath) => ipcRenderer.invoke('settingsStore:setButtercutOverride', dirPath),
    browseForButtercutDir: () => ipcRenderer.invoke('settingsStore:browseForButtercutDir'),
    updateButtercut: () => ipcRenderer.invoke('settingsStore:updateButtercut'),
    listPromptTemplates: () => ipcRenderer.invoke('settingsStore:listPromptTemplates'),
    savePromptTemplate: (template) => ipcRenderer.invoke('settingsStore:savePromptTemplate', template),
    deletePromptTemplate: (id) => ipcRenderer.invoke('settingsStore:deletePromptTemplate', id),
  },
  media: {
    scan: (projectPath) => ipcRenderer.invoke('media:scan', projectPath),
  },
  footage: {
    listCategories: () => ipcRenderer.invoke('footage:listCategories'),
    listCameraLabels: (projectPath) => ipcRenderer.invoke('footage:listCameraLabels', projectPath),
    scanLoose: (projectPath) => ipcRenderer.invoke('footage:scanLoose', projectPath),
    pickFiles: () => ipcRenderer.invoke('footage:pickFiles'),
    link: (projectPath, assignments) => ipcRenderer.invoke('footage:link', projectPath, assignments),
    list: (projectPath) => ipcRenderer.invoke('footage:list', projectPath),
    unlink: (linkPath) => ipcRenderer.invoke('footage:unlink', linkPath),
  },
  workflows: {
    listOptions: () => ipcRenderer.invoke('workflows:listOptions'),
    getFormState: (templateName, flags) => ipcRenderer.invoke('workflows:getFormState', templateName, flags),
    openFolder: () => ipcRenderer.invoke('workflows:openFolder'),
  },
  prereqs: {
    check: (projectPath, selectedFiles) => ipcRenderer.invoke('prereqs:check', projectPath, selectedFiles),
  },
  engine: {
    buildAndRun: (payload) => ipcRenderer.invoke('engine:buildAndRun', payload),
    wrapUp: (projectPath) => ipcRenderer.invoke('engine:wrapUp', projectPath),
  },
});
