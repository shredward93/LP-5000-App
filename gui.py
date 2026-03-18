"""
LP 5000 AI Assistant – GUI: all tkinter UI and event handlers.
Uses engine for workflow logic and prompt building.
"""
import os
import tkinter as tk
from tkinter import messagebox, ttk
import subprocess

try:
    from PIL import Image, ImageTk
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

from engine import (
    verify_claude_settings,
    scan_media_files,
    get_workflow_options,
    get_template_tags,
    get_stages_from_template,
    get_triggers_from_template,
    build_claude_md,
    build_run_prompt,
    get_wrap_up_prompt,
)


class LP5000SmartEngine:
    def __init__(self, root):
        self.root = root
        self.root.title("LP 5000 AI Assistant Video Editor v9.33")
        self.root.geometry("750x1050")
        self.root.configure(bg="#0f0f0f")
        self.project_path = os.path.dirname(os.path.abspath(__file__))
        self.workflows_path = os.path.join(self.project_path, "assets", "Workflows")

        verify_claude_settings(self.project_path)

        self.scroll_canvas = tk.Canvas(self.root, bg="#0f0f0f", highlightthickness=0)
        self.scrollbar = tk.Scrollbar(self.root, orient="vertical", command=self.scroll_canvas.yview)
        self.main_frame = tk.Frame(self.scroll_canvas, bg="#0f0f0f")
        self.scroll_canvas.create_window((0, 0), window=self.main_frame, anchor="nw", width=730)
        self.scroll_canvas.configure(yscrollcommand=self.scrollbar.set)

        def _on_mousewheel(event):
            if os.name == 'nt':
                self.scroll_canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")
            else:
                self.scroll_canvas.yview_scroll(int(-1 * event.delta), "units")

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

        self.template_var = tk.StringVar()
        self.vibe_var = tk.StringVar(value="Cinematic & Emotional")
        self.pacing_var = tk.StringVar(value="Moderate")
        self.custom_proj_name = tk.StringVar()
        self.dynamic_vars = {}
        self.task_vars = {}

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

        tk.Label(self.main_frame, text="🍯 GLOBAL SECRET SAUCE / PROJECT NOTES:", fg="#aaa", bg="#0f0f0f", font=("Arial", 10, "bold")).pack(anchor="w", padx=40, pady=(10, 0))
        self.global_sauce = tk.Entry(self.main_frame, bg="#262626", fg="white", font=("Arial", 11))
        self.global_sauce.pack(fill="x", padx=40, pady=5, ipady=8)

        btn_frame_main = tk.Frame(self.main_frame, bg="#0f0f0f")
        btn_frame_main.pack(fill="x", padx=40, pady=30)

        tk.Button(btn_frame_main, text="🚀 COMPILE & EXECUTE", command=self.run_engine, font=("Helvetica", 14, "bold"), pady=12, **self.comp_args).pack(fill="x", pady=(0, 10))
        tk.Button(btn_frame_main, text="🧹 WRAP-UP & BACKUP PROJECT", command=self.wrap_up_project, font=("Helvetica", 12, "bold"), pady=8, **self.wrap_args).pack(fill="x")

        self.refresh_ui()

    def add_source_blueprint(self):
        f = tk.LabelFrame(self.main_frame, text=" 1️⃣ SOURCE BLUEPRINT & PREFERENCES ", fg="#00ffcc", bg="#1a1a1a", font=("Arial", 11, "bold"), padx=15, pady=15)
        f.pack(fill="x", padx=40, pady=15)

        options = get_workflow_options(self.workflows_path)
        self.combo = ttk.Combobox(f, textvariable=self.template_var, values=options, state="readonly", width=40)
        self.combo.pack(anchor="w", pady=5)
        self.template_var.set(options[0])
        self.combo.bind("<<ComboboxSelected>>", self.refresh_ui)

        p_frame = tk.Frame(f, bg="#1a1a1a")
        p_frame.pack(fill="x", pady=5)
        tk.Label(p_frame, text="Vibe:", fg="#888", bg="#1a1a1a").pack(side="left")
        ttk.Combobox(p_frame, textvariable=self.vibe_var, values=["Cinematic & Emotional", "Punchy & Energetic", "Clean Corporate", "Raw / Unedited"], width=20).pack(side="left", padx=5)
        tk.Label(p_frame, text="Pacing:", fg="#888", bg="#1a1a1a").pack(side="left", padx=(10, 0))
        ttk.Combobox(p_frame, textvariable=self.pacing_var, values=["Slow/Breathe", "Moderate", "Fast/Punchy", "No Cuts"], width=15).pack(side="left", padx=5)
        self.dynamic_container = tk.Frame(f, bg="#1a1a1a")
        self.dynamic_container.pack(fill="x", pady=(10, 0))

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
        self.scanned_files = scan_media_files(self.project_path)
        if not self.scanned_files:
            self.file_listbox.insert(tk.END, " No media files found.")
        else:
            for rel in self.scanned_files:
                self.file_listbox.insert(tk.END, f" {rel}")
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
            tags = get_template_tags(self.workflows_path, selected)
            if tags:
                for tag in tags:
                    tk.Label(self.dynamic_container, text=f"{tag}:", fg="#aaa", bg="#1a1a1a").pack(anchor="w")
                    if tag not in self.dynamic_vars:
                        self.dynamic_vars[tag] = tk.StringVar()
                    tk.Entry(self.dynamic_container, textvariable=self.dynamic_vars[tag], bg="#262626", fg="white").pack(fill="x", pady=2)

        m_sync = "Multicam - Sync & stack all A-Roll angles + Master Audio"
        broll_use = "Use B-Roll Footage"
        m_active = current_states.get(m_sync, False)
        b_active = current_states.get(broll_use, False)
        tasks = get_stages_from_template(self.workflows_path, selected, m_active, b_active)
        triggers = get_triggers_from_template(self.workflows_path, selected)

        self.rebuild_stage(self.s1_bottom, tasks["Stage 1"], current_states, triggers)
        self.rebuild_stage(self.stage2_frame, tasks["Stage 2"], current_states, triggers)
        self.rebuild_stage(self.stage3_frame, tasks["Stage 3"], current_states, triggers)
        self.rebuild_stage(self.stage4_frame, tasks["Stage 4"], current_states, triggers)

    def rebuild_stage(self, frame, options, current_states, triggers):
        for w in frame.winfo_children():
            w.destroy()
        for opt in options:
            var = tk.BooleanVar(value=current_states.get(opt, False))
            self.task_vars[opt] = var
            if opt in triggers:
                _command = self.refresh_ui
            else:
                _command = None
            tk.Checkbutton(
                frame, text=opt, variable=var,
                bg="#1a1a1a", fg="white", selectcolor="#333",
                activebackground="#1a1a1a", activeforeground="white",
                command=_command
            ).pack(anchor="w", pady=1)

    def execute_in_terminal(self, prompt: str) -> None:
        self.root.clipboard_clear()
        self.root.clipboard_append(prompt)
        if os.name == 'nt':
            trigger_path = os.path.join(self.project_path, "auto_run.ps1")
            with open(trigger_path, "w", encoding="utf-8") as f:
                f.write('Write-Host "----------------------------------------" -ForegroundColor Cyan\n')
                f.write('Write-Host " WAKING UP CLAUDE IN INTERACTIVE MODE..." -ForegroundColor Green\n')
                f.write('Write-Host "----------------------------------------" -ForegroundColor Cyan\n')
                f.write(f'$env:BUTTERCUT_PROJECT_DIR="{self.project_path}"\n')
                f.write(f'Set-Location -LiteralPath "{self.project_path}"\n')
                f.write('claude\n')
            os.system(f'start powershell -NoExit -ExecutionPolicy Bypass -File "{trigger_path}"')
        else:
            trigger_path = os.path.join(self.project_path, "auto_run.command")
            with open(trigger_path, "w", encoding="utf-8") as f:
                f.write("#!/bin/bash\n")
                f.write('echo "----------------------------------------"\n')
                f.write('echo " WAKING UP CLAUDE IN INTERACTIVE MODE..."\n')
                f.write('echo "----------------------------------------"\n')
                f.write(f'export BUTTERCUT_PROJECT_DIR="{self.project_path}"\n')
                f.write(f'cd "{self.project_path}"\n')
                f.write('claude\n')
            os.chmod(trigger_path, 0o755)
            os.system(f'open -a Terminal "{trigger_path}"')
        messagebox.showinfo("Ready for Handoff", "The terminal has been spawned and Claude is awake!\n\nYour instructions have been copied to your clipboard. Simply RIGHT-CLICK inside the new terminal window and hit ENTER to start the edit!")

    def run_engine(self):
        sel = self.template_var.get()
        dynamic_dict = {k: v.get() for k, v in self.dynamic_vars.items()}
        md = build_claude_md(
            self.project_path,
            sel,
            dynamic_dict,
            self.custom_proj_name.get(),
            self.vibe_var.get(),
            self.pacing_var.get(),
            self.master_audio_var.get(),
        )
        claude_md_path = os.path.join(self.project_path, "CLAUDE.md")
        with open(claude_md_path, "w", encoding="utf-8") as f:
            f.write(md)
        active = [t for t, v in self.task_vars.items() if v.get()]
        prompt = build_run_prompt(active, self.global_sauce.get())
        self.execute_in_terminal(prompt)

    def wrap_up_project(self):
        self.execute_in_terminal(get_wrap_up_prompt())
