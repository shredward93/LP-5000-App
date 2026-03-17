import tkinter as tk
from tkinter import messagebox, ttk
import os, re, json

try:
    from PIL import Image, ImageTk
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

class LP5000SmartEngine:
    def __init__(self, root):
        self.root = root
        self.root.title("LP 5000 AI Assistant Video Editor v9.33")
        self.root.geometry("750x1050")
        self.root.configure(bg="#0f0f0f")
        self.project_path = os.path.dirname(os.path.abspath(__file__))
        self.workflows_path = os.path.join(self.project_path, "assets", "Workflows")
        
        self.verify_claude_settings()
        
        self.scroll_canvas = tk.Canvas(self.root, bg="#0f0f0f", highlightthickness=0)
        self.scrollbar = tk.Scrollbar(self.root, orient="vertical", command=self.scroll_canvas.yview)
        self.main_frame = tk.Frame(self.scroll_canvas, bg="#0f0f0f")
        self.scroll_canvas.create_window((0, 0), window=self.main_frame, anchor="nw", width=730)
        self.scroll_canvas.configure(yscrollcommand=self.scrollbar.set)
        
        # --- THE UNIVERSAL SCROLL FIX ---
        def _on_mousewheel(event):
            if os.name == 'nt':
                # Windows math
                self.scroll_canvas.yview_scroll(int(-1*(event.delta/120)), "units")
            else:
                # Mac math
                self.scroll_canvas.yview_scroll(int(-1*event.delta), "units")
                
        self.scroll_canvas.bind_all("<MouseWheel>", _on_mousewheel)

        self.scroll_canvas.pack(side="left", fill="both", expand=True)
        self.scrollbar.pack(side="right", fill="y")
        self.main_frame.bind("<Configure>", lambda e: self.scroll_canvas.configure(scrollregion=self.scroll_canvas.bbox("all")))

        logo_path = os.path.join(self.project_path, "assets", "LP AI VIDEO EDITOR logo.png")
        fallback_path = os.path.join(os.path.dirname(self.project_path), "claude assets", "LP AI VIDEO EDITOR logo.png")
        img_path = logo_path if os.path.exists(logo_path) else (fallback_path if os.path.exists(fallback_path) else None)

        if img_path:
            if HAS_PIL:
                img = Image.open(img_path)
                ratio = 750 / img.width
                img = img.resize((750, int(img.height * ratio)), Image.Resampling.LANCZOS)
                self.logo_img = ImageTk.PhotoImage(img)
                tk.Label(self.main_frame, image=self.logo_img, bg="#0f0f0f", borderwidth=0).pack(fill="x", pady=(0, 15))
            else:
                self.logo_img = tk.PhotoImage(file=img_path)
                tk.Label(self.main_frame, image=self.logo_img, bg="#0f0f0f", borderwidth=0).pack(pady=(0, 15))
        else:
            tk.Label(self.main_frame, text="LP 5000 AI ASSISTANT", fg="#00ffcc", bg="#0f0f0f", font=("Helvetica", 22, "bold")).pack(pady=(15, 5))

        tk.Label(self.main_frame, text=f"📍 ATTACHED TO: {os.path.basename(self.project_path)}", fg="#888", bg="#0f0f0f", font=("Arial", 10)).pack(pady=(0, 15))

        # Setting your defaults
        self.template_var = tk.StringVar()
        self.vibe_var = tk.StringVar(value="Cinematic & Emotional")
        self.pacing_var = tk.StringVar(value="Moderate")
        self.custom_proj_name = tk.StringVar()
        self.dynamic_vars = {}
        self.task_vars = {}
        
        # OS-Aware Button Styling
        is_win = os.name == 'nt'
        self.btn_args = {"bg": "#333", "fg": "white"} if is_win else {"highlightbackground": "#1a1a1a"}
        self.comp_args = {"bg": "#00ffcc", "fg": "black"} if is_win else {"highlightbackground": "#0f0f0f"}
        self.wrap_args = {"bg": "#ff4444", "fg": "white"} if is_win else {"highlightbackground": "#0f0f0f"}

        self.add_source_blueprint()
        self.add_file_selection_section()
        
        self.stage1_frame = self.add_section("🎙️ STAGE 1: INGEST (Sources & Sync)")
        self.s1_top = tk.Frame(self.stage1_frame, bg="#1a1a1a")
        self.s1_top.pack(fill="x", pady=(0, 10))
        tk.Label(self.s1_top, text="Master Audio Source:", fg="#aaa", bg="#1a1a1a").pack(side="left")
        self.master_audio_var = tk.StringVar(value="A-Roll (Cam A)")
        ttk.Combobox(self.s1_top, textvariable=self.master_audio_var, values=["A-Roll (Cam A)", "A-Roll (Cam B)", "A-Roll (Cam C)", "A-Roll (Cam D)", "Ext_Audio Folder", "B-Roll (Nat Sound)"], state="readonly", width=20).pack(side="left", padx=10)
        self.s1_bottom = tk.Frame(self.stage1_frame, bg="#1a1a1a")
        self.s1_bottom.pack(fill="x")
        
        self.stage2_frame = self.add_section("👁️ STAGE 2: ANALYZE (Vision & Audio)")
        self.stage3_frame = self.add_section("✂️ STAGE 3: EDIT & ASSEMBLE")
        self.stage4_frame = self.add_section("🚀 STAGE 4: EXPORT & DELIVERY")
        
        tk.Label(self.main_frame, text="🍯 GLOBAL SECRET SAUCE / PROJECT NOTES:", fg="#aaa", bg="#0f0f0f", font=("Arial", 10, "bold")).pack(anchor="w", padx=40, pady=(10,0))
        self.global_sauce = tk.Entry(self.main_frame, bg="#262626", fg="white", font=("Arial", 11))
        self.global_sauce.pack(fill="x", padx=40, pady=5, ipady=8)

        btn_frame_main = tk.Frame(self.main_frame, bg="#0f0f0f")
        btn_frame_main.pack(fill="x", padx=40, pady=30)
        
        tk.Button(btn_frame_main, text="🚀 COMPILE & EXECUTE", command=self.run_engine, font=("Helvetica", 14, "bold"), pady=12, **self.comp_args).pack(fill="x", pady=(0, 10))
        tk.Button(btn_frame_main, text="🧹 WRAP-UP & BACKUP PROJECT", command=self.wrap_up_project, font=("Helvetica", 12, "bold"), pady=8, **self.wrap_args).pack(fill="x")

        self.refresh_ui()

    def verify_claude_settings(self):
        settings_dir = os.path.join(self.project_path, ".claude")
        os.makedirs(settings_dir, exist_ok=True)
        settings_path = os.path.join(settings_dir, "settings.json")
        recommended = {
            "permissions": {
                "defaultMode": "acceptEdits",
                "allow": [
                    "Read",
                    "Write",
                    "Edit",
                    "MultiEdit",
                    "Glob",
                    "Grep",
                    "LS",
                    "Bash",
                    "Read(//J:/**)",
                    "Write(//J:/**)",
                    "Read(//Volumes/**)",
                    "Write(//Volumes/**)"
                ]
            }
        }
        if os.path.exists(settings_path):
            try:
                with open(settings_path, 'r') as f:
                    if json.load(f) == recommended:
                        return
            except:
                pass
        with open(settings_path, 'w') as f:
            json.dump(recommended, f, indent=2)

    def add_source_blueprint(self):
        f = tk.LabelFrame(self.main_frame, text=" 1️⃣ SOURCE BLUEPRINT & PREFERENCES ", fg="#00ffcc", bg="#1a1a1a", font=("Arial", 11, "bold"), padx=15, pady=15)
        f.pack(fill="x", padx=40, pady=15)
        
        md_files = []
        if os.path.exists(self.workflows_path):
            md_files = [file for file in os.listdir(self.workflows_path) if file.endswith('.md')]
            
        options = ["🛠️ Build from scratch"] + md_files
        self.combo = ttk.Combobox(f, textvariable=self.template_var, values=options, state="readonly", width=40)
        self.combo.pack(anchor="w", pady=5)
        self.template_var.set(options[0])
        self.combo.bind("<<ComboboxSelected>>", self.refresh_ui)
        
        p_frame = tk.Frame(f, bg="#1a1a1a")
        p_frame.pack(fill="x", pady=5)
        tk.Label(p_frame, text="Vibe:", fg="#888", bg="#1a1a1a").pack(side="left")
        ttk.Combobox(p_frame, textvariable=self.vibe_var, values=["Cinematic & Emotional", "Punchy & Energetic", "Clean Corporate", "Raw / Unedited"], width=20).pack(side="left", padx=5)
        tk.Label(p_frame, text="Pacing:", fg="#888", bg="#1a1a1a").pack(side="left", padx=(10,0))
        ttk.Combobox(p_frame, textvariable=self.pacing_var, values=["Slow/Breathe", "Moderate", "Fast/Punchy", "No Cuts"], width=15).pack(side="left", padx=5)
        self.dynamic_container = tk.Frame(f, bg="#1a1a1a")
        self.dynamic_container.pack(fill="x", pady=(10,0))

    def add_file_selection_section(self):
        f = tk.LabelFrame(self.main_frame, text=" 📁 TARGET FILES ", fg="#00ffcc", bg="#1a1a1a", font=("Arial", 11, "bold"), padx=15, pady=10)
        f.pack(fill="x", padx=40, pady=5)
        btn_frame = tk.Frame(f, bg="#1a1a1a")
        btn_frame.pack(fill="x", pady=(0, 5))
        tk.Button(btn_frame, text="🔄 Scan Folders", command=self.scan_files, **self.btn_args).pack(side="left", padx=(0, 10))
        tk.Button(btn_frame, text="☑️ Toggle All / None", command=self.toggle_files, **self.btn_args).pack(side="left")
        self.file_listbox = tk.Listbox(f, selectmode=tk.MULTIPLE, bg="#262626", fg="white", height=4)
        self.file_listbox.pack(fill="x", pady=5)
        self.scan_files()

    def add_section(self, title):
        f = tk.LabelFrame(self.main_frame, text=f" {title} ", fg="#00ffcc", bg="#1a1a1a", font=("Arial", 11, "bold"), padx=15, pady=15)
        f.pack(fill="x", padx=40, pady=10)
        return f

    def scan_files(self):
        self.file_listbox.delete(0, tk.END)
        self.scanned_files = []
        for root, dirs, files in os.walk(self.project_path):
            if '.git' in root or '.claude' in root:
                continue
            if any(x in root for x in ["01_Footage", "02_Audio"]):
                for file in files:
                    if not file.startswith('.') and file.lower().endswith(('.mp4', '.mov', '.wav', '.mp3')):
                        rel = os.path.relpath(os.path.join(root, file), self.project_path)
                        self.scanned_files.append(rel)
                        self.file_listbox.insert(tk.END, f" {rel}")
        if not self.scanned_files:
            self.file_listbox.insert(tk.END, " No media files found.")
        else:
            self.file_listbox.selection_set(0, tk.END)

    def toggle_files(self):
        if len(self.file_listbox.curselection()) == self.file_listbox.size():
            self.file_listbox.selection_clear(0, tk.END)
        else:
            self.file_listbox.selection_set(0, tk.END)

    def refresh_ui(self, event=None):
        for w in self.dynamic_container.winfo_children():
            w.destroy()
        current_states = {k: v.get() for k, v in self.task_vars.items()}
        self.task_vars.clear()
        selected = self.template_var.get()
        if selected == "🛠️ Build from scratch":
            tk.Label(self.dynamic_container, text="Project Name:", fg="#aaa", bg="#1a1a1a").grid(row=0, column=0, sticky="w")
            tk.Entry(self.dynamic_container, textvariable=self.custom_proj_name, bg="#262626", fg="white", width=30).grid(row=0, column=1, padx=10, pady=5)
        else:
            try:
                with open(os.path.join(self.workflows_path, selected), 'r', encoding='utf-8') as file:
                    tags = set(re.findall(r'\{\{(.*?)\}\}', file.read()))
                    for tag in tags:
                        tk.Label(self.dynamic_container, text=f"{tag}:", fg="#aaa", bg="#1a1a1a").pack(anchor="w")
                        if tag not in self.dynamic_vars:
                            self.dynamic_vars[tag] = tk.StringVar()
                        tk.Entry(self.dynamic_container, textvariable=self.dynamic_vars[tag], bg="#262626", fg="white").pack(fill="x", pady=2)
            except:
                pass
        
        m_sync = "Multicam - Sync & stack all A-Roll angles + Master Audio"
        broll_use = "Use B-Roll Footage"
        m_active = current_states.get(m_sync, False)
        b_active = current_states.get(broll_use, False)
        
        tasks = {
            "Stage 1": ["Use A-Roll Footage", broll_use, m_sync],
            "Stage 2": ["Transcribe Master Audio ONLY (Ignore Vision/Other Cams)", "Give me a transcript summary", "Analyze B-Roll Vision (Low-Token Mode / Fast)", "Analyze B-Roll Vision (Normal-Token Mode / Detailed)", "Analyze B-Roll Vision (High-Token Mode / Max Detail)"],
            "Stage 3": ["Franken-bite & Remove Dead Space", "Build Narrative Paper Edit"],
            "Stage 4": ["Export Final XML to ./03_Edit/XML_Exports", "Export Final Transcripts as .txt to ./03_Edit/Transcripts"]
        }

        if "Sermon" in selected:
            tasks["Stage 3"] += ["Find 30-60s Social Clips (Pause for User Review)", "Find 60-120s Social Clips (Pause for User Review)"]
        elif "Wedding" in selected:
            tasks["Stage 3"] += ["Apply Rhythmic B-Roll Overlay (Wedding Style)", "Perform Emotional Story Sweep"]
        elif "Doc" in selected:
            tasks["Stage 3"] += ["Alternate Multicam Angles to Hide Cuts", "Identify Core Narrative Soundbites"]
        elif "BRoll" in selected:
            tasks["Stage 1"] = [broll_use]
            tasks["Stage 3"] = ["Categorize B-Roll Based on Guidelines (Token-Heavy / Detailed Sort)", "Build Separate XML Sequences per Category", "Build Single Master Selects Stringout XML"]
        
        if m_active:
            tasks["Stage 3"].append("Auto-cut to B-Cam for intimate/emotional moments (Transcript-based)")
        if b_active and "BRoll" not in selected:
            tasks["Stage 3"].extend(["Insert appropriate B-Roll on V2 based on context of transcript.", "Create separate sequence of all usable B-Roll."])

        self.rebuild_stage(self.s1_bottom, tasks["Stage 1"], current_states, [m_sync, broll_use])
        self.rebuild_stage(self.stage2_frame, tasks["Stage 2"], current_states, [])
        self.rebuild_stage(self.stage3_frame, tasks["Stage 3"], current_states, [])
        self.rebuild_stage(self.stage4_frame, tasks["Stage 4"], current_states, [])

    def rebuild_stage(self, frame, options, current_states, triggers):
        for w in frame.winfo_children():
            w.destroy()
        for opt in options:
            var = tk.BooleanVar(value=current_states.get(opt, False))
            self.task_vars[opt] = var
            tk.Checkbutton(frame, text=opt, variable=var, bg="#1a1a1a", fg="white", selectcolor="#333", activebackground="#1a1a1a", activeforeground="white", command=self.refresh_ui if opt in triggers else None).pack(anchor="w", pady=1)

    def execute_in_terminal(self, prompt, is_wrap_up=False):
        self.root.clipboard_clear()
        self.root.clipboard_append(prompt)
        
        if os.name == 'nt':
            trigger_path = os.path.join(self.project_path, "auto_run.ps1")
            with open(trigger_path, "w", encoding="utf-8") as f:
                f.write(f'Write-Host "----------------------------------------" -ForegroundColor Cyan\n')
                f.write(f'Write-Host " WAKING UP CLAUDE IN INTERACTIVE MODE..." -ForegroundColor Green\n')
                f.write(f'Write-Host "----------------------------------------" -ForegroundColor Cyan\n')
                f.write(f'$env:BUTTERCUT_PROJECT_DIR="{self.project_path}"\n')
                f.write(f'Set-Location -LiteralPath "{self.project_path}"\n')
                f.write(f'claude\n')
            
            os.system(f'start powershell -NoExit -ExecutionPolicy Bypass -File "{trigger_path}"')
            
        else:
            trigger_path = os.path.join(self.project_path, "auto_run.command")
            with open(trigger_path, "w", encoding="utf-8") as f:
                f.write("#!/bin/bash\n")
                f.write("echo \"----------------------------------------\"\n")
                f.write("echo \" WAKING UP CLAUDE IN INTERACTIVE MODE...\"\n")
                f.write("echo \"----------------------------------------\"\n")
                f.write(f'export BUTTERCUT_PROJECT_DIR="{self.project_path}"\n')
                f.write(f'cd "{self.project_path}"\n')
                f.write(f'claude\n')
            os.chmod(trigger_path, 0o755)
            os.system(f'open -a Terminal "{trigger_path}"')

        messagebox.showinfo("Ready for Handoff", "The terminal has been spawned and Claude is awake!\n\nYour instructions have been copied to your clipboard. Simply RIGHT-CLICK inside the new terminal window and hit ENTER to start the edit!")

    def run_engine(self):
        sel = self.template_var.get()
        if sel == "🛠️ Build from scratch":
            md = f"# PROJECT: {self.custom_proj_name.get()}\n## 🎨 GUIDELINES\n- Pause & Resume Protocol: Wait for approval. Remember tasks.\n"
        else:
            with open(os.path.join(self.workflows_path, sel), 'r', encoding='utf-8') as f:
                md = f.read()
            for tag, var in self.dynamic_vars.items():
                md = md.replace(f"{{{{{tag}}}}}", var.get())
        
        md += f"\n\n## 🌍 PROJECT CONFIG\n- Vibe: {self.vibe_var.get()}\n- Pacing: {self.pacing_var.get()}\n- Master Audio Source: {self.master_audio_var.get()}"
        md += "\n- **Audio Protocol:** Lock Track A1 to Master Audio. Place B-Roll Nat on A2. NEVER switch A1 source during multicam cuts. A2 should match B-roll content."
        md += "\n- **Library Landmark:** Your source of truth is `library.yaml`. Because the BUTTERCUT_PROJECT_DIR environment variable is enforced, this file will ALWAYS be generated and located strictly inside the `libraries/` directory within the current project root. DO NOT look inside the global Buttercut gem folder."
        md += "\n- **Global Rules:** Extract true SMPTE timecode. No 0-base anchoring. Use Telegraphic visual transcripts. Pause for Sync Map review and take note of remaining tasks. ALWAYS export timelines using the FCP7 XML standard (.xml / <xmeml> format) for DaVinci Resolve compatibility. NEVER export as FCPXML (.fcpxml)."
        
        with open(os.path.join(self.project_path, "CLAUDE.md"), "w", encoding="utf-8") as f:
            f.write(md)
        
        active = [t for t, v in self.task_vars.items() if v.get()]
        sauce = self.global_sauce.get().replace('"', "'")
        prompt = f"Read CLAUDE.md. Execute: {', '.join(active)}."
        if sauce:
            prompt += f" Note: {sauce}."
        
        self.execute_in_terminal(prompt, is_wrap_up=False)

    def wrap_up_project(self):
        prompt = "Project complete. 1. Run the Buttercut backup_libraries.rb script to zip the library.yaml and transcripts into the backups/ folder. 2. Review our chat history for this project. If I gave you any stylistic corrections or new editing rules, permanently save them to your global memory. 3. Print a big bold message reminding me to type /clear to wipe your context window."
        self.execute_in_terminal(prompt, is_wrap_up=True)

if __name__ == "__main__":
    root = tk.Tk()
    app = LP5000SmartEngine(root)
    root.mainloop()
