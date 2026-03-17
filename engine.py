"""
LP 5000 AI Assistant – engine: workflow/template logic, CLAUDE.md and prompt building.
No GUI dependencies.
"""
import os
import re
import json


def verify_claude_settings(project_path: str) -> None:
    settings_dir = os.path.join(project_path, ".claude")
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
        except Exception:
            pass
    with open(settings_path, 'w') as f:
        json.dump(recommended, f, indent=2)


def scan_media_files(project_path: str) -> list[str]:
    """Return list of relative paths to media files under 01_Footage and 02_Audio."""
    out = []
    for root, dirs, files in os.walk(project_path):
        if '.git' in root or '.claude' in root:
            continue
        if any(x in root for x in ["01_Footage", "02_Audio"]):
            for file in files:
                if not file.startswith('.') and file.lower().endswith(('.mp4', '.mov', '.wav', '.mp3')):
                    rel = os.path.relpath(os.path.join(root, file), project_path)
                    out.append(rel)
    return out


def get_workflow_options(workflows_path: str) -> list[str]:
    """Return ['Build from scratch', ...workflow .md filenames]."""
    md_files = []
    if os.path.exists(workflows_path):
        md_files = [f for f in os.listdir(workflows_path) if f.endswith('.md')]
    return ["🛠️ Build from scratch"] + md_files


def get_template_tags(workflows_path: str, template_name: str) -> set | None:
    """Return set of {{tag}} names from workflow file, or None for build-from-scratch."""
    if template_name == "🛠️ Build from scratch":
        return None
    path = os.path.join(workflows_path, template_name)
    if not os.path.exists(path):
        return set()
    with open(path, 'r', encoding='utf-8') as f:
        return set(re.findall(r'\{\{(.*?)\}\}', f.read()))


def get_tasks_for_template(
    template_name: str,
    m_sync_active: bool,
    broll_active: bool
) -> dict[str, list[str]]:
    """Return dict: stage name -> list of task option strings."""
    m_sync = "Multicam - Sync & stack all A-Roll angles + Master Audio"
    broll_use = "Use B-Roll Footage"
    tasks = {
        "Stage 1": ["Use A-Roll Footage", broll_use, m_sync],
        "Stage 2": [
            "Transcribe Master Audio ONLY (Ignore Vision/Other Cams)",
            "Give me a transcript summary",
            "Analyze B-Roll Vision (Low-Token Mode / Fast)",
            "Analyze B-Roll Vision (Normal-Token Mode / Detailed)",
            "Analyze B-Roll Vision (High-Token Mode / Max Detail)"
        ],
        "Stage 3": ["Franken-bite & Remove Dead Space", "Build Narrative Paper Edit"],
        "Stage 4": [
            "Export Final XML to ./03_Edit/XML_Exports",
            "Export Final Transcripts as .txt to ./03_Edit/Transcripts"
        ]
    }
    if "Sermon" in template_name:
        tasks["Stage 3"] = tasks["Stage 3"] + [
            "Find 30-60s Social Clips (Pause for User Review)",
            "Find 60-120s Social Clips (Pause for User Review)"
        ]
    elif "Wedding" in template_name:
        tasks["Stage 3"] = tasks["Stage 3"] + [
            "Apply Rhythmic B-Roll Overlay (Wedding Style)",
            "Perform Emotional Story Sweep"
        ]
    elif "Doc" in template_name:
        tasks["Stage 3"] = tasks["Stage 3"] + [
            "Alternate Multicam Angles to Hide Cuts",
            "Identify Core Narrative Soundbites"
        ]
    elif "BRoll" in template_name:
        tasks["Stage 1"] = [broll_use]
        tasks["Stage 3"] = [
            "Categorize B-Roll Based on Guidelines (Token-Heavy / Detailed Sort)",
            "Build Separate XML Sequences per Category",
            "Build Single Master Selects Stringout XML"
        ]
    if m_sync_active:
        tasks["Stage 3"].append("Auto-cut to B-Cam for intimate/emotional moments (Transcript-based)")
    if broll_active and "BRoll" not in template_name:
        tasks["Stage 3"].extend([
            "Insert appropriate B-Roll on V2 based on context of transcript.",
            "Create separate sequence of all usable B-Roll."
        ])
    return tasks


def build_claude_md(
    project_path: str,
    template_name: str,
    dynamic_vars: dict[str, str],
    custom_proj_name: str,
    vibe: str,
    pacing: str,
    master_audio: str
) -> str:
    """Build full CLAUDE.md content."""
    if template_name == "🛠️ Build from scratch":
        md = f"# PROJECT: {custom_proj_name}\n## 🎨 GUIDELINES\n- Pause & Resume Protocol: Wait for approval. Remember tasks.\n"
    else:
        workflows_path = os.path.join(project_path, "assets", "Workflows")
        path = os.path.join(workflows_path, template_name)
        with open(path, 'r', encoding='utf-8') as f:
            md = f.read()
        for tag, value in dynamic_vars.items():
            md = md.replace(f"{{{{{tag}}}}}", value)
    md += f"\n\n## 🌍 PROJECT CONFIG\n- Vibe: {vibe}\n- Pacing: {pacing}\n- Master Audio Source: {master_audio}"
    md += "\n- **Audio Protocol:** Lock Track A1 to Master Audio. Place B-Roll Nat on A2. NEVER switch A1 source during multicam cuts. A2 should match B-roll content."
    md += "\n- **Library Landmark:** Your source of truth is `library.yaml`. Because the BUTTERCUT_PROJECT_DIR environment variable is enforced, this file will ALWAYS be generated and located strictly inside the `libraries/` directory within the current project root. DO NOT look inside the global Buttercut gem folder."
    md += "\n- **Global Rules:** Extract true SMPTE timecode. No 0-base anchoring. Use Telegraphic visual transcripts. Pause for Sync Map review and take note of remaining tasks. ALWAYS export timelines using the FCP7 XML standard (.xml / <xmeml> format) for DaVinci Resolve compatibility. NEVER export as FCPXML (.fcpxml)."
    return md


def build_run_prompt(active_tasks: list[str], global_sauce: str) -> str:
    """Build the prompt to paste into Claude (tasks + optional note)."""
    prompt = f"Read CLAUDE.md. Execute: {', '.join(active_tasks)}."
    sauce = (global_sauce or "").replace('"', "'")
    if sauce.strip():
        prompt += f" Note: {sauce.strip()}."
    return prompt


def get_wrap_up_prompt() -> str:
    """Return the wrap-up / backup project prompt."""
    return (
        "Project complete. 1. Run the Buttercut backup_libraries.rb script to zip the library.yaml and transcripts into the backups/ folder. "
        "2. Review our chat history for this project. If I gave you any stylistic corrections or new editing rules, permanently save them to your global memory. "
        "3. Print a big bold message reminding me to type /clear to wipe your context window."
    )
