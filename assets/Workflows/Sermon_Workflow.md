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
  - "Find 30-60s Social Clips (Pause for User Review)"
  - "Find 60-120s Social Clips (Pause for User Review)"
Stage 4:
  - "Export Final XML to ./03_Edit/XML_Exports"
  - "Export Final Transcripts as .txt to ./03_Edit/Transcripts"
triggers:
  - "Multicam - Sync & stack all A-Roll angles + Master Audio"
  - "Use B-Roll Footage"
---

# 🎬 PROJECT: {{Sermon Title or Date}}
**Status:** Active
**Workflow Type:** Social Media Clip Extraction

## 🎨 CREATIVE GUIDELINES
- **Core Objective:** Find punchy, engaging clips for social media.
- **Quantity:** Find exactly {{Target Number of Clips}} clip options for review.
- **Vibe/Tone:** {{Overall Tone}}
- **Editing Style:** Franken-biting is highly encouraged to remove filler words and build more context when needed. Mark all internal cuts with [CUT].
- **Pause & Resume Protocol:** If instructed to 'Pause for User Review,' you must stop and wait for the user's input. You MUST internally save the remaining tasks from the original command. When the user approves the clips, you must automatically resume and execute the remaining tasks without needing further instruction.

## 📂 FOLDER ROLES
- **A-Roll:** ./01_Footage/A-Roll
- **Edit/XML:** ./03_Edit/XML_Exports
- **Transcripts:** ./03_Edit/Transcripts
