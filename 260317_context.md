### 📂 LP 5000 Project: Technical Handover & Architecture Brief

**Project Origin & The Vision**
This project started as a workflow experiment: using the Claude Code CLI to drive `barefootford/buttercut` (a Ruby-based command-line video editor) to automate tedious editing tasks. While the core AI-to-video-generation logic works beautifully, the command-line interface is a massive barrier to entry. Regular video editors and creatives do not want to work in a terminal. 

**The Goal:** Build a polished, sleek, and highly intuitive desktop Graphical User Interface (GUI) that wraps this powerful command-line engine. We want an application that feels as modern and accessible as a native Premiere or Resolve plugin. 

**The "Dream" Feature (Workflow Templates):** The ultimate vision for this GUI is to eliminate repetitive prompting. We want to build a system of pre-configured "Workflow Templates" (e.g., "Podcast Multicam Sync," "Social Media B-Roll Highlights"). These templates will be pre-loaded with optimized system instructions, `buttercut` syntax rules, and formatting constraints so the user doesn't have to spend 10 minutes copying and pasting AI prompts for recurring editing tasks. The app handles the prompt engineering invisibly.

---

**Current Project State**
The project is currently transitioning out of the monolithic prototyping phase. We have successfully established a working baseline (v9.33) and secured it in version control on GitHub. We are actively refactoring the application from a single 600+ line generator script into a clean, modular Model-View-Controller (MVC) architecture. This is critical for building out the GUI features and prompt-template systems mentioned above.

**Target Architecture & File Structure**
We are shattering the legacy `build_lp5000_v9_33.py` script into the following active directory structure:

* **`LP-5000-App/`** (Root Directory)
    * **`main.py`**: The application launcher. It imports the interface and engine, connects them, and initializes the Tkinter main loop.
    * **`gui.py`**: The frontend visual layer. Contains all `tkinter` and `ttk` layout logic, including the tabbed workspace, progress bars, and the console display.
    * **`engine.py`**: The backend orchestration layer. Handles the `subprocess` logic for the Claude Code CLI, thread management, and the message queue.
    * **`assets/`**: Contains visual assets, currently holding `LP AI VIDEO EDITOR logo.png`.
    * **`setup.py`**: Folder setup script for project localization

**Core Logic & Data Flow**
* **Asynchronous UI:** To prevent the Tkinter GUI from freezing during heavy editing calculations, `engine.py` uses `subprocess.Popen` to run the Claude Code CLI invisibly in the background. 
* **Thread-Safe Polling:** Background threads capture `stdout` and `stderr` from the engine and push the text into a `queue.Queue()`. The Tkinter UI polls this queue every 100ms using the `.after()` method to update the frontend console dynamically.
* **Optimized Media Handling:** Heavy lifting is kept strictly local. We use highly optimized local installations of **FFmpeg** for metadata and still extraction, and **WhisperX** for audio transcription. 
* **Token Efficiency:** A strict `.claudesignore` file prevents the Claude API from attempting to read heavy `.mp4` or `.braw` binaries. WhisperX transcripts are condensed into "Telegraphic Transcripts" before being sent to the LLM to minimize context window usage.

**Completed Features & Milestones**
* Locked in the v9.33 logic baseline and secured the repository via Git.
* Finalized the "Smart Setup" deployment strategy: a setup sequence that uses Python to scan the user's hardware (Apple Silicon vs. Windows CUDA, VRAM) to dynamically fetch the correct Whisper models and FFmpeg binaries.
* Established a local virtual environment (`venv`) isolation protocol to handle WhisperX's strict Python 3.10/3.11 dependencies.

**Future Roadmap / Wish List**
* **Workflow Template Engine:** Build a JSON or YAML-based system to store and load pre-written prompt chains and `buttercut` rules directly into the GUI.
* **Native Video Player:** Embed an FFmpeg-based video previewer directly into the Tkinter GUI to allow users to set in/out points, pre-trimming media to save processing time and LLM API tokens.
* **NLE Integration:** Long-term goal of building out dedicated plugin panels directly within DaVinci Resolve and Adobe Premiere Pro to bypass the XML import/export friction.