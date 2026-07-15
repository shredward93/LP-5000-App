# LP 5000 Smart Engine

A desktop app for driving [Claude Code](https://code.claude.com/docs/en/quickstart) + the opensource [ButterCut](https://github.com/barefootford/buttercut) Claude Code extension for AI-assisted video editing. Pick a project folder, choose a workflow, select source files, and **Compile & Execute** to generate a `CLAUDE.md` + run prompt and hand off to Claude.

Rewritten from an earlier Tkinter prototype as a single installed Electron app (v0.1.0) — see [ROADMAP.md](ROADMAP.md) for history.

---

## ⚠️ THE GOLDEN RULE

Do **NOT** rename the numbered project directories (`01_Footage`, `02_Audio`, etc.). The engine and Claude's global rules rely on these exact paths to route audio, sync multicam sequences, and generate XMLs.

---

## Quick start

This assumes you've already installed [Claude Code](https://code.claude.com/docs/en/quickstart) and [ButterCut](https://buttercut.io/#install).

1. **Install dependencies**

   ```sh
   npm install
   ```

2. **Run the app**

   ```sh
   npm start
   ```
3. In the app, click **Open Project Folder…** to attach an existing Buttercut-structured project (or a new/empty folder, which gets scaffolded automatically). Recently-opened projects are remembered — no need to re-add them next time.
4. Use **Import Footage** to browse for raw footage anywhere on disk (a card, an external drive — nothing needs to be copied into the project first) and assign each clip to a camera or category. Footage is symlinked into place, never copied or moved.
5. Pick a workflow (or "Build from scratch"), set your options, scan/select target files, then use **Compile & Execute** to generate `CLAUDE.md` + a run prompt and hand off to Claude in a new terminal.

Unlike the earlier per-folder prototype, this app is installed **once** and reused across every project — it is no longer copied into each project folder.

### Tests

```sh
npm test
```

Runs the `engine.js` unit suite (`node --test`) covering workflow-template parsing and the CLAUDE.md/prompt-building logic.

---

## Folder structure

| Folder        | Purpose                                       |
| ------------- | ---------------------------------------------- |
| `01_Footage`  | A-Roll (`Cam_<name>`, unlimited) + B-Roll (Gimbal, Drone) |
| `02_Audio`    | Ext_Audio, Music                              |
| `03_Edit`     | Resolve_Projects, XML_Exports, Transcripts    |
| `04_Graphics` | Lower_Thirds                                  |
| `05_VFX`      | After_Effects_Comps                           |
| `06_Preview`  | FrameIO_Exports                               |
| `07_Master`   | High_Res_ProRes                               |
| `libraries`   | Buttercut's `library.yaml` multicam sync map  |

The app scans `01_Footage` and `02_Audio` for media; XML and transcripts go under `03_Edit`. Keep the numbered names exactly as above.

---

## Workflows

Pre-built workflow templates live in `assets/Workflows/` (bundled with the app) and are seeded once into a per-user, freely-editable copy on first launch:

- **General_Workflow.md** — Standard freelance/corporate
- **Sermon_Workflow.md** — Social clip extraction from sermons
- **Wedding_Workflow.md** — Cinematic multicam assembly
- **Doc_Workflow.md** — Interview narrative & paper edit
- **BRoll_Selects_Workflow.md** — B-roll selects

Select one in the app to prefill creative guidelines and folder roles; you can still customize per project. Use the **Open Workflows Folder** button in Settings to edit your copy or add your own. To add a new workflow file, see **[How to Create a Workflow File](assets/Workflows/README.md)**.

---

## Claude integration

- **`.claude/settings.json`** — per-project Claude Code permissions. The app verifies/writes this automatically for every attached project.
- **`.claudesignore`** — tells Claude which paths to ignore when reading this repo (not the projects it manages).
- **`CLAUDE.md`** — regenerated inside each project's `.claude/` folder on every Compile & Execute run; it is a disposable, always-fresh artifact, not something to hand-edit.
- **ButterCut** — a git clone (not a gem), auto-detected at `~/Buttercut`, configurable in Settings. `CLAUDE.md` references its resolved path directly for Claude to use its Ruby helpers (contact sheets, transcript extraction, library migrations) as a reference, but multi-angle/B-Roll cuts are hand-authored FCP7 XML per the Track Protocol baked into every generated `CLAUDE.md` — not routed through ButterCut's own (single-track-only) exporter. Use the **Update from GitHub** button in Settings to pull the latest.

## Architecture

See [ROADMAP.md](ROADMAP.md) for project history. Source lives under `src/`:

- `src/main/` — Electron main process: `engine.js` (workflow/template/prompt logic, ported 1:1 from the earlier Python prototype), `ipc.js` (IPC orchestration), `terminalHandoff.js` (spawns Claude in a new terminal), `store/` (persistent settings + project registry, JSON files under the OS user-data directory).
- `src/preload/` — `contextBridge` API surface exposed to the renderer.
- `src/renderer/` — plain HTML/CSS/JS UI, no framework.
