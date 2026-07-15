# 🗺️ LP 5000 Project Roadmap

## 🎯 The Core Mission
Transform a powerful but intimidating command-line AI workflow (`barefootford/buttercut` + Claude CLI) into a polished, sleek, and highly intuitive standalone desktop application. The LP 5000 must allow regular video editors to automate tedious tasks—like multicam syncing, B-roll selection, paper edits, story selects, rough cuts, dead air removal, interview stringouts, and timeline prep for color grading—without ever opening a terminal or writing a line of code.

---

## ✅ Phase 1: Foundation & Prototyping (Completed)
- [x] **Proof of Concept:** Validated the core AI-to-video-generation logic using Claude and Buttercut.
- [x] **Local Optimization Strategy:** Defined the architecture to keep heavy lifting local (FFmpeg for metadata/stills, WhisperMLX for transcription) to save LLM tokens and API costs.
- [x] **Version Control:** Locked in the v9.33 monolithic script baseline and successfully backed it up to GitHub.
- [x] **Deployment Strategy:** Outlined the "Smart Setup" sequence to dynamically fetch correct binaries based on user hardware (Mac Apple Silicon vs. Windows PC).

## 🔄 Phase 2: Modular Restructuring (Completed)
- [x] **MVC Architecture:** Shatter the 600+ line monolithic `build` script into manageable, distinct files.
    - [x] `main.py` (The Launcher)
    - [x] `gui.py` (The Visual Frontend)
    - [x] `engine.py` (The Backend Logic)
- [x] **Asset Management:** Establish the `/assets` directory for branding (e.g., application logos).

## 🚀 Phase 7: Electron Rewrite (Completed)
The Tkinter prototype required the entire app to be copied into every project folder, had no memory of settings/tool paths/past projects across runs, and had two confirmed bugs (the file-selection UI never reached Claude; Stage 3/4 tasks silently assumed Stage 1/2 prerequisites had already run). Superseded Phases 2-4 and 6 below with a single rewrite:
- [x] **Single installed app, many projects:** replaced the per-folder copy model with one Electron app + a persistent project registry (recent projects, last-used settings, cached sync/transcript status) stored under the OS user-data directory.
- [x] **Plain HTML/CSS/JS renderer, no framework** — `contextIsolation`/`sandbox`/no `nodeIntegration`, narrow `contextBridge` IPC surface.
- [x] **`engine.py` ported 1:1 to `src/main/engine.js`**, unit-tested with `node --test` against the real bundled workflow templates.
- [x] **Both confirmed bugs fixed:** selected source files are now named explicitly in `CLAUDE.md` + the run prompt; missing Stage 1/2 prerequisites (`library.yaml`, transcripts) are auto-detected and prepended to the task list instead of surfacing as a mid-session surprise.
- [x] **Tool-path settings panel** (`claude`/`ffmpeg`/`whisper`) with auto-detect (including a login-shell PATH query, since GUI apps don't inherit shell rc-file PATH) + manual override.
- [x] Terminal handoff (spawn Terminal/PowerShell, clipboard-copy the prompt, fresh `claude` session each run) kept at parity with the original.

Old Python files (`main.py`, `gui.py`, `engine.py`, `setup.py`, `Run_Claude.command/.bat`, `requirements.txt`) removed from this repo. Already-deployed per-project copies (e.g. existing project folders that still contain their own copy) are left untouched on disk — just no longer the supported path going forward.

## 🎥 Phase 8: In-App Footage Import + Unlimited Cameras + ButterCut v0.8.0 (Completed)

Finder-based project setup (manually creating folders, dragging footage in) is gone — everything now happens through the app UI, and camera count is no longer capped:

- [x] **Import Footage panel:** browse for raw footage anywhere on disk (card, external drive) and assign each clip to a category (A-Roll + free-form camera name / B-Roll Gimbal / B-Roll Drone / Ext Audio / Music), with bulk-assign for a whole card at once. Footage is **symlinked in place** — never copied or moved — so source media is never at risk.
- [x] **Unlimited camera angles:** A-Roll folders (`Cam_<name>`) are created on demand from whatever name the user types (not a fixed A–D) — `slugifyCameraLabel` sanitizes the name (blocks path traversal, normalizes a redundant "Cam"/"Camera" prefix so "Cam A" and "A" land in the same folder).
- [x] **Master Audio Source dropdown is now dynamic**, populated from whatever cameras are actually linked into the project instead of a hardcoded Cam A–D list.
- [x] **Generalized multi-angle + B-Roll track protocol** baked into every generated `CLAUDE.md`: V1..VN (one track per camera angle, enabled/disabled toggle per position, never delete a clip to indicate a cut is off), a B-Roll track after the last angle, A1 locked to one master-audio source that never changes on cuts, A2 for optional B-Roll nat sound. Confirmed against a real hand-authored export (`Chance_Testimony_679_ROUGHCUT.xml`) that already used this exact technique — Claude was hand-authoring FCP7 XML directly, bypassing ButterCut's (single-track-only, in every version, free or Pro) exporter.
- [x] **ButterCut updated to latest (v0.8.0)**, cloned fresh to `~/Buttercut` from `github.com/barefootford/buttercut` — the gem-based install (RubyGems distribution ended at v0.7.1, "Final RubyGems release" per the maintainer) is retired in favor of the git-clone model ButterCut itself now expects. Full test suite (376/376) passing on this machine's Ruby 4.0.1. ffmpeg swapped to the `homebrew-ffmpeg` tap build for the `drawtext` filter ButterCut's contact-sheet pipeline needs.
- [x] **Settings panel: ButterCut row** — auto-detects `~/Buttercut`, manual override via folder picker, "Update from GitHub" button (`git pull --ff-only`, refuses over uncommitted local changes rather than discarding them).
- [x] Generated `CLAUDE.md` now references the resolved ButterCut path directly (replacing the stale "global Buttercut gem folder" wording) and is explicit that hand-authoring XML per the Track Protocol is the primary path, not a Buttercut-exporter dependency.

## ⚙️ Phase 3: The Core Engine Upgrade (Superseded by Phase 7)
- [x] Async terminal handoff, IPC-based communication, and input routing all landed as part of the Electron rewrite's IPC architecture instead of `subprocess.Popen`/`queue.Queue` in Python.

## 🎨 Phase 4: The Polished GUI (Superseded by Phase 7)
- [x] Modern interface delivered via the Electron renderer instead of `tkinter`/`ttk`.
- [ ] **Tabbed Workspace / Safe Mode Console:** not yet built — current UI is single-scroll with a Settings overlay, not tabbed. Revisit if the workspace grows crowded.
- [ ] **Token-Efficient Prompting:** Telegraphic Transcript summarizer integration still open.

## 📝 Phase 5: Workflow Templates (The "Dream" Feature)
- [x] **Pre-Configured Automation:** delivered via the existing `assets/Workflows/*.md` frontmatter system, now bundled with the app and seeded into a per-user editable copy.
- [ ] **One-Click Editing:** template dropdown exists; no saved "recipe" beyond a project's last-used settings yet.

## 📦 Phase 6: Deployment & Packaging (Superseded by Phase 7)
- [ ] **Hardware Scanner Script:** not yet built for the Electron app.
- [ ] **Isolated Environment:** `uv tool install whispermlx` automation still open; the app's Settings panel can at least detect/override an existing whisper install.
- [ ] **Executable Compilation:** `electron-builder` config is in `package.json` (unsigned macOS `.dmg` + Windows NSIS target) but producing/testing an actual installer is still open — `npm start` (dev mode) is the only verified path so far.

---

## 🚀 Future Wishlist (Post-Launch / Version 2.0+)
*These features are recognized as highly valuable but are parked here to prevent scope creep during the core build.*

- [ ] **Native Video Player (FFmpeg Previewer):** Embed a media viewer directly into the Tkinter GUI. Allow users to set in/out points to pre-trim media, saving massive amounts of processing time and LLM API tokens.
- [ ] **NLE Integration (Premiere / Resolve):** Build dedicated, native plugin panels directly inside DaVinci Resolve and Adobe Premiere Pro to eliminate the friction of importing/exporting XMLs.
- [ ] **AI Photo Culling:** Expand the engine's capabilities to ingest massive folders of raw photography, using local vision models or metadata to automatically cull out-of-focus, closed-eyes, or poorly lit images.