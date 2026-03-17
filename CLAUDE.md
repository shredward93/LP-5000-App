# PROJECT: 
## 🎨 GUIDELINES
- Pause & Resume Protocol: Wait for approval. Remember tasks.


## 🌍 PROJECT CONFIG
- Vibe: Cinematic & Emotional
- Pacing: Moderate
- Master Audio Source: A-Roll (Cam A)
- **Audio Protocol:** Lock Track A1 to Master Audio. Place B-Roll Nat on A2. NEVER switch A1 source during multicam cuts. A2 should match B-roll content.
- **Library Landmark:** Your source of truth is `library.yaml`. Because the BUTTERCUT_PROJECT_DIR environment variable is enforced, this file will ALWAYS be generated and located strictly inside the `libraries/` directory within the current project root. DO NOT look inside the global Buttercut gem folder.
- **Global Rules:** Extract true SMPTE timecode. No 0-base anchoring. Use Telegraphic visual transcripts. Pause for Sync Map review and take note of remaining tasks. ALWAYS export timelines using the FCP7 XML standard (.xml / <xmeml> format) for DaVinci Resolve compatibility. NEVER export as FCPXML (.fcpxml).