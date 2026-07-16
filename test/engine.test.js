// @ts-check
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const engine = require('../src/main/engine');

const REAL_WORKFLOWS_DIR = path.join(__dirname, '..', 'assets', 'Workflows');
const realDirs = () => ({ effectiveDirs: [REAL_WORKFLOWS_DIR] });

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lp5000-test-'));
}

test('getWorkflowOptions lists the 5 real templates and excludes README.md', () => {
  const options = engine.getWorkflowOptions(realDirs());
  assert.ok(options.includes(engine.BUILD_FROM_SCRATCH));
  assert.ok(options.includes('Sermon_Workflow.md'));
  assert.ok(options.includes('Wedding_Workflow.md'));
  assert.ok(options.includes('Doc_Workflow.md'));
  assert.ok(options.includes('General_Workflow.md'));
  assert.ok(options.includes('BRoll_Selects_Workflow.md'));
  assert.ok(!options.some((o) => o.toLowerCase() === 'readme.md'), 'README.md must not appear as a selectable workflow');
});

test('frontmatter parses Stage 1-4 + triggers for every real template', () => {
  for (const name of ['Sermon_Workflow.md', 'General_Workflow.md', 'Wedding_Workflow.md', 'Doc_Workflow.md', 'BRoll_Selects_Workflow.md']) {
    const fm = engine.getTemplateFrontmatter(realDirs(), name);
    assert.ok(Array.isArray(fm['Stage 1']) && fm['Stage 1'].length > 0, `${name} Stage 1`);
    assert.ok(Array.isArray(fm['Stage 2']), `${name} Stage 2`);
    assert.ok(Array.isArray(fm['Stage 3']) && fm['Stage 3'].length > 0, `${name} Stage 3`);
    assert.ok(Array.isArray(fm['Stage 4']) && fm['Stage 4'].length > 0, `${name} Stage 4`);
    assert.ok(Array.isArray(fm.triggers), `${name} triggers`);
  }
});

test('BRoll_Selects_Workflow.md is the confirmed structural outlier: single Stage 1 item, no multicam option', () => {
  const fm = engine.getTemplateFrontmatter(realDirs(), 'BRoll_Selects_Workflow.md');
  assert.equal(fm['Stage 1'].length, 1);
  assert.equal(fm['Stage 1'][0], engine.USE_BROLL_TASK);
  assert.ok(!fm['Stage 1'].includes(engine.MULTICAM_SYNC_TASK));
});

test('getStagesFromTemplate does not inject B-Roll overlay tasks for the B-Roll-only workflow', () => {
  const stages = engine.getStagesFromTemplate(realDirs(), 'BRoll_Selects_Workflow.md', false, true);
  assert.ok(!stages['Stage 3'].some((t) => t.includes('Insert appropriate B-Roll on V2')));
});

test('getStagesFromTemplate injects the auto-cut task when multicam sync is active', () => {
  const stages = engine.getStagesFromTemplate(realDirs(), 'Sermon_Workflow.md', true, false);
  assert.ok(stages['Stage 3'].includes('Auto-cut to B-Cam for intimate/emotional moments (Transcript-based)'));
});

test('getTemplateFrontmatter falls back to General_Workflow.md for an unknown template', () => {
  const fm = engine.getTemplateFrontmatter(realDirs(), 'Does_Not_Exist.md');
  const general = engine.getTemplateFrontmatter(realDirs(), 'General_Workflow.md');
  assert.deepEqual(fm, general);
});

test('buildClaudeMd substitutes ALL occurrences of a repeated {{tag}}, not just the first', () => {
  const tmp = makeTmpDir();
  try {
    const workflowsDir = path.join(tmp, 'workflows');
    fs.mkdirSync(workflowsDir);
    fs.writeFileSync(
      path.join(workflowsDir, 'Repeat_Workflow.md'),
      '---\nStage 1:\n  - "Use A-Roll Footage"\nStage 2:\n  - "Give me a transcript summary"\nStage 3:\n  - "Build Narrative Paper Edit"\nStage 4:\n  - "Export Final XML to ./03_Edit/XML_Exports"\n---\n\n'
      + '# PROJECT: {{Name}}\nSecond mention of {{Name}} here.\n',
    );
    const md = engine.buildClaudeMd({
      workflowsDirs: { effectiveDirs: [workflowsDir] },
      templateName: 'Repeat_Workflow.md',
      dynamicVars: { Name: 'Grace Pt. 3' },
      customProjName: '',
      vibe: 'Cinematic & Emotional',
      pacing: 'Moderate',
      masterAudio: 'A-Roll (Cam A)',
    });
    assert.ok(md.includes('# PROJECT: Grace Pt. 3'));
    assert.ok(md.includes('Second mention of Grace Pt. 3 here.'));
    assert.ok(!md.includes('{{Name}}'), 'no unreplaced tag should remain');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('bug fix 1: selected files are named explicitly in both CLAUDE.md and the run prompt', () => {
  const md = engine.buildClaudeMd({
    workflowsDirs: realDirs(),
    templateName: 'Sermon_Workflow.md',
    dynamicVars: { 'Sermon Title or Date': '7/12', 'Target Number of Clips': '3', 'Overall Tone': 'Uplifting' },
    customProjName: '',
    vibe: 'Cinematic & Emotional',
    pacing: 'Moderate',
    masterAudio: 'A-Roll (Cam A)',
    selectedFiles: ['01_Footage/A-Roll/Cam_A/Smyrna_Live__1030am_2160.mp4'],
  });
  assert.ok(md.includes('TARGET SOURCE FILES'));
  assert.ok(md.includes('Smyrna_Live__1030am_2160.mp4'));

  const prompt = engine.buildRunPrompt(['Franken-bite & Remove Dead Space'], '', ['01_Footage/A-Roll/Cam_A/Smyrna_Live__1030am_2160.mp4']);
  assert.ok(prompt.includes('Use exactly these source files: 01_Footage/A-Roll/Cam_A/Smyrna_Live__1030am_2160.mp4'));
});

test('buildClaudeMd attaches user notes to generic filenames in TARGET SOURCE FILES, and leaves unlabeled files bare', () => {
  const md = engine.buildClaudeMd({
    workflowsDirs: realDirs(),
    templateName: 'Sermon_Workflow.md',
    dynamicVars: { 'Sermon Title or Date': '7/12', 'Target Number of Clips': '3', 'Overall Tone': 'Uplifting' },
    customProjName: '',
    vibe: 'Cinematic & Emotional',
    pacing: 'Moderate',
    masterAudio: 'A-Roll (Cam A)',
    selectedFiles: ['01_Footage/A-Roll/Cam_A/GH010045.MP4', '01_Footage/A-Roll/Cam_B/C0012.MP4'],
    fileLabels: { '01_Footage/A-Roll/Cam_A/GH010045.MP4': 'Wide crowd shot, song 1' },
  });
  assert.ok(md.includes('- 01_Footage/A-Roll/Cam_A/GH010045.MP4 — "Wide crowd shot, song 1"'), 'labeled file should carry its note');
  assert.ok(md.includes('- 01_Footage/A-Roll/Cam_B/C0012.MP4') && !md.includes('C0012.MP4 — "'), 'unlabeled file should appear with no note attached');
});

test('buildClaudeMd explains independent per-file jobs when the master audio sentinel is selected, instead of echoing it as a literal value', () => {
  const md = engine.buildClaudeMd({
    workflowsDirs: realDirs(),
    templateName: 'Sermon_Workflow.md',
    dynamicVars: { 'Sermon Title or Date': '7/12', 'Target Number of Clips': '3', 'Overall Tone': 'Uplifting' },
    customProjName: '',
    vibe: 'Cinematic & Emotional',
    pacing: 'Moderate',
    masterAudio: engine.INDEPENDENT_JOBS_MASTER_AUDIO,
    selectedFiles: [
      '01_Footage/A-Roll/Cam_Creek/sermon.mp4',
      '01_Footage/A-Roll/Cam_Dale/sermon.mp4',
      '01_Footage/A-Roll/Cam_Smyrna/sermon.mp4',
    ],
  });
  assert.ok(!md.includes(engine.INDEPENDENT_JOBS_MASTER_AUDIO), 'sentinel label itself should not leak verbatim into the doc');
  assert.match(md, /own on-camera audio track/);
  assert.match(md, /Do NOT multicam-sync them together/);
  assert.match(md, /separate job.*separate output/s);
});

test('buildClaudeMd includes the multi-angle + B-Roll track protocol, generalized to N cameras with enabled-toggle and locked A1', () => {
  const md = engine.buildClaudeMd({
    workflowsDirs: realDirs(),
    templateName: 'Sermon_Workflow.md',
    dynamicVars: {},
    customProjName: '',
    vibe: 'Cinematic & Emotional',
    pacing: 'Moderate',
    masterAudio: 'A-Roll (Cam A)',
    selectedFiles: [],
  });
  assert.ok(md.includes(engine.MULTI_ANGLE_BROLL_PROTOCOL));
  assert.ok(md.includes('V1..VN = one track per camera angle'), 'must not hardcode a fixed camera count');
  assert.ok(md.includes('N is not fixed'));
  assert.ok(md.includes('<enabled>FALSE</enabled>'), 'must specify disabling the non-live angle rather than omitting its clip');
  assert.ok(md.includes('A1 = Master audio, locked, one source, NEVER re-sourced'));
});

test('buildClaudeMd references the resolved ButterCut path when configured, or says so plainly when not', () => {
  const base = {
    workflowsDirs: realDirs(),
    templateName: 'Sermon_Workflow.md',
    dynamicVars: {},
    customProjName: '',
    vibe: 'Cinematic & Emotional',
    pacing: 'Moderate',
    masterAudio: 'A-Roll (Cam A)',
    selectedFiles: [],
  };
  const withPath = engine.buildClaudeMd({ ...base, buttercutPath: '/Users/edward/Buttercut' });
  assert.ok(withPath.includes('/Users/edward/Buttercut'));
  assert.ok(!withPath.includes('global Buttercut gem'), 'stale gem-based wording must not survive');

  const withoutPath = engine.buildClaudeMd({ ...base, buttercutPath: null });
  assert.ok(withoutPath.includes('not configured in Settings'));
});

test('buildClaudeMd points Claude at the bundled xml-export tooling as the single source of truth for franken-bite exports', () => {
  const base = {
    workflowsDirs: realDirs(),
    templateName: 'Sermon_Workflow.md',
    dynamicVars: {},
    customProjName: '',
    vibe: 'Cinematic & Emotional',
    pacing: 'Moderate',
    masterAudio: 'A-Roll (Cam A)',
    selectedFiles: [],
  };
  const withDir = engine.buildClaudeMd({ ...base, xmlExportDir: '/Applications/LP5000.app/Contents/Resources/assets/xml-export' });
  assert.match(withDir, /franken_bit_export\.rb/);
  assert.match(withDir, /EXPORT_NOTES\.md/);
  assert.ok(withDir.includes('/Applications/LP5000.app/Contents/Resources/assets/xml-export'));
  assert.match(withDir, /troubleshoot and fix an XML export\/import problem/i, 'Claude must be told to write fixes back into EXPORT_NOTES.md, not just remember them');

  const withoutDir = engine.buildClaudeMd({ ...base, xmlExportDir: null });
  assert.ok(!withoutDir.includes('franken_bit_export.rb'));
});

test('buildClaudeMd tells Claude the exact resolved whisper/ffmpeg binaries to use, not just the app Settings panel', () => {
  const base = {
    workflowsDirs: realDirs(),
    templateName: 'Sermon_Workflow.md',
    dynamicVars: {},
    customProjName: '',
    vibe: 'Cinematic & Emotional',
    pacing: 'Moderate',
    masterAudio: 'A-Roll (Cam A)',
    selectedFiles: [],
  };
  // Regression: previously Settings' resolved whisper/ffmpeg paths were computed but
  // never actually threaded into CLAUDE.md, so picking "whispermlx" in Settings had no
  // effect on which binary Claude actually invoked during a session.
  const withPaths = engine.buildClaudeMd({
    ...base,
    whisperPath: '/Users/edward/.local/bin/whispermlx',
    ffmpegPath: '/opt/homebrew/bin/ffmpeg',
  });
  assert.match(withPaths, /Transcription \(Whisper\).*\/Users\/edward\/\.local\/bin\/whispermlx/);
  assert.match(withPaths, /ffmpeg.*\/opt\/homebrew\/bin\/ffmpeg/);

  const withoutPaths = engine.buildClaudeMd({ ...base, whisperPath: null, ffmpegPath: null });
  assert.match(withoutPaths, /whisper \(not resolved by LP5000/);
  assert.match(withoutPaths, /ffmpeg \(not resolved by LP5000/);
});

test('buildClaudeMd includes the Project Prompt as its own durable section when non-empty, and omits it entirely when blank', () => {
  const base = {
    workflowsDirs: realDirs(),
    templateName: 'Sermon_Workflow.md',
    dynamicVars: {},
    customProjName: '',
    vibe: 'Cinematic & Emotional',
    pacing: 'Moderate',
    masterAudio: 'A-Roll (Cam A)',
    selectedFiles: [],
  };
  const withPrompt = engine.buildClaudeMd({ ...base, projectPrompt: 'This is a 90-second Easter recap. Keep pacing upbeat.' });
  assert.match(withPrompt, /Project Vision & Instructions/);
  assert.ok(withPrompt.includes('This is a 90-second Easter recap. Keep pacing upbeat.'));

  const withoutPrompt = engine.buildClaudeMd({ ...base, projectPrompt: '' });
  assert.ok(!withoutPrompt.includes('Project Vision & Instructions'));

  const whitespaceOnlyPrompt = engine.buildClaudeMd({ ...base, projectPrompt: '   \n  ' });
  assert.ok(!whitespaceOnlyPrompt.includes('Project Vision & Instructions'));
});

test('buildClaudeMd defaults to Waveform sync (no jam-synced timecode assumed) and switches to Timecode wording only when explicitly selected', () => {
  const base = {
    workflowsDirs: realDirs(),
    templateName: 'Sermon_Workflow.md',
    dynamicVars: {},
    customProjName: '',
    vibe: 'Cinematic & Emotional',
    pacing: 'Moderate',
    masterAudio: 'A-Roll (Cam A)',
    selectedFiles: [],
  };
  const noMethodSpecified = engine.buildClaudeMd(base);
  assert.match(noMethodSpecified, /Sync Method \(Waveform — default\)/);
  assert.match(noMethodSpecified, /does NOT use jam-synced timecode/);
  assert.ok(!noMethodSpecified.includes('Sync Method (Timecode)'));

  const waveform = engine.buildClaudeMd({ ...base, syncMethod: engine.SYNC_METHOD_WAVEFORM });
  assert.match(waveform, /WAVEFORM \(audio cross-correlation\)/);

  const timecode = engine.buildClaudeMd({ ...base, syncMethod: engine.SYNC_METHOD_TIMECODE });
  assert.match(timecode, /Sync Method \(Timecode\)/);
  assert.match(timecode, /matching embedded SMPTE timecode/);
  assert.ok(!timecode.includes('Sync Method (Waveform'));

  // Multiple-Ext-Audio guidance always present regardless of method — a shoot with
  // several mics/recorders must have every one synced, not just the first found.
  for (const md of [noMethodSpecified, waveform, timecode]) {
    assert.match(md, /Multiple Ext Audio Files/);
    assert.match(md, /sync EACH ONE individually/);
  }
});

test('buildClaudeMd resolves Transcription Source independently of Master Audio Source', () => {
  const base = {
    workflowsDirs: realDirs(),
    templateName: 'Sermon_Workflow.md',
    dynamicVars: {},
    customProjName: '',
    vibe: 'Cinematic & Emotional',
    pacing: 'Moderate',
    masterAudio: 'A-Roll (Cam A)',
    selectedFiles: [],
  };
  const defaultBehavior = engine.buildClaudeMd(base);
  assert.match(defaultBehavior, /Transcription Source:\*\* Same as Master Audio Source above/);

  const sameAsMaster = engine.buildClaudeMd({ ...base, transcriptionSource: engine.TRANSCRIPTION_SOURCE_SAME_AS_MASTER });
  assert.match(sameAsMaster, /Transcription Source:\*\* Same as Master Audio Source above/);

  const merged = engine.buildClaudeMd({ ...base, transcriptionSource: engine.TRANSCRIPTION_SOURCE_MERGE_EXT_AUDIO });
  assert.match(merged, /Merge\/combine every file under `02_Audio\/Ext_Audio\/` into/);
  assert.match(merged, /Do NOT transcribe just one ext audio file and ignore the others/);

  // A specific source (e.g. one particular camera), independent of Master Audio Source
  // which is set to a *different* camera above — must not silently fall back to it.
  const specific = engine.buildClaudeMd({ ...base, masterAudio: 'A-Roll (Cam A)', transcriptionSource: 'A-Roll (Cam B)' });
  assert.match(specific, /Regardless of Master Audio Source above, transcribe exactly this source: A-Roll \(Cam B\)/);
});

test('bug fix 1: empty selection omits the target-files section entirely', () => {
  const md = engine.buildClaudeMd({
    workflowsDirs: realDirs(),
    templateName: 'Sermon_Workflow.md',
    dynamicVars: { 'Sermon Title or Date': '', 'Target Number of Clips': '3', 'Overall Tone': '' },
    customProjName: '',
    vibe: 'Cinematic & Emotional',
    pacing: 'Moderate',
    masterAudio: 'A-Roll (Cam A)',
    selectedFiles: [],
  });
  assert.ok(!md.includes('TARGET SOURCE FILES'));
});

test('bug fix 2: checkPrerequisites reports missing library + missing transcripts for a fresh project', () => {
  const tmp = makeTmpDir();
  try {
    fs.mkdirSync(path.join(tmp, '03_Edit', 'Transcripts'), { recursive: true });
    const result = engine.checkPrerequisites(tmp, ['01_Footage/A-Roll/Cam_A/Smyrna_Live.mp4']);
    assert.equal(result.hasLibrary, false);
    assert.deepEqual(result.missingTranscriptsFor, ['01_Footage/A-Roll/Cam_A/Smyrna_Live.mp4']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('bug fix 2: checkPrerequisites recognizes existing library.yaml and a matching transcript', () => {
  const tmp = makeTmpDir();
  try {
    fs.mkdirSync(path.join(tmp, 'libraries'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'libraries', 'library.yaml'), 'sequences: []\n');
    fs.mkdirSync(path.join(tmp, '03_Edit', 'Transcripts'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '03_Edit', 'Transcripts', 'Smyrna_Live.txt'), 'transcript...');
    const result = engine.checkPrerequisites(tmp, ['01_Footage/A-Roll/Cam_A/Smyrna_Live.mp4']);
    assert.equal(result.hasLibrary, true);
    assert.deepEqual(result.missingTranscriptsFor, []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('regression: checkPrerequisites with no files selected still flags missing transcripts when the folder is entirely empty (was a dead ternary that always returned [])', () => {
  const tmp = makeTmpDir();
  try {
    fs.mkdirSync(path.join(tmp, '03_Edit', 'Transcripts'), { recursive: true });
    const result = engine.checkPrerequisites(tmp, []);
    assert.ok(result.missingTranscriptsFor.length > 0, 'an entirely empty transcripts folder must be flagged even with no file explicitly selected');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('checkPrerequisites with no files selected reports nothing missing once at least one transcript exists', () => {
  const tmp = makeTmpDir();
  try {
    fs.mkdirSync(path.join(tmp, '03_Edit', 'Transcripts'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '03_Edit', 'Transcripts', 'Some_Service.txt'), 'transcript...');
    const result = engine.checkPrerequisites(tmp, []);
    assert.deepEqual(result.missingTranscriptsFor, []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('checkPrerequisites with a mixed selection only reports the files actually missing a transcript', () => {
  const tmp = makeTmpDir();
  try {
    fs.mkdirSync(path.join(tmp, '03_Edit', 'Transcripts'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '03_Edit', 'Transcripts', 'Riverdale_Live_720.txt'), 'transcript...');
    const result = engine.checkPrerequisites(tmp, [
      '01_Footage/A-Roll/Cam_A/Riverdale_Live_720.mp4',
      '01_Footage/A-Roll/Cam_A/Smyrna_Live__1030am_2160.mp4',
    ]);
    assert.deepEqual(result.missingTranscriptsFor, ['01_Footage/A-Roll/Cam_A/Smyrna_Live__1030am_2160.mp4']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('documents a known limitation: transcript-stem substring matching can false-positive on a shared prefix', () => {
  const tmp = makeTmpDir();
  try {
    fs.mkdirSync(path.join(tmp, '03_Edit', 'Transcripts'), { recursive: true });
    // "Smyrna_Live" is a substring of this differently-named transcript, so the
    // best-effort `.includes()` match (see the ASSUMPTION comment on checkPrerequisites)
    // treats it as satisfied even though it's arguably a different recording's transcript.
    fs.writeFileSync(path.join(tmp, '03_Edit', 'Transcripts', 'Smyrna_Live_BACKUP_DO_NOT_USE.txt'), 'transcript...');
    const result = engine.checkPrerequisites(tmp, ['01_Footage/A-Roll/Cam_A/Smyrna_Live.mp4']);
    assert.deepEqual(result.missingTranscriptsFor, [], 'documents the current (imperfect) substring-match behavior — tighten once Buttercut\'s real naming convention is known');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('regression: getStagesFromTemplate does not leak AUTO_CUT_TASK into a template with no multicam concept, even with mSyncActive stale-true', () => {
  const stages = engine.getStagesFromTemplate(realDirs(), 'BRoll_Selects_Workflow.md', true, false);
  assert.ok(!stages['Stage 3'].includes('Auto-cut to B-Cam for intimate/emotional moments (Transcript-based)'));
});

test('regression: frontmatter parses correctly even with a leading blank line before the --- fence', () => {
  const tmp = makeTmpDir();
  try {
    const workflowsDir = path.join(tmp, 'workflows');
    fs.mkdirSync(workflowsDir);
    fs.writeFileSync(
      path.join(workflowsDir, 'Leading_Blank.md'),
      '\n---\nStage 1:\n  - "Custom Task"\nStage 3:\n  - "Do the thing"\nStage 4:\n  - "Export"\n---\n\nBody content.\n',
    );
    const fm = engine.getTemplateFrontmatter({ effectiveDirs: [workflowsDir] }, 'Leading_Blank.md');
    assert.deepEqual(fm['Stage 1'], ['Custom Task'], 'should parse the actual template, not silently fall back to General_Workflow.md');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('getWorkflowFormState returns the same tags/stages/triggers as the individual getter functions', () => {
  const combined = engine.getWorkflowFormState(realDirs(), 'Sermon_Workflow.md', { multicamActive: true, brollActive: false });
  const tags = engine.getTemplateTags(realDirs(), 'Sermon_Workflow.md');
  const stages = engine.getStagesFromTemplate(realDirs(), 'Sermon_Workflow.md', true, false);
  const triggers = engine.getTriggersFromTemplate(realDirs(), 'Sermon_Workflow.md');
  assert.deepEqual(combined.tags, tags);
  assert.deepEqual(combined.stages, stages);
  assert.deepEqual(combined.triggers, triggers);
});

test('getWorkflowFormState tags do not follow the General_Workflow.md fallback (matches getTemplateTags\' no-fallback behavior)', () => {
  const combined = engine.getWorkflowFormState(realDirs(), 'Does_Not_Exist.md', {});
  assert.deepEqual(combined.tags, new Set());
  assert.ok(combined.stages['Stage 1'].length > 0, 'stages should still fall back to General_Workflow.md');
});

test('bug fix 2: resolvePrerequisites auto-prepends sync + transcribe only when Stage 3/4 is requested and prerequisites are missing', () => {
  const stages = engine.getStagesFromTemplate(realDirs(), 'Sermon_Workflow.md', false, false);
  const toPrepend = engine.resolvePrerequisites({
    activeTasks: ['Franken-bite & Remove Dead Space', 'Find 60-120s Social Clips (Pause for User Review)', 'Export Final XML to ./03_Edit/XML_Exports'],
    stages,
    hasLibrary: false,
    missingTranscriptsFor: ['01_Footage/A-Roll/Cam_A/Smyrna_Live.mp4'],
  });
  assert.deepEqual(toPrepend, [engine.MULTICAM_SYNC_TASK, engine.TRANSCRIBE_TASK]);
});

test('bug fix 2: resolvePrerequisites is a no-op when prerequisites already exist', () => {
  const stages = engine.getStagesFromTemplate(realDirs(), 'Sermon_Workflow.md', false, false);
  const toPrepend = engine.resolvePrerequisites({
    activeTasks: ['Franken-bite & Remove Dead Space'],
    stages,
    hasLibrary: true,
    missingTranscriptsFor: [],
  });
  assert.deepEqual(toPrepend, []);
});

test('bug fix 2: resolvePrerequisites never injects Multicam Sync for the B-Roll-only workflow', () => {
  const stages = engine.getStagesFromTemplate(realDirs(), 'BRoll_Selects_Workflow.md', false, true);
  const toPrepend = engine.resolvePrerequisites({
    activeTasks: stages['Stage 3'],
    stages,
    hasLibrary: false,
    missingTranscriptsFor: [],
  });
  assert.ok(!toPrepend.includes(engine.MULTICAM_SYNC_TASK));
});

test('verifyClaudeSettings writes recommended settings (default model/effort) then leaves them alone once correct', () => {
  const tmp = makeTmpDir();
  try {
    engine.verifyClaudeSettings(tmp);
    const written = JSON.parse(fs.readFileSync(path.join(tmp, '.claude', 'settings.json'), 'utf-8'));
    assert.equal(written.model, 'sonnet');
    assert.equal(written.effortLevel, 'xhigh');
    const mtimeBefore = fs.statSync(path.join(tmp, '.claude', 'settings.json')).mtimeMs;
    engine.verifyClaudeSettings(tmp);
    const mtimeAfter = fs.statSync(path.join(tmp, '.claude', 'settings.json')).mtimeMs;
    assert.equal(mtimeBefore, mtimeAfter, 'should not rewrite an already-correct settings.json');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('verifyClaudeSettings honors an explicit model/effort from settingsStore.claudeOptions', () => {
  const tmp = makeTmpDir();
  try {
    engine.verifyClaudeSettings(tmp, { model: 'opus', effort: 'low' });
    const written = JSON.parse(fs.readFileSync(path.join(tmp, '.claude', 'settings.json'), 'utf-8'));
    assert.equal(written.model, 'opus');
    assert.equal(written.effortLevel, 'low');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('buildClaudeSettingsJson omits model/effortLevel entirely when set to "default"', () => {
  const settings = engine.buildClaudeSettingsJson({ model: 'default', effort: 'default' });
  assert.equal('model' in settings, false);
  assert.equal('effortLevel' in settings, false);
  assert.ok(settings.permissions, 'permissions block should still be present');
});

test('scanMediaFiles finds media only under 01_Footage/02_Audio and skips .claude/.git', () => {
  const tmp = makeTmpDir();
  try {
    fs.mkdirSync(path.join(tmp, '01_Footage', 'A-Roll', 'Cam_A'), { recursive: true });
    fs.mkdirSync(path.join(tmp, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '01_Footage', 'A-Roll', 'Cam_A', 'sermon.mp4'), '');
    fs.writeFileSync(path.join(tmp, '01_Footage', 'A-Roll', 'Cam_A', 'notes.txt'), '');
    fs.writeFileSync(path.join(tmp, '.claude', 'fake.mp4'), '');
    const files = engine.scanMediaFiles(tmp);
    assert.deepEqual(files, [path.join('01_Footage', 'A-Roll', 'Cam_A', 'sermon.mp4')]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- Footage import (symlink-in-place, unlimited cameras) --------------------

test('slugifyCameraLabel makes a free-form camera name filesystem-safe and blocks path traversal', () => {
  // A redundant "Cam"/"Camera" the user typed themselves is stripped — the caller
  // always prefixes "Cam_" itself, so "Cam A" and "A" must both slug to "A".
  assert.equal(engine.slugifyCameraLabel('Cam A'), 'A');
  assert.equal(engine.slugifyCameraLabel('camera b'), 'b');
  assert.equal(engine.slugifyCameraLabel('A'), 'A');
  assert.equal(engine.slugifyCameraLabel('Cameron'), 'Cameron', 'a name that merely starts with "cam" must not be mis-stripped');
  assert.equal(engine.slugifyCameraLabel('  GoPro #3!  '), 'GoPro_3');
  assert.equal(engine.slugifyCameraLabel('../../etc/passwd'), 'etc_passwd');
  assert.equal(engine.slugifyCameraLabel('/'), 'Unnamed');
  assert.equal(engine.slugifyCameraLabel(''), 'Unnamed');
});

test('linkFootageIntoProject symlinks A-Roll footage into a Cam_<label> folder derived from a free-form camera name', () => {
  const tmp = makeTmpDir();
  const sourceDir = makeTmpDir();
  try {
    const source = path.join(sourceDir, 'clip001.mp4');
    fs.writeFileSync(source, 'fake video bytes');

    const { linked, skipped } = engine.linkFootageIntoProject(tmp, [{ sourcePath: source, category: 'A-Roll', cameraLabel: 'Cam A' }]);
    assert.equal(skipped.length, 0);
    assert.equal(linked.length, 1);
    // Display role is the normalized/canonical form, not the raw input — "Cam A" and
    // "A" land in the same Cam_A folder and must report back the same label.
    assert.equal(linked[0].role, 'A-Roll: A');
    const linkPath = linked[0].linkPath;
    assert.equal(linkPath, path.join(tmp, '01_Footage', 'A-Roll', 'Cam_A', 'clip001.mp4'));
    assert.ok(fs.lstatSync(linkPath).isSymbolicLink(), 'target should be a symlink, not a real copy');
    assert.equal(fs.readlinkSync(linkPath), source);
    // The source file itself must be untouched — same content, same location.
    assert.equal(fs.readFileSync(source, 'utf-8'), 'fake video bytes');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(sourceDir, { recursive: true, force: true });
  }
});

test('linkFootageIntoProject supports an unbounded number of distinct camera angles, each getting its own folder', () => {
  const tmp = makeTmpDir();
  const sourceDir = makeTmpDir();
  try {
    const cameraNames = ['Cam A', 'Cam B', 'Cam C', 'Wide', 'GoPro Chest', 'Drone Cam'];
    const assignments = cameraNames.map((name, i) => {
      const source = path.join(sourceDir, `clip-${i}.mp4`);
      fs.writeFileSync(source, String(i));
      return { sourcePath: source, category: 'A-Roll', cameraLabel: name };
    });
    const { linked, skipped } = engine.linkFootageIntoProject(tmp, assignments);
    assert.equal(skipped.length, 0);
    assert.equal(linked.length, cameraNames.length);
    const camDirs = fs.readdirSync(path.join(tmp, '01_Footage', 'A-Roll')).sort();
    assert.deepEqual(camDirs, ['Cam_A', 'Cam_B', 'Cam_C', 'Cam_Drone_Cam', 'Cam_GoPro_Chest', 'Cam_Wide'].sort());
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(sourceDir, { recursive: true, force: true });
  }
});

test('linkFootageIntoProject requires a camera name for A-Roll and skips with a reason when missing', () => {
  const tmp = makeTmpDir();
  const sourceDir = makeTmpDir();
  try {
    const source = path.join(sourceDir, 'clip.mp4');
    fs.writeFileSync(source, 'x');
    const { linked, skipped } = engine.linkFootageIntoProject(tmp, [{ sourcePath: source, category: 'A-Roll', cameraLabel: '  ' }]);
    assert.equal(linked.length, 0);
    assert.equal(skipped.length, 1);
    assert.match(skipped[0].reason, /needs a camera name/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(sourceDir, { recursive: true, force: true });
  }
});

test('linkFootageIntoProject links non-A-Roll categories (B-Roll/audio) without needing a camera name', () => {
  const tmp = makeTmpDir();
  const sourceDir = makeTmpDir();
  try {
    const source = path.join(sourceDir, 'drone-shot.mp4');
    fs.writeFileSync(source, 'x');
    const { linked, skipped } = engine.linkFootageIntoProject(tmp, [{ sourcePath: source, category: 'B-Roll Drone' }]);
    assert.equal(skipped.length, 0);
    assert.equal(linked[0].role, 'B-Roll Drone');
    assert.equal(linked[0].linkPath, path.join(tmp, '01_Footage', 'B-Roll', 'Drone', 'drone-shot.mp4'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(sourceDir, { recursive: true, force: true });
  }
});

test('linkFootageIntoProject is idempotent for the same source re-linked to the same camera', () => {
  const tmp = makeTmpDir();
  const sourceDir = makeTmpDir();
  try {
    const source = path.join(sourceDir, 'clip001.mp4');
    fs.writeFileSync(source, 'x');
    engine.linkFootageIntoProject(tmp, [{ sourcePath: source, category: 'A-Roll', cameraLabel: 'Cam A' }]);
    const { linked } = engine.linkFootageIntoProject(tmp, [{ sourcePath: source, category: 'A-Roll', cameraLabel: 'Cam A' }]);
    assert.equal(linked.length, 1);
    const entries = fs.readdirSync(path.join(tmp, '01_Footage', 'A-Roll', 'Cam_A'));
    assert.deepEqual(entries, ['clip001.mp4'], 're-linking the same source must not create a duplicate/renamed link');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(sourceDir, { recursive: true, force: true });
  }
});

test('linkFootageIntoProject resolves a basename collision between two different sources on the same camera by suffixing', () => {
  const tmp = makeTmpDir();
  const sourceDirA = makeTmpDir();
  const sourceDirB = makeTmpDir();
  try {
    const sourceA = path.join(sourceDirA, 'clip001.mp4');
    const sourceB = path.join(sourceDirB, 'clip001.mp4');
    fs.writeFileSync(sourceA, 'a');
    fs.writeFileSync(sourceB, 'b');
    engine.linkFootageIntoProject(tmp, [{ sourcePath: sourceA, category: 'A-Roll', cameraLabel: 'Cam A' }]);
    const { linked } = engine.linkFootageIntoProject(tmp, [{ sourcePath: sourceB, category: 'A-Roll', cameraLabel: 'Cam A' }]);
    assert.equal(linked[0].linkPath, path.join(tmp, '01_Footage', 'A-Roll', 'Cam_A', 'clip001-2.mp4'));
    assert.equal(fs.readlinkSync(linked[0].linkPath), sourceB);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(sourceDirA, { recursive: true, force: true });
    fs.rmSync(sourceDirB, { recursive: true, force: true });
  }
});

test('linkFootageIntoProject skips an unknown category and a missing source file with reasons', () => {
  const tmp = makeTmpDir();
  try {
    const { linked, skipped } = engine.linkFootageIntoProject(tmp, [
      { sourcePath: '/nonexistent/clip.mp4', category: 'A-Roll', cameraLabel: 'Cam A' },
      { sourcePath: '/nonexistent/clip2.mp4', category: 'Not A Real Category' },
    ]);
    assert.equal(linked.length, 0);
    assert.equal(skipped.length, 2);
    assert.match(skipped[0].reason, /no longer exists/);
    assert.match(skipped[1].reason, /Unknown category/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('listCameraLabels discovers however many camera folders actually exist, in a human-readable form', () => {
  const tmp = makeTmpDir();
  const sourceDir = makeTmpDir();
  try {
    for (const name of ['Cam A', 'Cam B', 'GoPro Chest']) {
      const source = path.join(sourceDir, `${name}.mp4`);
      fs.writeFileSync(source, 'x');
      engine.linkFootageIntoProject(tmp, [{ sourcePath: source, category: 'A-Roll', cameraLabel: name }]);
    }
    // "Cam A"/"Cam B" normalize to "A"/"B" (redundant "Cam" prefix stripped); "GoPro Chest" has none to strip.
    assert.deepEqual(engine.listCameraLabels(tmp).sort(), ['A', 'B', 'GoPro Chest'].sort());
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(sourceDir, { recursive: true, force: true });
  }
});

test('listLinkedFootage reports a friendly role, link path, and resolved source for linked footage; scanMediaFiles also finds it', () => {
  const tmp = makeTmpDir();
  const sourceDir = makeTmpDir();
  try {
    const source = path.join(sourceDir, 'sermon.mp4');
    fs.writeFileSync(source, 'x');
    engine.linkFootageIntoProject(tmp, [{ sourcePath: source, category: 'A-Roll', cameraLabel: 'Cam A' }]);

    const items = engine.listLinkedFootage(tmp);
    assert.equal(items.length, 1);
    assert.equal(items[0].role, 'A-Roll: A');
    assert.equal(items[0].sourcePath, source);

    // The existing media scanner (used to populate Target Files) must see the
    // symlink like any other file under 01_Footage.
    const scanned = engine.scanMediaFiles(tmp);
    assert.deepEqual(scanned, [path.join('01_Footage', 'A-Roll', 'Cam_A', 'sermon.mp4')]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(sourceDir, { recursive: true, force: true });
  }
});

test('unlinkFootage removes the symlink but refuses to touch a real file', () => {
  const tmp = makeTmpDir();
  const sourceDir = makeTmpDir();
  try {
    const source = path.join(sourceDir, 'clip.mp4');
    fs.writeFileSync(source, 'x');
    const { linked } = engine.linkFootageIntoProject(tmp, [{ sourcePath: source, category: 'A-Roll', cameraLabel: 'Cam A' }]);
    engine.unlinkFootage(linked[0].linkPath);
    assert.equal(fs.existsSync(linked[0].linkPath), false);
    assert.ok(fs.existsSync(source), 'unlinking must never delete the original source file');

    const realFile = path.join(tmp, '01_Footage', 'A-Roll', 'Cam_A', 'not-a-symlink.mp4');
    fs.writeFileSync(realFile, 'real content');
    assert.throws(() => engine.unlinkFootage(realFile));
    assert.ok(fs.existsSync(realFile), 'a real file must survive a rejected unlink attempt');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(sourceDir, { recursive: true, force: true });
  }
});

test('getFileLabels returns an empty object for a project with no labels yet, and setFileLabel persists/clears notes', () => {
  const tmp = makeTmpDir();
  try {
    assert.deepEqual(engine.getFileLabels(tmp), {});

    engine.setFileLabel(tmp, '01_Footage/A-Roll/Cam_A/GH010045.MP4', 'Wide crowd shot, song 1');
    engine.setFileLabel(tmp, '01_Footage/A-Roll/Cam_B/C0012.MP4', '  Close-up pastor  '); // untrimmed on purpose
    assert.deepEqual(engine.getFileLabels(tmp), {
      '01_Footage/A-Roll/Cam_A/GH010045.MP4': 'Wide crowd shot, song 1',
      '01_Footage/A-Roll/Cam_B/C0012.MP4': 'Close-up pastor',
    });

    // Persisted to disk inside the project itself (travels with the folder), not the
    // app's global registry.
    assert.ok(fs.existsSync(path.join(tmp, '.claude', 'file_labels.json')));

    // Clearing (empty/whitespace-only) removes the key entirely rather than storing a blank.
    engine.setFileLabel(tmp, '01_Footage/A-Roll/Cam_A/GH010045.MP4', '   ');
    assert.deepEqual(engine.getFileLabels(tmp), { '01_Footage/A-Roll/Cam_B/C0012.MP4': 'Close-up pastor' });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('scanLooseFiles finds media dumped loose in the project root and in an ad-hoc subfolder, but ignores anything already under the standard scaffold', () => {
  const tmp = makeTmpDir();
  try {
    fs.mkdirSync(path.join(tmp, '01_Footage', 'A-Roll', 'Cam_A'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '01_Footage', 'A-Roll', 'Cam_A', 'already-sorted.mp4'), 'x');
    fs.writeFileSync(path.join(tmp, 'loose-root-clip.mp4'), 'x');
    fs.mkdirSync(path.join(tmp, 'SD_Card_1'));
    fs.writeFileSync(path.join(tmp, 'SD_Card_1', 'gh010045.mp4'), 'x');
    fs.writeFileSync(path.join(tmp, 'notes.txt'), 'not media');
    fs.mkdirSync(path.join(tmp, '.git'));
    fs.writeFileSync(path.join(tmp, '.git', 'ignored.mp4'), 'x');

    const found = engine.scanLooseFiles(tmp).sort();
    assert.deepEqual(found, [
      path.join(tmp, 'SD_Card_1', 'gh010045.mp4'),
      path.join(tmp, 'loose-root-clip.mp4'),
    ].sort());
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('linkFootageIntoProject moves (not symlinks) a source that already lives inside the project, leaving nothing behind at its old location', () => {
  const tmp = makeTmpDir();
  try {
    const loosePath = path.join(tmp, 'loose-clip.mp4');
    fs.writeFileSync(loosePath, 'real bytes');

    const { linked, skipped } = engine.linkFootageIntoProject(tmp, [
      { sourcePath: loosePath, category: 'A-Roll', cameraLabel: 'Main' },
    ]);
    assert.equal(skipped.length, 0);
    const linkPath = linked[0].linkPath;
    assert.equal(linkPath, path.join(tmp, '01_Footage', 'A-Roll', 'Cam_Main', 'loose-clip.mp4'));
    assert.ok(!fs.lstatSync(linkPath).isSymbolicLink(), 'an in-project source should be moved, not symlinked');
    assert.equal(fs.readFileSync(linkPath, 'utf-8'), 'real bytes');
    assert.equal(fs.existsSync(loosePath), false, 'the file must no longer exist at its old loose location');

    const items = engine.listLinkedFootage(tmp);
    assert.equal(items.length, 1);
    assert.equal(items[0].isSymlink, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('linkFootageIntoProject still symlinks a source from outside the project even when a loose in-project file is linked in the same call', () => {
  const tmp = makeTmpDir();
  const sourceDir = makeTmpDir();
  try {
    const loosePath = path.join(tmp, 'loose-clip.mp4');
    fs.writeFileSync(loosePath, 'x');
    const externalPath = path.join(sourceDir, 'external-clip.mp4');
    fs.writeFileSync(externalPath, 'y');

    const { linked } = engine.linkFootageIntoProject(tmp, [
      { sourcePath: loosePath, category: 'A-Roll', cameraLabel: 'Main' },
      { sourcePath: externalPath, category: 'A-Roll', cameraLabel: 'Slash' },
    ]);
    const moved = linked.find((l) => l.linkPath.includes('Cam_Main'));
    const symlinked = linked.find((l) => l.linkPath.includes('Cam_Slash'));
    assert.ok(!fs.lstatSync(moved.linkPath).isSymbolicLink());
    assert.ok(fs.lstatSync(symlinked.linkPath).isSymbolicLink());
    assert.equal(fs.readlinkSync(symlinked.linkPath), externalPath);
    assert.ok(fs.existsSync(externalPath), 'external source must be untouched');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(sourceDir, { recursive: true, force: true });
  }
});
