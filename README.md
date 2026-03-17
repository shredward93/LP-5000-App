# Buttercut Master Template v9.33

A video-editing project template designed to work with the **LP 5000 AI Assistant** (Smart Engine GUI) and Claude. Use this folder as your project root so the engine can route media, sync multicam, and generate edit XMLs correctly.

---

## ⚠️ THE GOLDEN RULE

Do **NOT** rename these primary numbered directories. The Python Smart Engine and Claude's global rules rely on these exact paths to route audio, sync multicam sequences, and generate XMLs.

---

## Quick start

1. **Set Up the Python Virtual Environment**
   - Open a terminal in this folder.
   - Create a virtual environment:
     ```
     python3 -m venv venv
     ```
     (Or use `python -m venv venv` on Windows, depending on your configuration.)

   - Activate the virtual environment:
     - **macOS/Linux:**  
       ```
       source venv/bin/activate
       ```
     - **Windows:**  
       ```
       venv\Scripts\activate
       ```

   - Once activated, run the setup script to build the Buttercut folder structure:
     - **macOS/Linux:**
       ```
       python3 setup.py
       ```
     - **Windows:**
       ```
       python setup.py
       ```


2. **Run the Smart Engine**
   - **macOS:** Double-click `Run_Claude.command` or run `python3 lp5000_v9_33.py` in this folder.
   - **Windows:** Double-click `Run_Claude.bat` or run `python lp5000_v9_33.py` in this folder.

3. **Requirements:** Python 3 with `Pillow` installed (`pip install -r requirements.txt`, satisfied in step 1).

4. In the GUI, pick a workflow (or “Build from scratch”), set your options, select target files, then use **Compile & Execute** to generate prompts and workflow instructions for Claude.

---

## Folder structure

| Folder | Purpose |
|--------|--------|
| `01_Footage` | A-Roll (Cam A/B/C/D) and B-Roll (Gimbal, Drone, etc.) |
| `02_Audio` | Ext_Audio, Music |
| `03_Edit` | Resolve_Projects, XML_Exports, Transcripts |
| `04_Graphics` | Lower_Thirds |
| `05_VFX` | After_Effects_Comps |
| `06_Preview` | FrameIO_Exports |
| `07_Master` | High_Res_ProRes |

The Smart Engine scans `01_Footage` and `02_Audio` for media; XML and transcripts go under `03_Edit`. Keep the numbered names exactly as above.

---

## Workflows

Pre-built workflow templates live in `assets/Workflows/`:

- **General_Workflow.md** — Standard freelance/corporate
- **Sermon_Workflow.md** — Social clip extraction from sermons
- **Wedding_Workflow.md** — Cinematic multicam assembly
- **Doc_Workflow.md** — Interview narrative & paper edit
- **BRoll_Selects_Workflow.md** — B-roll selects

Select one in the LP 5000 GUI to prefill creative guidelines and folder roles; you can still customize per project.

---

## Claude integration

- **`.claude/settings.json`** — Cursor/Claude project settings (permissions, etc.). The Smart Engine can verify or update this.
- **`.claudesignore`** — Tells Claude which paths to ignore when reading the project.

Use this template as the **attached project** when working with Claude so it sees the correct paths and workflow files.
