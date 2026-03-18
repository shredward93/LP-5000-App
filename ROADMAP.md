# 🗺️ LP 5000 Project Roadmap

## 🎯 The Core Mission
Transform a powerful but intimidating command-line AI workflow (`barefootford/buttercut` + Claude CLI) into a polished, sleek, and highly intuitive standalone desktop application. The LP 5000 must allow regular video editors to automate tedious tasks—like multicam syncing, B-roll selection, paper edits, story selects, rough cuts, dead air removal, interview stringouts, and timeline prep for color grading—without ever opening a terminal or writing a line of code.

---

## ✅ Phase 1: Foundation & Prototyping (Completed)
- [x] **Proof of Concept:** Validated the core AI-to-video-generation logic using Claude and Buttercut.
- [x] **Local Optimization Strategy:** Defined the architecture to keep heavy lifting local (FFmpeg for metadata/stills, WhisperX for transcription) to save LLM tokens and API costs.
- [x] **Version Control:** Locked in the v9.33 monolithic script baseline and successfully backed it up to GitHub.
- [x] **Deployment Strategy:** Outlined the "Smart Setup" sequence to dynamically fetch correct binaries based on user hardware (Mac Apple Silicon vs. Windows PC).

## 🔄 Phase 2: Modular Restructuring (Completed)
- [x] **MVC Architecture:** Shatter the 600+ line monolithic `build` script into manageable, distinct files.
    - [x] `main.py` (The Launcher)
    - [x] `gui.py` (The Visual Frontend)
    - [x] `engine.py` (The Backend Logic)
- [x] **Asset Management:** Establish the `/assets` directory for branding (e.g., application logos).

## ⚙️ Phase 3: The Core Engine Upgrade (Next)
- [ ] **Asynchronous Subprocessing:** Implement `subprocess.Popen` in `engine.py` to run the Claude Code CLI invisibly in the background.
- [ ] **Thread-Safe Communication:** Build a background daemon thread and message queue (`queue.Queue()`) to capture terminal output without freezing the app.
- [ ] **Input Routing:** Create the mechanism to pass user approvals and text inputs from the GUI back into the engine's `stdin`.

## 🎨 Phase 4: The Polished GUI (High Priority)
- [ ] **Modern Interface:** Design a slick, user-friendly interface using modern `tkinter` and `ttk` styling that feels familiar to creative professionals.
- [ ] **Tabbed Workspace:**
    - [ ] *Setup Tab:* System readiness and hardware checks.
    - [ ] *Active Workspace:* Clean progress bars, status indicators, and user prompts.
    - [ ] *Safe Mode Console:* A hidden/collapsible raw terminal feed for advanced troubleshooting.
- [ ] **Token-Efficient Prompting:** Integrate the Telegraphic Transcript summarizer to prep audio data for the LLM.

## 📝 Phase 5: Workflow Templates (The "Dream" Feature)
- [ ] **Pre-Configured Automation:** Build a system (JSON/YAML) to store pre-written prompt chains and `buttercut` rules.
- [ ] **One-Click Editing:** Allow users to select templates like "Podcast Multicam Sync" or "Social Media B-Roll," automatically loading the optimal system instructions so the user doesn't have to copy/paste or engineer prompts for recurring tasks.

## 📦 Phase 6: Deployment & Packaging
- [ ] **Hardware Scanner Script:** Python script to detect OS, GPU architecture, and VRAM on first launch.
- [ ] **Isolated Environment:** Automated creation of a local Python `venv` strictly for WhisperX's 3.10/3.11 dependencies.
- [ ] **Executable Compilation:** Package the final Python app into standalone executables (`.exe` for Windows, `.dmg` for macOS) using PyInstaller.

---

## 🚀 Future Wishlist (Post-Launch / Version 2.0+)
*These features are recognized as highly valuable but are parked here to prevent scope creep during the core build.*

- [ ] **Native Video Player (FFmpeg Previewer):** Embed a media viewer directly into the Tkinter GUI. Allow users to set in/out points to pre-trim media, saving massive amounts of processing time and LLM API tokens.
- [ ] **NLE Integration (Premiere / Resolve):** Build dedicated, native plugin panels directly inside DaVinci Resolve and Adobe Premiere Pro to eliminate the friction of importing/exporting XMLs.
- [ ] **AI Photo Culling:** Expand the engine's capabilities to ingest massive folders of raw photography, using local vision models or metadata to automatically cull out-of-focus, closed-eyes, or poorly lit images.