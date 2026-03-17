"""
LP 5000 AI Assistant – engine: workflow/template logic, CLAUDE.md and prompt building.
No GUI dependencies.
"""
import os
import re
import json


def _parse_frontmatter(text: str) -> dict:
    """Parse YAML-like frontmatter. Returns dict with Stage 1-4 (lists) and triggers (list)."""
    result = {}
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        m = re.match(r'^(Stage [1-4]|triggers):\s*$', line)
        if m:
            key = m.group(1)
            items = []
            i += 1
            while i < len(lines) and re.match(r'^\s+-\s+', lines[i]):
                raw = lines[i].strip()
                if raw.startswith('- '):
                    item = raw[2:].strip()
                    if item.startswith('"') and item.endswith('"'):
                        item = item[1:-1]
                    items.append(item)
                i += 1
            result[key] = items
            continue
        i += 1
    return result


def _read_frontmatter_block(path: str) -> tuple[str, str] | None:
    """Read file; return (frontmatter_yaml_text, body_after_second_delimiter) or None."""
    if not os.path.exists(path):
        return None
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    if not content.strip().startswith('---'):
        return None
    # First line is "---"; find the next "---" (closing delimiter)
    lines = content.splitlines()
    if lines[0].strip() != '---':
        return None
    end_idx = None
    for i in range(1, len(lines)):
        if lines[i].strip() == '---':
            end_idx = i
            break
    if end_idx is None:
        return None
    yaml_text = '\n'.join(lines[1:end_idx])
    body = '\n'.join(lines[end_idx + 1:])
    return yaml_text, body


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


DEFAULT_TRIGGERS = [
    "Multicam - Sync & stack all A-Roll angles + Master Audio",
    "Use B-Roll Footage",
]


def get_template_frontmatter(workflows_path: str, template_name: str) -> dict:
    """Read workflow file and return parsed frontmatter (Stage 1-4, triggers). For Build from scratch uses General_Workflow.md."""
    if template_name == "🛠️ Build from scratch":
        template_name = "General_Workflow.md"
    path = os.path.join(workflows_path, template_name)
    block = _read_frontmatter_block(path)
    if block is None:
        if template_name != "General_Workflow.md":
            return get_template_frontmatter(workflows_path, "General_Workflow.md")
        return {}
    yaml_text, _ = block
    fm = _parse_frontmatter(yaml_text)
    if not fm.get("Stage 1") and template_name != "General_Workflow.md":
        return get_template_frontmatter(workflows_path, "General_Workflow.md")
    return fm


def get_stages_from_template(
    workflows_path: str,
    template_name: str,
    m_sync_active: bool,
    broll_active: bool,
) -> dict[str, list[str]]:
    """Return dict: stage name -> list of task option strings. All from frontmatter; optionally append conditional tasks."""
    fm = get_template_frontmatter(workflows_path, template_name)
    tasks = {
        "Stage 1": list(fm.get("Stage 1", [])),
        "Stage 2": list(fm.get("Stage 2", [])),
        "Stage 3": list(fm.get("Stage 3", [])),
        "Stage 4": list(fm.get("Stage 4", [])),
    }
    m_sync = "Multicam - Sync & stack all A-Roll angles + Master Audio"
    broll_use = "Use B-Roll Footage"
    if m_sync_active and m_sync not in tasks["Stage 3"]:
        tasks["Stage 3"].append("Auto-cut to B-Cam for intimate/emotional moments (Transcript-based)")
    # Only add B-Roll overlay tasks when template is not BRoll-only (BRoll has single Stage 1 option)
    is_broll_only = len(tasks["Stage 1"]) == 1 and tasks["Stage 1"] and tasks["Stage 1"][0] == broll_use
    if broll_active and not is_broll_only:
        extra = [
            "Insert appropriate B-Roll on V2 based on context of transcript.",
            "Create separate sequence of all usable B-Roll.",
        ]
        for e in extra:
            if e not in tasks["Stage 3"]:
                tasks["Stage 3"].append(e)
    return tasks


def get_triggers_from_template(workflows_path: str, template_name: str) -> list[str]:
    """Return list of task labels that trigger UI refresh when toggled."""
    fm = get_template_frontmatter(workflows_path, template_name)
    return list(fm.get("triggers", DEFAULT_TRIGGERS))


def _strip_frontmatter_from_content(content: str) -> str:
    """Return content without the leading --- ... --- block."""
    if not content.strip().startswith('---'):
        return content
    lines = content.splitlines()
    if not lines or lines[0].strip() != '---':
        return content
    for i in range(1, len(lines)):
        if lines[i].strip() == '---':
            return '\n'.join(lines[i + 1:])
    return content


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
        md = _strip_frontmatter_from_content(md)
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
