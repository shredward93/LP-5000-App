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
  - "Apply Rhythmic B-Roll Overlay (Wedding Style)"
  - "Perform Emotional Story Sweep"
Stage 4:
  - "Export Final XML to ./03_Edit/XML_Exports"
  - "Export Final Transcripts as .txt to ./03_Edit/Transcripts"
triggers:
  - "Multicam - Sync & stack all A-Roll angles + Master Audio"
  - "Use B-Roll Footage"
---

# 🎬 PROJECT: {{Couple's Names}} Wedding Highlight
**Status:** Active
**Workflow Type:** Cinematic Multicam Assembly

## 🎨 CREATIVE GUIDELINES
- **Core Emotion:** {{Core Emotion}}
- **Pacing:** Rhythmic and dynamic. Keep B-roll cuts between {{B-Roll Cut Duration}}.
- **Pause & Resume Protocol:** If instructed to 'Pause for User Review,' you must stop and wait for the user's input. You MUST internally save the remaining tasks from the original command. When the user approves the clips, you must automatically resume and execute the remaining tasks without needing further instruction.

## 📂 FOLDER ROLES
- **A-Roll:** ./01_Footage/A-Roll
- **B-Roll:** ./01_Footage/B-Roll
- **Edit/XML:** ./03_Edit/XML_Exports
