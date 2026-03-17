# How to Create a Workflow File

Workflow files define what the LP 5000 GUI shows: which **stages and tasks** appear in Stages 1–4, which **fields** appear in Source Blueprint & Preferences, and what **instructions** end up in `CLAUDE.md`. Add a new `.md` file here and it will appear in the workflow dropdown.

---

## File location and name

- **Location:** `assets/Workflows/`
- **Format:** Markdown (`.md`)
- **Name:** Any descriptive name (e.g. `My_Workflow.md`). The filename is what users see in the dropdown (without path).

---

## Structure

A workflow file has two parts:

1. **Frontmatter** (YAML between `---` lines) — drives **Stages 1–4** and **triggers** in the GUI.
2. **Body** (Markdown below the second `---`) — drives **Source Blueprint fields** and the **content of CLAUDE.md** (after tag replacement).

---

## 1. Frontmatter (Stages and triggers)

Frontmatter must be at the **very top** of the file, between two lines that contain only `---`.

### Required: Stage 1–4

Each of `Stage 1`, `Stage 2`, `Stage 3`, and `Stage 4` is a **list of task labels**. These are the exact strings shown as checkboxes in the GUI. Order is preserved.

```yaml
---
Stage 1:
  - "Use A-Roll Footage"
  - "Use B-Roll Footage"
  - "Multicam - Sync & stack all A-Roll angles + Master Audio"
Stage 2:
  - "Transcribe Master Audio ONLY (Ignore Vision/Other Cams)"
  - "Give me a transcript summary"
  - "Analyze B-Roll Vision (Low-Token Mode / Fast)"
  - "Analyze B-Roll Vision (Normal-Token Mode / Detailed)"
  - "Analyze B-Roll Vision (High-Token Mode / Max Detail)"
Stage 3:
  - "Franken-bite & Remove Dead Space"
  - "Build Narrative Paper Edit"
Stage 4:
  - "Export Final XML to ./03_Edit/XML_Exports"
  - "Export Final Transcripts as .txt to ./03_Edit/Transcripts"
triggers:
  - "Multicam - Sync & stack all A-Roll angles + Master Audio"
  - "Use B-Roll Footage"
---
```

- Use **double quotes** around task labels that contain colons, commas, or special characters.
- You can copy task strings from existing workflows or define your own; the engine uses these strings as-is for the run prompt.

### Optional: triggers

- **`triggers`** is a list of **task labels** that, when the user toggles them, cause the GUI to **refresh** (so the stage list can change).
- If you omit `triggers`, the engine uses a default (the two common options: Multicam sync and Use B-Roll Footage).
- List only the labels that should trigger a refresh (e.g. the ones that add or remove other tasks when checked).

---

## 2. Body (Blueprint fields and CLAUDE.md content)

Everything **after** the closing `---` is the **body**. It is used in two ways:

1. **`{{tag name}}` placeholders** — Every `{{...}}` in the body becomes a **field** in the Source Blueprint & Preferences pane. The text inside the braces is the **label** (e.g. `{{Client or Project Name}}` → label “Client or Project Name:”). The user’s input is stored and then substituted back into this content when building `CLAUDE.md`.
2. **CLAUDE.md** — When the user runs **Compile & Execute**, the body is written into `CLAUDE.md` with all `{{tag name}}` replaced by the values from the form. The frontmatter block is **not** written to `CLAUDE.md`.

### Placeholder rules

- **Syntax:** `{{Tag Name}}` — double curly braces, any text inside (spaces and punctuation are fine).
- **Unique names:** Each distinct `{{...}}` name becomes one field. Reuse the same name in multiple places if you want one field to fill several spots.
- **Where to use them:** Put placeholders anywhere in the body (headings, bullet points, paragraphs). They are replaced when generating `CLAUDE.md`.

### Example body

```markdown
# 🎬 PROJECT: {{Client or Project Name}}
**Status:** Active

## 🎨 CREATIVE GUIDELINES
- **Main Objective:** {{Primary Goal of the Video}}
- **Pacing & Style:** {{Pacing and Visual Style Notes}}

## 📂 FOLDER ROLES
- **Footage:** ./01_Footage
- **Edit/XML:** ./03_Edit/XML_Exports
```

Here the GUI would show three fields: **Client or Project Name**, **Primary Goal of the Video**, and **Pacing and Visual Style Notes**.

---

## Minimal workflow example

Save as e.g. `assets/Workflows/My_Workflow.md`:

```markdown
---
Stage 1:
  - "Use A-Roll Footage"
Stage 2:
  - "Give me a transcript summary"
Stage 3:
  - "Build Narrative Paper Edit"
Stage 4:
  - "Export Final XML to ./03_Edit/XML_Exports"
---

# 🎬 PROJECT: {{Project Name}}

## 🎨 GUIDELINES
- **Goal:** {{Goal}}
- **Pause & Resume Protocol:** If instructed to 'Pause for User Review,' stop and wait for the user. Save remaining tasks and resume when they approve.

## 📂 FOLDER ROLES
- **Footage:** ./01_Footage
- **Edit/XML:** ./03_Edit/XML_Exports
```

This gives you one task per stage, two Source Blueprint fields (Project Name and Goal), and a short CLAUDE.md. Use the existing workflow files in this folder as full references.

---

## Summary

| Part           | Purpose |
|----------------|--------|
| **Frontmatter** | Defines Stage 1–4 task lists and (optionally) which tasks trigger a GUI refresh. |
| **Body**        | Defines Source Blueprint fields via `{{tag name}}` and the text that goes into `CLAUDE.md` after substitution. |
| **Filename**    | Shown in the workflow dropdown; no path, just the `.md` name. |

After adding or editing a workflow file, restart or refresh the LP 5000 app so the new workflow appears in the list.
