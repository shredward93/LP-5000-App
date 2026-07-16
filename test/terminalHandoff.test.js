// @ts-check
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const {
  posixQuote, powershellQuote, killAllLaunchedProcesses,
  buildPosixLauncherScript, buildWindowsLauncherScript,
} = require('../src/main/terminalHandoff');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lp5000-th-test-'));
}

test('posixQuote neutralizes command substitution embedded in a project path', () => {
  const tmp = makeTmpDir();
  try {
    const markerFile = path.join(tmp, 'PWNED');
    const maliciousPath = `/tmp/Wedding $(touch ${markerFile})`;
    const scriptPath = path.join(tmp, 'test.sh');
    fs.writeFileSync(scriptPath, [
      '#!/bin/bash',
      `export BUTTERCUT_PROJECT_DIR=${posixQuote(maliciousPath)}`,
    ].join('\n'));
    execFileSync('bash', [scriptPath]);
    assert.equal(fs.existsSync(markerFile), false, 'the injected command must not have executed');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('posixQuote round-trips a path containing a literal single quote', () => {
  const tmp = makeTmpDir();
  try {
    const trickyPath = path.join(tmp, "O'Brien Wedding");
    fs.mkdirSync(trickyPath);
    const scriptPath = path.join(tmp, 'test.sh');
    const outFile = path.join(tmp, 'out.txt');
    fs.writeFileSync(scriptPath, [
      '#!/bin/bash',
      `printf '%s' ${posixQuote(trickyPath)} > ${posixQuote(outFile)}`,
    ].join('\n'));
    execFileSync('bash', [scriptPath]);
    assert.equal(fs.readFileSync(outFile, 'utf-8'), trickyPath);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('powershellQuote escapes an embedded single quote by doubling it', () => {
  assert.equal(powershellQuote("O'Brien"), "'O''Brien'");
});

test('powershellQuote wraps a value containing a $(...) subexpression as an inert literal', () => {
  const quoted = powershellQuote('Sermon $(evil-command)');
  assert.equal(quoted, "'Sermon $(evil-command)'");
});

test('buildPosixLauncherScript execs claude directly for a fresh run and safely quotes a malicious project path', () => {
  const tmp = makeTmpDir();
  try {
    const markerFile = path.join(tmp, 'PWNED');
    const maliciousPath = `/tmp/Wedding $(touch ${markerFile})`;
    const argsFile = path.join(tmp, 'args.txt');
    const fakeClaude = path.join(tmp, 'fake-claude.sh');
    fs.writeFileSync(fakeClaude, `#!/bin/bash\necho "$@" > ${JSON.stringify(argsFile)}\n`);
    fs.chmodSync(fakeClaude, 0o755);
    const trackFile = path.join(tmp, 'track.txt');

    const script = buildPosixLauncherScript({ projectPath: maliciousPath, claudeCommand: fakeClaude, trackFile, resume: false });
    assert.ok(!script.includes('--continue'), 'a fresh run must not pass --continue');
    assert.match(script, /WAKING UP CLAUDE IN INTERACTIVE MODE/);
    const scriptPath = path.join(tmp, 'run.sh');
    fs.writeFileSync(scriptPath, script);
    fs.chmodSync(scriptPath, 0o755);
    execFileSync('bash', [scriptPath]);

    assert.equal(fs.existsSync(markerFile), false, 'the injected command embedded in the project path must not have executed');
    assert.equal(fs.readFileSync(argsFile, 'utf-8').trim(), '', 'a fresh run should invoke claude with no extra arguments');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('buildPosixLauncherScript execs claude with --continue for a resumed run', () => {
  const tmp = makeTmpDir();
  try {
    const argsFile = path.join(tmp, 'args.txt');
    const fakeClaude = path.join(tmp, 'fake-claude.sh');
    fs.writeFileSync(fakeClaude, `#!/bin/bash\necho "$@" > ${JSON.stringify(argsFile)}\n`);
    fs.chmodSync(fakeClaude, 0o755);
    const trackFile = path.join(tmp, 'track.txt');
    const projectPath = path.join(tmp, 'My Project');
    fs.mkdirSync(projectPath);

    const script = buildPosixLauncherScript({ projectPath, claudeCommand: fakeClaude, trackFile, resume: true });
    assert.match(script, /RESUMING YOUR LAST CLAUDE SESSION/);
    const scriptPath = path.join(tmp, 'run.sh');
    fs.writeFileSync(scriptPath, script);
    fs.chmodSync(scriptPath, 0o755);
    execFileSync('bash', [scriptPath]);

    assert.equal(fs.readFileSync(argsFile, 'utf-8').trim(), '--continue', 'a resumed run should invoke claude with exactly --continue');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('buildWindowsLauncherScript includes --continue only when resuming', () => {
  const trackFile = 'C:\\Temp\\track.txt';
  const fresh = buildWindowsLauncherScript({ projectPath: 'C:\\Projects\\My Wedding', claudeCommand: 'claude', trackFile, resume: false });
  assert.ok(!fresh.includes('--continue'), 'a fresh run must not pass --continue');
  assert.ok(fresh.includes("& 'claude'"));
  assert.match(fresh, /WAKING UP CLAUDE IN INTERACTIVE MODE/);

  const resumed = buildWindowsLauncherScript({ projectPath: 'C:\\Projects\\My Wedding', claudeCommand: 'claude', trackFile, resume: true });
  assert.ok(resumed.includes("& 'claude' --continue"));
  assert.match(resumed, /RESUMING YOUR LAST CLAUDE SESSION/);
});

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test('killAllLaunchedProcesses terminates the tracked process and removes the track file', async () => {
  const tmp = makeTmpDir();
  try {
    const trackFile = path.join(tmp, 'track.txt');
    const child = spawn('sleep', ['30'], { stdio: 'ignore' });
    fs.writeFileSync(trackFile, String(child.pid));
    assert.ok(isAlive(child.pid), 'sanity check: process should be running before kill');

    killAllLaunchedProcesses([trackFile]);
    await new Promise((resolve) => setTimeout(resolve, 200));

    assert.equal(isAlive(child.pid), false, 'the tracked process should be terminated');
    assert.equal(fs.existsSync(trackFile), false, 'the track file should be removed after use');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('killAllLaunchedProcesses reaches a child spawned by the tracked process, not just the tracked pid itself', async () => {
  const tmp = makeTmpDir();
  try {
    const trackFile = path.join(tmp, 'track.txt');
    const grandchildPidFile = path.join(tmp, 'grandchild.pid');
    const scriptFile = path.join(tmp, 'spawn-tree.sh');
    fs.writeFileSync(scriptFile, [
      '#!/bin/bash',
      'sleep 30 &',
      `echo $! > ${JSON.stringify(grandchildPidFile)}`,
      'wait',
    ].join('\n'));
    fs.chmodSync(scriptFile, 0o755);

    // detached: true so this shell becomes its own process-group leader, matching how
    // Terminal.app's tab/shell is the foreground group leader for whatever it spawns.
    const child = spawn(scriptFile, [], { detached: true, stdio: 'ignore' });
    fs.writeFileSync(trackFile, String(child.pid));

    for (let i = 0; i < 50 && !fs.existsSync(grandchildPidFile); i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const grandchildPid = parseInt(fs.readFileSync(grandchildPidFile, 'utf-8').trim(), 10);
    assert.ok(isAlive(child.pid), 'sanity check: parent should be running before kill');
    assert.ok(isAlive(grandchildPid), 'sanity check: grandchild should be running before kill');

    killAllLaunchedProcesses([trackFile]);
    await new Promise((resolve) => setTimeout(resolve, 300));

    assert.equal(isAlive(child.pid), false, 'the tracked process should be terminated');
    assert.equal(isAlive(grandchildPid), false, 'a child spawned by the tracked process should also die (process-group kill)');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('killAllLaunchedProcesses silently ignores a track file that was never written (run never actually started)', () => {
  const tmp = makeTmpDir();
  try {
    assert.doesNotThrow(() => killAllLaunchedProcesses([path.join(tmp, 'never-existed.txt')]));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('killAllLaunchedProcesses silently ignores a track file whose pid has already exited', async () => {
  const tmp = makeTmpDir();
  try {
    const trackFile = path.join(tmp, 'track.txt');
    const child = spawn('true', [], { stdio: 'ignore' });
    await new Promise((resolve) => child.on('exit', resolve));
    fs.writeFileSync(trackFile, String(child.pid));
    assert.doesNotThrow(() => killAllLaunchedProcesses([trackFile]));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
