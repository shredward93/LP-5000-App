// @ts-check
'use strict';

const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const { registerIpcHandlers } = require('./ipc');
const { getSettings, updateSettings } = require('./store/settingsStore');
const { killAllLaunchedProcesses } = require('./terminalHandoff');

/** @type {BrowserWindow | null} */
let mainWindow = null;

function createWindow() {
  const settings = getSettings();
  const bounds = settings.ui.windowBounds;

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x ?? undefined,
    y: bounds.y ?? undefined,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0f0f0f',
    title: 'LP 5000 Smart Engine',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.webContents.on('console-message', (event) => {
    if (event.level === 'error' || event.level === 2) {
      console.error(`[renderer] ${event.message} (${event.sourceId}:${event.lineNumber})`);
    }
  });

  const persistBounds = () => {
    if (!mainWindow) return;
    const [width, height] = mainWindow.getSize();
    const [x, y] = mainWindow.getPosition();
    updateSettings({ ui: { windowBounds: { width, height, x, y } } });
  };
  mainWindow.on('resize', persistBounds);
  mainWindow.on('move', persistBounds);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

let isQuitting = false;
app.on('before-quit', (event) => {
  if (isQuitting) return;
  event.preventDefault();
  isQuitting = true;
  Promise.resolve(killAllLaunchedProcesses()).finally(() => app.quit());
});
