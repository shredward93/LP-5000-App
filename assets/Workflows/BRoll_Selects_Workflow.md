---
Stage 1:
  - "Use B-Roll Footage"
Stage 2:
  - "Transcribe Master Audio ONLY (Ignore Vision/Other Cams)"
  - "Give me a transcript summary"
  - "Analyze B-Roll Vision (Low-Token Mode / Fast)"
  - "Analyze B-Roll Vision (Normal-Token Mode / Detailed)"
  - "Analyze B-Roll Vision (High-Token Mode / Max Detail)"
Stage 3:
  - "Categorize B-Roll Based on Guidelines (Token-Heavy / Detailed Sort)"
  - "Build Separate XML Sequences per Category"
  - "Build Single Master Selects Stringout XML"
Stage 4:
  - "Export Final XML to ./03_Edit/XML_Exports"
  - "Export Final Transcripts as .txt to ./03_Edit/Transcripts"
triggers:
  - "Use B-Roll Footage"
---

# 🎬 PROJECT: {{Client or Project Name}} B-Roll Selects
**Status:** Active
**Workflow Type:** B-Roll Sifting & Categorization

## 🎨 CREATIVE GUIDELINES
- **Target Categories to Find:** {{Target Categories (e.g., Drone, Smiling, Action)}}
- **Target Clip Length:** {{Average length of each B-roll clip (e.g., 3-5s)}}
- **Sequence Setup:** {{Sequence Setup (e.g., Separate XMLs per category vs Master Stringout)}}
- **Pause & Resume Protocol:** If instructed to 'Pause for User Review,' you must stop and wait for the user's input. You MUST internally save the remaining tasks from the original command. When the user approves the clips, you must automatically resume and execute the remaining tasks without needing further instruction.

## 📂 FOLDER ROLES
- **B-Roll:** ./01_Footage/B-Roll
- **Edit/XML:** ./03_Edit/XML_Exports
