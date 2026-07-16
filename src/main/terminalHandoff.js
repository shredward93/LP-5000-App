// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { app, clipboard } = require('electron');

// Tracks one file per launched terminal run, written by the generated script itself
// (see launchClaudeInTerminal) with the PID of the actual `claude`/PowerShell process —
// there is no direct child-process handle here, since `open -a Terminal`/`start` hand
// off to an independent GUI window we never get a reference back to. Read at app quit
// so the spawned session doesn't keep running as an orphan after LP5000 closes.
const activeRunTrackFiles = new Set();

/**
 * Single-quote a value for safe interpolation into POSIX shell script source.
 * Single-quoted strings suppress ALL special characters ($, `, \, etc.) except
 * the single quote itself, which is escaped by closing the quote, emitting an
 * escaped literal quote, and reopening — the standard technique.
 * @param {string} value
 */
function posixQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/**
 * Single-quote a value for safe interpolation into PowerShell script source.
 * PowerShell single-quoted strings do not expand $variables or $(...) subexpressions;
 * an embedded quote is escaped by doubling it.
 * @param {string} value
 */
function powershellQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Pure script-text builder for macOS/Linux — no Electron dependency, so this is
 * directly unit-testable. `resume` appends `--continue` (Claude Code's own "most
 * recent conversation in the current directory" flag) instead of a fresh session;
 * LP5000 never needs to track/parse Claude's own session storage to make that work.
 * @param {{projectPath: string, claudeCommand: string, trackFile: string, resume: boolean}} opts
 * @returns {string}
 */
function buildPosixLauncherScript({ projectPath, claudeCommand, trackFile, resume }) {
  const bannerText = resume ? 'RESUMING YOUR LAST CLAUDE SESSION...' : 'WAKING UP CLAUDE IN INTERACTIVE MODE...';
  return [
    '#!/bin/bash',
    'echo "----------------------------------------"',
    `echo " ${bannerText}"`,
    'echo "----------------------------------------"',
    `export BUTTERCUT_PROJECT_DIR=${posixQuote(projectPath)}`,
    `cd ${posixQuote(projectPath)}`,
    // $$ recorded here, then exec replaces this shell with claude IN PLACE (same
    // pid) — so the tracked pid is the actual claude process, not a shell wrapping it.
    `echo $$ > ${posixQuote(trackFile)}`,
    resume ? `exec ${posixQuote(claudeCommand)} --continue` : `exec ${posixQuote(claudeCommand)}`,
  ].join('\n');
}

/** Windows counterpart of {@link buildPosixLauncherScript}; same options, same reasoning. */
function buildWindowsLauncherScript({ projectPath, claudeCommand, trackFile, resume }) {
  const bannerText = resume ? 'RESUMING YOUR LAST CLAUDE SESSION...' : 'WAKING UP CLAUDE IN INTERACTIVE MODE...';
  return [
    'Write-Host "----------------------------------------" -ForegroundColor Cyan',
    `Write-Host " ${bannerText}" -ForegroundColor Green`,
    'Write-Host "----------------------------------------" -ForegroundColor Cyan',
    `$env:BUTTERCUT_PROJECT_DIR=${powershellQuote(projectPath)}`,
    `Set-Location -LiteralPath ${powershellQuote(projectPath)}`,
    // $PID is this PowerShell host's own pid; claude.exe runs as its child, so
    // killing this pid with /T (tree) at app quit takes claude down with it.
    `$PID | Out-File -FilePath ${powershellQuote(trackFile)} -Encoding ascii`,
    resume ? `& ${powershellQuote(claudeCommand)} --continue` : `& ${powershellQuote(claudeCommand)}`,
  ].join('\r\n');
}

/**
 * Copies the prompt to the clipboard (skipped when resuming — there's nothing to
 * paste) and opens a fresh Terminal/PowerShell window cd'd into the project with
 * BUTTERCUT_PROJECT_DIR set, running `claude` (or `claude --continue` when resuming
 * an interrupted session). Ported from gui.py's execute_in_terminal; spawn(cmd,
 * argsArray) is used for the outer process launch so paths containing spaces never
 * need manual shell-quoting — but projectPath/claudeBinary are also embedded as
 * literal text inside a *generated script file*, which spawn()'s argument-array
 * safety does not cover, so they are quoted here too (a folder name containing `"`
 * or `$(...)` would otherwise break out of the naive `"${projectPath}"`
 * interpolation and execute as script syntax).
 * @param {string} projectPath
 * @param {string} prompt
 * @param {{claudeBinary?: string | null, resume?: boolean}} [opts] Resolved `claude`
 *   binary path from settingsStore (Settings panel override or auto-detected); falls
 *   back to bare `claude` (PATH lookup) if not provided/resolved. `resume: true`
 *   continues the most recent conversation in this project instead of starting fresh.
 */
function launchClaudeInTerminal(projectPath, prompt, opts = {}) {
  const resume = Boolean(opts.resume);
  if (prompt) clipboard.writeText(prompt);
  const stamp = Date.now();
  const claudeCommand = opts.claudeBinary || 'claude';
  const trackFile = path.join(app.getPath('temp'), `lp5000_pid_${stamp}.txt`);
  activeRunTrackFiles.add(trackFile);

  if (process.platform === 'win32') {
    const scriptPath = path.join(app.getPath('temp'), `lp5000_run_${stamp}.ps1`);
    fs.writeFileSync(scriptPath, buildWindowsLauncherScript({ projectPath, claudeCommand, trackFile, resume }), 'utf-8');
    // The empty "" is a required placeholder TITLE argument for `start` — without it,
    // a quoted path-with-spaces as the first token is misread as the window title.
    spawn('cmd.exe', ['/c', 'start', '""', 'powershell', '-NoExit', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    }).unref();
  } else {
    const scriptPath = path.join(app.getPath('temp'), `lp5000_run_${stamp}.command`);
    fs.writeFileSync(scriptPath, buildPosixLauncherScript({ projectPath, claudeCommand, trackFile, resume }), 'utf-8');
    fs.chmodSync(scriptPath, 0o755);
    spawn('open', ['-a', 'Terminal', scriptPath], { detached: true, stdio: 'ignore' }).unref();
  }
}

/**
 * Best-effort shutdown of every terminal/claude session this app has launched —
 * called on app quit so closing LP5000 doesn't leave an orphaned Claude session (and
 * whatever it spawned — ffmpeg, whisper, git) running invisibly in a Terminal window.
 * We never touch Terminal.app itself (it's a shared system app that may have unrelated
 * windows open); we only target the specific pid our own script recorded.
 * @param {string[]} [trackFiles] Defaults to every run launched this session.
 */
function killAllLaunchedProcesses(trackFiles = [...activeRunTrackFiles]) {
  for (const file of trackFiles) {
    activeRunTrackFiles.delete(file);
    let pid;
    try {
      pid = parseInt(fs.readFileSync(file, 'utf-8').trim(), 10);
    } catch {
      continue; // never started, or already cleaned up
    }
    if (!Number.isInteger(pid) || pid <= 0) continue;

    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F']);
    } else {
      // Negative pid targets the whole process group first (reaches children claude
      // itself spawned); fall back to the bare pid in case it was never a group leader.
      try { process.kill(-pid, 'SIGTERM'); } catch { /* not a group leader, or already gone */ }
      try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ }
    }
    try { fs.unlinkSync(file); } catch { /* already gone */ }
  }
}

module.exports = {
  launchClaudeInTerminal,
  killAllLaunchedProcesses,
  posixQuote,
  powershellQuote,
  buildPosixLauncherScript,
  buildWindowsLauncherScript,
};
