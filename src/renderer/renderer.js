// @ts-check
'use strict';

/** @type {any} */
const lp5000Api = window.api;

const state = {
  activeProject: null,
  workflowOptions: [],
  tags: /** @type {string[] | null} */ ([]),
  stages: { 'Stage 1': [], 'Stage 2': [], 'Stage 3': [], 'Stage 4': [] },
  triggers: /** @type {string[]} */ ([]),
  checkedTasks: /** @type {Record<string, boolean>} */ ({}),
  dynamicVars: /** @type {Record<string, string>} */ ({}),
  customProjName: '',
  scannedFiles: /** @type {string[]} */ ([]),
  selectedFiles: /** @type {Set<string>} */ (new Set()),
  settings: null,
  footageCategories: /** @type {string[]} */ ([]),
  footageStaging: /** @type {{sourcePath: string, category: string, cameraLabel: string}[]} */ ([]),
  footageLinkedItems: /** @type {any[]} */ ([]),
  footageExtras: /** @type {string[]} */ ([]),
  promptTemplates: /** @type {{id: string, name: string, text: string}[]} */ ([]),
};

const el = (id) => document.getElementById(id);

function showBanner(message, type = 'info') {
  const banner = el('banner');
  banner.textContent = message;
  banner.className = `banner ${type}`;
}
function hideBanner() {
  el('banner').className = 'banner hidden';
}

// --- Recent Projects ----------------------------------------------------

// Status refresh is per-project bounded (2s timeout, see projectStore.js) but a
// registry that grows over months could still queue up a lot of network-drive
// checks at once — only eagerly refresh the projects actually visible without
// scrolling; older entries just show their last-cached status until opened.
const EAGER_STATUS_REFRESH_LIMIT = 8;

async function loadRecentProjects() {
  const res = await lp5000Api.projectStore.listProjects();
  const projects = res.projects || [];
  renderRecentProjects(projects);
  for (const p of projects.slice(0, EAGER_STATUS_REFRESH_LIMIT)) {
    lp5000Api.projectStore.refreshProjectStatus(p.id).then((r) => {
      if (r.ok) updateProjectStatusBadge(p.id, r.status);
    });
  }
  return projects;
}

function statusBadgeText(cachedStatus) {
  if (!cachedStatus) return '—';
  if (cachedStatus.reachable === false) return 'unreachable';
  const sync = cachedStatus.hasLibraryYaml ? '✓ synced' : '— not synced';
  return `${sync} · ${cachedStatus.transcriptsCount} transcript(s)`;
}

function renderRecentProjects(projects) {
  const list = el('recentProjects');
  list.innerHTML = '';
  for (const p of projects) {
    const li = document.createElement('li');
    li.dataset.id = p.id;
    if (state.activeProject && state.activeProject.id === p.id) li.classList.add('active');
    li.innerHTML = `
      <span class="label">${escapeHtml(p.label)}</span>
      <span class="meta">${escapeHtml(p.path)}</span>
      <span class="status" data-status-for="${p.id}">${statusBadgeText(p.cachedStatus)}</span>
      <span class="project-actions">
        <button type="button" data-action="reveal" title="Reveal in Finder/Explorer">📁</button>
        <button type="button" data-action="rename" title="Rename">✏️</button>
        <button type="button" data-action="remove" title="Remove from list (does not delete anything on disk)">✕</button>
      </span>
    `;
    li.addEventListener('click', () => selectProject(p.id));
    li.querySelector('[data-action="reveal"]').addEventListener('click', (e) => {
      e.stopPropagation();
      lp5000Api.projectStore.revealInFileManager(p.id);
    });
    li.querySelector('[data-action="rename"]').addEventListener('click', (e) => {
      e.stopPropagation();
      startRenameEdit(li, p);
    });
    li.querySelector('[data-action="remove"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      const proceed = window.confirm(`Remove "${p.label}" from Recent Projects? This only forgets it here — nothing on disk is touched.`);
      if (!proceed) return;
      await lp5000Api.projectStore.removeProject(p.id);
      if (state.activeProject && state.activeProject.id === p.id) {
        state.activeProject = null;
        el('workspace').classList.add('hidden');
        el('emptyState').classList.remove('hidden');
        el('attachedTo').textContent = 'No project open';
      }
      loadRecentProjects();
    });
    list.appendChild(li);
  }
}

// Electron's sandboxed renderer does not implement window.prompt() at all (it throws
// "prompt() is not supported", unlike alert()/confirm() which do work) — so renaming
// swaps the label span for a plain inline <input> instead of using a prompt dialog.
function startRenameEdit(li, p) {
  const labelSpan = li.querySelector('.label');
  const input = document.createElement('input');
  input.type = 'text';
  input.value = p.label;
  labelSpan.replaceWith(input);
  input.focus();
  input.select();

  let settled = false;
  const commit = async () => {
    if (settled) return;
    settled = true;
    const trimmed = input.value.trim();
    if (!trimmed || trimmed === p.label) { loadRecentProjects(); return; }
    const res = await lp5000Api.projectStore.renameProjectLabel(p.id, trimmed);
    if (!res.ok) { showBanner(`Could not rename: ${res.error}`, 'error'); loadRecentProjects(); return; }
    if (state.activeProject && state.activeProject.id === p.id) {
      state.activeProject.label = trimmed;
      el('attachedTo').textContent = `📍 ATTACHED TO: ${state.activeProject.label}`;
    }
    loadRecentProjects();
  };
  const cancel = () => { settled = true; loadRecentProjects(); };

  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
  input.addEventListener('blur', commit);
}

function updateProjectStatusBadge(id, status) {
  const badge = document.querySelector(`[data-status-for="${id}"]`);
  if (badge) badge.textContent = statusBadgeText(status);
}

// The textContent round-trip alone only neutralizes &/</>; several call sites splice
// this into a double-quoted HTML attribute (e.g. value="${escapeHtml(...)}"), so quote
// characters need explicit escaping too or a value containing `"` breaks out of the attribute.
function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// --- Opening / selecting a project ---------------------------------------

async function openProjectFolder() {
  const dialogRes = await lp5000Api.projectStore.openProjectDialog();
  if (!dialogRes.ok || dialogRes.canceled) return;
  const { path, isKnown, knownProjectId, isEmpty, structureValid, missingFolders, looksUnrelated } = dialogRes;

  if (isKnown) {
    await selectProject(knownProjectId);
    return;
  }
  if (looksUnrelated) {
    const proceed = window.confirm(
      `"${path}" doesn't look like a Buttercut project folder (none of the expected folders were found). Create the structure here anyway? Existing files won't be touched.`,
    );
    if (!proceed) return;
  } else if (!structureValid && !isEmpty) {
    const proceed = window.confirm(`Missing folders: ${missingFolders.join(', ')}. Create them now?`);
    if (!proceed) return;
  }
  const commitRes = await lp5000Api.projectStore.commitProject(path, { scaffoldMissing: true });
  if (!commitRes.ok) { showBanner(`Could not open project: ${commitRes.error}`, 'error'); return; }
  await loadRecentProjects();
  await selectProject(commitRes.project.id);
}

async function selectProject(id) {
  const res = await lp5000Api.projectStore.setActiveProject(id);
  if (!res.ok) { showBanner(`Could not open project: ${res.error}`, 'error'); return; }
  state.activeProject = res.project;
  hideBanner();

  el('attachedTo').textContent = `📍 ATTACHED TO: ${state.activeProject.label}`;
  el('workspace').classList.remove('hidden');
  el('emptyState').classList.add('hidden');
  document.querySelectorAll('#recentProjects li').forEach((li) => {
    li.classList.toggle('active', li.dataset.id === id);
  });

  const last = state.activeProject.lastSettings || {};
  state.dynamicVars = { ...(last.dynamicTagValues || {}) };
  state.customProjName = last.customProjectName || '';
  state.checkedTasks = { ...(last.checkedTasks || {}) };
  el('promptBox').value = last.projectPrompt || '';
  el('promptTemplateSelect').value = '';
  el('newTemplateNameInput').value = '';

  if (!state.settings) state.settings = (await lp5000Api.settingsStore.getSettings()).settings;
  el('vibeSelect').value = last.vibe || state.settings.defaultVibe;
  el('pacingSelect').value = last.pacing || state.settings.defaultPacing;

  await loadWorkflowOptions(last.workflowTemplate);
  await loadFootageCategories();
  await refreshFootageList();
  await stageLooseFiles();
  renderFootageStaging();
  await refreshMasterAudioOptions(last.masterAudioSource);
  await refreshFormState();
}

// --- Workflow template + dynamic form state -------------------------------

async function loadWorkflowOptions(preferredTemplate) {
  const res = await lp5000Api.workflows.listOptions();
  if (!res.ok) { showBanner(`Could not load workflows: ${res.error}`, 'error'); return; }
  state.workflowOptions = res.options;
  const select = el('templateSelect');
  select.innerHTML = state.workflowOptions.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
  if (preferredTemplate && state.workflowOptions.includes(preferredTemplate)) {
    select.value = preferredTemplate;
  }
}

async function refreshFormState() {
  const templateName = el('templateSelect').value;
  const multicamActive = Boolean(state.checkedTasks['Multicam - Sync & stack all A-Roll angles + Master Audio']);
  const brollActive = Boolean(state.checkedTasks['Use B-Roll Footage']);
  const res = await lp5000Api.workflows.getFormState(templateName, { multicamActive, brollActive });
  if (!res.ok) { showBanner(`Could not load workflow form: ${res.error}`, 'error'); return; }

  state.tags = res.tags;
  state.stages = res.stages;
  state.triggers = res.triggers;

  renderDynamicFields();
  renderStageTasks('stage1Tasks', 'Stage 1');
  renderStageTasks('stage2Tasks', 'Stage 2');
  renderStageTasks('stage3Tasks', 'Stage 3');
  renderStageTasks('stage4Tasks', 'Stage 4');
}

function renderDynamicFields() {
  const container = el('dynamicFields');
  container.innerHTML = '';
  if (state.tags === null) {
    const label = document.createElement('label');
    label.innerHTML = `Project Name <input type="text" id="customProjNameInput" value="${escapeHtml(state.customProjName)}" />`;
    container.appendChild(label);
    el('customProjNameInput').addEventListener('input', (e) => { state.customProjName = e.target.value; });
    return;
  }
  for (const tag of state.tags) {
    // Every currently-displayed tag gets an entry (even '') so an untouched
    // field still substitutes cleanly instead of leaving a literal {{tag}}.
    if (!(tag in state.dynamicVars)) state.dynamicVars[tag] = '';
    const label = document.createElement('label');
    label.innerHTML = `${escapeHtml(tag)} <input type="text" data-tag="${escapeHtml(tag)}" value="${escapeHtml(state.dynamicVars[tag])}" />`;
    container.appendChild(label);
    label.querySelector('input').addEventListener('input', (e) => { state.dynamicVars[tag] = e.target.value; });
  }
}

function renderStageTasks(containerId, stageKey) {
  const container = el(containerId);
  container.innerHTML = '';
  for (const task of state.stages[stageKey] || []) {
    const li = document.createElement('li');
    const checked = Boolean(state.checkedTasks[task]);
    li.innerHTML = `<label><input type="checkbox" ${checked ? 'checked' : ''} /> ${escapeHtml(task)}</label>`;
    const checkbox = li.querySelector('input');
    checkbox.addEventListener('change', () => {
      state.checkedTasks[task] = checkbox.checked;
      if (state.triggers.includes(task)) refreshFormState();
    });
    container.appendChild(li);
  }
}

// --- Footage import (browse in-app, symlink into place — no copy/move) -----
// A-Roll cameras are unbounded: the user types any camera name (not limited to a
// fixed A/B/C/D), and engine.js's linkFootageIntoProject creates a Cam_<label>
// folder for it on demand. Every other category is fixed (B-Roll Gimbal/Drone,
// Ext Audio, Music).

function baseNameOf(p) {
  return p.split(/[\\/]/).pop();
}

async function loadFootageCategories() {
  if (state.footageCategories.length > 0) return;
  const res = await lp5000Api.footage.listCategories();
  if (res.ok) state.footageCategories = res.categories;
}

async function loadCameraLabelsForDatalist() {
  const res = await lp5000Api.footage.listCameraLabels(state.activeProject.path);
  const labels = res.ok ? res.labels : [];
  el('cameraLabelsList').innerHTML = labels.map((l) => `<option value="${escapeHtml(l)}"></option>`).join('');
  return labels;
}

function categoryOptionsHtml(selected) {
  return state.footageCategories
    .map((c) => `<option value="${escapeHtml(c)}" ${c === selected ? 'selected' : ''}>${escapeHtml(c)}</option>`)
    .join('');
}

function guessCategoryForLooseFile(sourcePath) {
  const ext = sourcePath.split('.').pop().toLowerCase();
  return ['wav', 'mp3'].includes(ext) ? 'Ext Audio' : 'A-Roll';
}

// Files already sitting loose in the project folder (e.g. dragged in via Finder before
// switching to this app) are only ever flagged, never moved automatically — staged here
// so the user reviews/assigns a category (and camera, for A-Roll) and explicitly clicks
// Link, same as footage browsed in from an external card/drive.
async function stageLooseFiles() {
  state.footageStaging = [];
  const res = await lp5000Api.footage.scanLoose(state.activeProject.path);
  if (!res.ok || res.files.length === 0) return;
  for (const sourcePath of res.files) {
    state.footageStaging.push({ sourcePath, category: guessCategoryForLooseFile(sourcePath), cameraLabel: '' });
  }
  showBanner(
    `Found ${res.files.length} unsorted file(s) already in this project folder — assign a category (and camera, for A-Roll) below, then Link into Project to move them into place.`,
    'info',
  );
}

async function addFootageFiles() {
  await loadFootageCategories();
  const res = await lp5000Api.footage.pickFiles();
  if (!res.ok || res.canceled) return;
  const existing = new Set(state.footageStaging.map((s) => s.sourcePath));
  for (const sourcePath of res.files) {
    if (existing.has(sourcePath)) continue;
    state.footageStaging.push({ sourcePath, category: state.footageCategories[0] || '', cameraLabel: '' });
  }
  renderFootageStaging();
}

function renderFootageStaging() {
  const container = el('footageStaging');
  container.innerHTML = '';
  el('footageStagingActions').classList.toggle('hidden', state.footageStaging.length === 0);
  if (state.footageStaging.length > 0) {
    el('bulkCategorySelect').innerHTML = categoryOptionsHtml(el('bulkCategorySelect').value || state.footageCategories[0]);
  }
  for (const item of state.footageStaging) {
    const li = document.createElement('li');
    li.innerHTML = `
      <label>${escapeHtml(baseNameOf(item.sourcePath))}
        <select data-role="category">${categoryOptionsHtml(item.category)}</select>
      </label>
      <input data-role="cameraLabel" type="text" list="cameraLabelsList" placeholder="Camera name" value="${escapeHtml(item.cameraLabel)}" />
      <button data-action="remove" class="ghost-btn">✕</button>
    `;
    const cameraInput = li.querySelector('[data-role="cameraLabel"]');
    cameraInput.classList.toggle('hidden', item.category !== 'A-Roll');
    li.querySelector('[data-role="category"]').addEventListener('change', (e) => {
      item.category = e.target.value;
      cameraInput.classList.toggle('hidden', item.category !== 'A-Roll');
    });
    cameraInput.addEventListener('input', (e) => { item.cameraLabel = e.target.value; });
    li.querySelector('[data-action="remove"]').addEventListener('click', () => {
      state.footageStaging = state.footageStaging.filter((s) => s !== item);
      renderFootageStaging();
    });
    container.appendChild(li);
  }
}

function applyBulkRole() {
  const category = el('bulkCategorySelect').value;
  const cameraLabel = el('bulkCameraLabelInput').value;
  for (const item of state.footageStaging) {
    item.category = category;
    item.cameraLabel = cameraLabel;
  }
  renderFootageStaging();
}

async function linkFootage() {
  if (!state.activeProject || state.footageStaging.length === 0) return;
  el('linkFootageBtn').disabled = true;
  try {
    const res = await lp5000Api.footage.link(state.activeProject.path, state.footageStaging);
    if (!res.ok) { showBanner(`Could not link footage: ${res.error}`, 'error'); return; }
    const { linked, skipped } = res;
    state.footageStaging = [];
    renderFootageStaging();
    await refreshFootageList();
    await refreshMasterAudioOptions();
    const note = skipped.length > 0 ? ` ${skipped.length} skipped: ${skipped.map((s) => s.reason).join('; ')}` : '';
    showBanner(`Linked ${linked.length} file(s) into the project.${note}`, skipped.length > 0 ? 'error' : 'success');
  } finally {
    el('linkFootageBtn').disabled = false;
  }
}

// Merges two views of the same underlying files into one list: footage.list's
// structured, role-labeled view (organized via Import Footage, with Unlink support)
// plus media.scan's permissive recursive view — a fallback so anything sitting under
// 01_Footage/02_Audio in a layout Import Footage doesn't recognize (e.g. a legacy
// project folder predating this app) still shows up as selectable, just without an
// Unlink button since there's no structured role to unlink it from.
async function refreshFootageList() {
  const [footageRes, scanRes] = await Promise.all([
    lp5000Api.footage.list(state.activeProject.path),
    lp5000Api.media.scan(state.activeProject.path),
  ]);
  if (!footageRes.ok) { showBanner(`Could not list linked footage: ${footageRes.error}`, 'error'); return; }
  if (!scanRes.ok) { showBanner(`Could not scan media files: ${scanRes.error}`, 'error'); return; }

  const linkedItems = footageRes.items;
  const linkedRelPaths = new Set(linkedItems.map((item) => item.relativePath));
  const extras = scanRes.files.filter((f) => !linkedRelPaths.has(f));

  state.footageLinkedItems = linkedItems;
  state.footageExtras = extras;
  state.scannedFiles = [...linkedItems.map((i) => i.relativePath), ...extras];
  state.selectedFiles = new Set(state.scannedFiles); // default: everything on disk, explicitly named

  renderFootageList();
}

function renderFootageList() {
  const container = el('linkedFootageList');
  container.innerHTML = '';
  if (state.footageLinkedItems.length === 0 && state.footageExtras.length === 0) {
    container.innerHTML = '<li class="muted">Nothing linked yet.</li>';
    return;
  }
  for (const item of state.footageLinkedItems) {
    const li = document.createElement('li');
    let target;
    if (!item.isSymlink) target = '(moved into project)';
    else if (item.sourcePath) target = `→ ${escapeHtml(item.sourcePath)}`;
    else target = '(broken link)';
    li.innerHTML = `
      <label><input type="checkbox" ${state.selectedFiles.has(item.relativePath) ? 'checked' : ''} />
        ${escapeHtml(item.role)}: ${escapeHtml(baseNameOf(item.linkPath))} ${target}</label>
      <button data-action="unlink" class="ghost-btn">Unlink</button>
    `;
    li.querySelector('input').addEventListener('change', (e) => {
      if (e.target.checked) state.selectedFiles.add(item.relativePath);
      else state.selectedFiles.delete(item.relativePath);
    });
    li.querySelector('[data-action="unlink"]').addEventListener('click', async () => {
      const r = await lp5000Api.footage.unlink(item.linkPath);
      if (!r.ok) { showBanner(`Could not unlink: ${r.error}`, 'error'); return; }
      await refreshFootageList();
      await refreshMasterAudioOptions();
    });
    container.appendChild(li);
  }
  for (const relPath of state.footageExtras) {
    const li = document.createElement('li');
    li.innerHTML = `<label><input type="checkbox" ${state.selectedFiles.has(relPath) ? 'checked' : ''} /> ${escapeHtml(relPath)}</label>`;
    li.querySelector('input').addEventListener('change', (e) => {
      if (e.target.checked) state.selectedFiles.add(relPath);
      else state.selectedFiles.delete(relPath);
    });
    container.appendChild(li);
  }
}

function toggleAllFootageSelection() {
  const allSelected = state.selectedFiles.size === state.scannedFiles.length;
  state.selectedFiles = allSelected ? new Set() : new Set(state.scannedFiles);
  renderFootageList();
}

// --- Master Audio Source: dynamic camera list, not a fixed A-D ---------------

// Must exactly match engine.js's INDEPENDENT_JOBS_MASTER_AUDIO — main/renderer can't
// share a module, so this sentinel is duplicated here the same way MULTICAM_SYNC_TASK
// is above. Picking it tells buildClaudeMd these are unrelated single-camera sources
// (e.g. separate sermons from different campuses) to run as independent jobs, each
// using its own on-camera audio, rather than one shared master audio for a multicam sync.
const INDEPENDENT_JOBS_MASTER_AUDIO = "Each Camera's Own Audio (independent per-file jobs, not multicam)";

async function refreshMasterAudioOptions(preferredValue) {
  const select = el('masterAudioSelect');
  const toKeep = preferredValue !== undefined ? preferredValue : select.value;
  const labels = await loadCameraLabelsForDatalist();
  const options = [
    ...labels.map((l) => `A-Roll (${l})`),
    'Ext_Audio Folder',
    'B-Roll (Nat Sound)',
    INDEPENDENT_JOBS_MASTER_AUDIO,
  ];
  select.innerHTML = options.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
  if (toKeep && options.includes(toKeep)) select.value = toKeep;
}

// --- Prompt templates (reusable Prompt box text, global across projects) ---

async function loadPromptTemplatesForDropdown() {
  const res = await lp5000Api.settingsStore.listPromptTemplates();
  state.promptTemplates = res.ok ? res.templates : [];
  const select = el('promptTemplateSelect');
  const toKeep = select.value;
  select.innerHTML = '<option value="">— Saved prompts —</option>'
    + state.promptTemplates.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join('');
  if (toKeep && state.promptTemplates.some((t) => t.id === toKeep)) select.value = toKeep;
}

function loadSelectedPromptTemplate() {
  const id = el('promptTemplateSelect').value;
  if (!id) { showBanner('Select a saved prompt to load first.', 'error'); return; }
  const template = state.promptTemplates.find((t) => t.id === id);
  if (!template) return;
  el('promptBox').value = template.text;
  el('newTemplateNameInput').value = template.name;
}

async function saveAsNewPromptTemplate() {
  const name = el('newTemplateNameInput').value.trim();
  if (!name) { showBanner('Type a name for the new prompt template first.', 'error'); return; }
  const res = await lp5000Api.settingsStore.savePromptTemplate({ name, text: el('promptBox').value });
  if (!res.ok) { showBanner(`Could not save template: ${res.error}`, 'error'); return; }
  await loadPromptTemplatesForDropdown();
  const saved = res.templates.find((t) => t.name === name);
  if (saved) el('promptTemplateSelect').value = saved.id;
  showBanner(`Saved prompt template "${name}".`, 'success');
}

async function updateSelectedPromptTemplate() {
  const id = el('promptTemplateSelect').value;
  if (!id) { showBanner('Select a saved prompt to update first.', 'error'); return; }
  const existing = state.promptTemplates.find((t) => t.id === id);
  const name = el('newTemplateNameInput').value.trim() || existing?.name;
  const res = await lp5000Api.settingsStore.savePromptTemplate({ id, name, text: el('promptBox').value });
  if (!res.ok) { showBanner(`Could not update template: ${res.error}`, 'error'); return; }
  await loadPromptTemplatesForDropdown();
  el('promptTemplateSelect').value = id;
  showBanner(`Updated prompt template "${name}".`, 'success');
}

async function deleteSelectedPromptTemplate() {
  const id = el('promptTemplateSelect').value;
  if (!id) { showBanner('Select a saved prompt to delete first.', 'error'); return; }
  const template = state.promptTemplates.find((t) => t.id === id);
  const proceed = window.confirm(`Delete the saved prompt "${template?.name}"? This cannot be undone.`);
  if (!proceed) return;
  const res = await lp5000Api.settingsStore.deletePromptTemplate(id);
  if (!res.ok) { showBanner(`Could not delete template: ${res.error}`, 'error'); return; }
  await loadPromptTemplatesForDropdown();
  el('newTemplateNameInput').value = '';
}

// --- Compile & Execute / Wrap-Up -------------------------------------------

function collectActiveTasks() {
  const active = [];
  for (const stageKey of Object.keys(state.stages)) {
    for (const task of state.stages[stageKey]) {
      if (state.checkedTasks[task]) active.push(task);
    }
  }
  return active;
}

async function compileAndExecute() {
  if (!state.activeProject) return;
  const payload = {
    projectId: state.activeProject.id,
    projectPath: state.activeProject.path,
    templateName: el('templateSelect').value,
    dynamicVars: state.dynamicVars,
    customProjName: state.customProjName,
    vibe: el('vibeSelect').value,
    pacing: el('pacingSelect').value,
    masterAudio: el('masterAudioSelect').value,
    activeTasks: collectActiveTasks(),
    projectPrompt: el('promptBox').value,
    selectedFiles: [...state.selectedFiles],
  };
  el('compileBtn').disabled = true;
  try {
    const res = await lp5000Api.engine.buildAndRun(payload);
    if (!res.ok) { showBanner(`Could not run: ${res.error}`, 'error'); return; }
    const note = res.injectedTasks.length
      ? ` Auto-added first: ${res.injectedTasks.join(', ')} — library.yaml/transcripts weren't found yet.`
      : '';
    showBanner(`Claude is awake! Prompt copied to clipboard.${note}`, 'success');
    loadRecentProjects();
  } finally {
    el('compileBtn').disabled = false;
  }
}

async function wrapUp() {
  if (!state.activeProject) return;
  el('wrapUpBtn').disabled = true;
  try {
    const res = await lp5000Api.engine.wrapUp(state.activeProject.path);
    if (!res.ok) { showBanner(`Could not run wrap-up: ${res.error}`, 'error'); return; }
    showBanner('Wrap-up prompt copied to clipboard — Claude is awake!', 'success');
  } finally {
    el('wrapUpBtn').disabled = false;
  }
}

// --- Settings panel ----------------------------------------------------------

const TOOL_NAMES = ['claude', 'ffmpeg', 'whisper'];

async function openSettings() {
  el('settingsPanel').classList.remove('hidden');
  const optionsRes = await lp5000Api.settingsStore.getOptionLists();
  await Promise.all([renderToolRows(optionsRes), renderClaudeOptions(optionsRes), renderButtercutRow()]);
}
function closeSettings() {
  el('settingsPanel').classList.add('hidden');
}

async function renderToolRows(optionsRes) {
  const settingsRes = await lp5000Api.settingsStore.getSettings();
  const settings = settingsRes.settings;
  const container = el('toolRows');
  container.innerHTML = '';
  for (const tool of TOOL_NAMES) {
    const entry = settings.tools[tool];
    const row = document.createElement('div');
    row.className = 'tool-row';
    const variantSelect = tool === 'whisper'
      ? `<select data-action="variant">${optionsRes.whisperVariants
          .map((v) => `<option value="${escapeHtml(v)}" ${v === entry.variant ? 'selected' : ''}>${escapeHtml(v)}</option>`)
          .join('')}</select>`
      : '';
    row.innerHTML = `
      <span class="name">${tool}</span>
      ${variantSelect}
      <span class="status-pill ${entry.status}">${entry.status.replace('_', ' ')}</span>
      <span class="path">${escapeHtml(entry.resolvedPath || 'not found')}</span>
      <button data-action="recheck" class="ghost-btn">Re-check</button>
      <button data-action="browse" class="ghost-btn">Browse…</button>
      <button data-action="clear" class="ghost-btn">Clear override</button>
    `;
    row.querySelector('[data-action="recheck"]').addEventListener('click', async () => {
      await lp5000Api.settingsStore.detectTool(tool);
      await renderToolRows(optionsRes);
    });
    row.querySelector('[data-action="browse"]').addEventListener('click', async () => {
      await lp5000Api.settingsStore.browseForToolBinary(tool);
      await renderToolRows(optionsRes);
    });
    row.querySelector('[data-action="clear"]').addEventListener('click', async () => {
      await lp5000Api.settingsStore.setToolOverride(tool, null);
      await renderToolRows(optionsRes);
    });
    if (tool === 'whisper') {
      row.querySelector('[data-action="variant"]').addEventListener('change', async (e) => {
        await lp5000Api.settingsStore.setWhisperVariant(e.target.value);
        await renderToolRows(optionsRes);
      });
    }
    container.appendChild(row);
  }
}

async function renderClaudeOptions(optionsRes) {
  const settingsRes = await lp5000Api.settingsStore.getSettings();
  const claudeOptions = settingsRes.settings.claudeOptions;

  const modelSelect = el('claudeModelSelect');
  modelSelect.innerHTML = optionsRes.claudeModels
    .map((m) => `<option value="${escapeHtml(m)}" ${m === claudeOptions.model ? 'selected' : ''}>${escapeHtml(m)}</option>`)
    .join('');
  modelSelect.onchange = () => lp5000Api.settingsStore.updateSettings({ claudeOptions: { model: modelSelect.value } });

  const effortSelect = el('claudeEffortSelect');
  effortSelect.innerHTML = optionsRes.claudeEfforts
    .map((v) => `<option value="${escapeHtml(v)}" ${v === claudeOptions.effort ? 'selected' : ''}>${escapeHtml(v)}</option>`)
    .join('');
  effortSelect.onchange = () => lp5000Api.settingsStore.updateSettings({ claudeOptions: { effort: effortSelect.value } });
}

async function renderButtercutRow() {
  const settingsRes = await lp5000Api.settingsStore.getSettings();
  const entry = settingsRes.settings.buttercut;
  const row = el('buttercutRow');
  row.innerHTML = `
    <span class="name">buttercut</span>
    <span class="status-pill ${entry.status}">${entry.status.replace('_', ' ')}</span>
    <span class="path">${escapeHtml(entry.resolvedPath || 'not found')}</span>
    <button data-action="recheck" class="ghost-btn">Re-check</button>
    <button data-action="browse" class="ghost-btn">Browse…</button>
    <button data-action="clear" class="ghost-btn">Clear override</button>
    <button data-action="update" class="ghost-btn">Update from GitHub</button>
  `;
  row.querySelector('[data-action="recheck"]').addEventListener('click', async () => {
    await lp5000Api.settingsStore.detectButtercut();
    await renderButtercutRow();
  });
  row.querySelector('[data-action="browse"]').addEventListener('click', async () => {
    await lp5000Api.settingsStore.browseForButtercutDir();
    await renderButtercutRow();
  });
  row.querySelector('[data-action="clear"]').addEventListener('click', async () => {
    await lp5000Api.settingsStore.setButtercutOverride(null);
    await renderButtercutRow();
  });
  const updateBtn = row.querySelector('[data-action="update"]');
  updateBtn.addEventListener('click', async () => {
    updateBtn.disabled = true;
    try {
      const res = await lp5000Api.settingsStore.updateButtercut();
      if (!res.ok) { showBanner(`ButterCut update failed: ${res.error}`, 'error'); return; }
      showBanner(`ButterCut updated: ${res.output || 'already up to date'}`, 'success');
    } finally {
      updateBtn.disabled = false;
    }
  });
}

async function openWorkflowsFolder() {
  const res = await lp5000Api.workflows.openFolder();
  if (!res.ok) showBanner(`Could not open workflows folder: ${res.error}`, 'error');
}

// --- Wiring -----------------------------------------------------------------

el('openProjectBtn').addEventListener('click', openProjectFolder);
el('addFootageBtn').addEventListener('click', addFootageFiles);
el('applyBulkRoleBtn').addEventListener('click', applyBulkRole);
el('linkFootageBtn').addEventListener('click', linkFootage);
el('templateSelect').addEventListener('change', refreshFormState);
el('toggleFilesBtn').addEventListener('click', toggleAllFootageSelection);
el('compileBtn').addEventListener('click', compileAndExecute);
el('wrapUpBtn').addEventListener('click', wrapUp);
el('loadPromptTemplateBtn').addEventListener('click', loadSelectedPromptTemplate);
el('saveAsPromptTemplateBtn').addEventListener('click', saveAsNewPromptTemplate);
el('updatePromptTemplateBtn').addEventListener('click', updateSelectedPromptTemplate);
el('deletePromptTemplateBtn').addEventListener('click', deleteSelectedPromptTemplate);
el('settingsBtn').addEventListener('click', openSettings);
el('closeSettingsBtn').addEventListener('click', closeSettings);
el('openWorkflowsFolderBtn').addEventListener('click', openWorkflowsFolder);

// On launch, the recent-projects list was always populated from disk here — but
// nothing ever auto-selected a project, so every relaunch looked "blank" at a glance
// until you clicked one. reopenLastProjectOnLaunch existed as a setting with no actual
// behavior behind it; this wires it up to the most-recently-opened project.
async function initApp() {
  const projects = await loadRecentProjects();
  await loadPromptTemplatesForDropdown();
  if (!state.settings) state.settings = (await lp5000Api.settingsStore.getSettings()).settings;
  const mostRecent = projects.find((p) => !p.archived);
  if (state.settings.ui.reopenLastProjectOnLaunch && mostRecent) {
    await selectProject(mostRecent.id);
  }
}
initApp();
