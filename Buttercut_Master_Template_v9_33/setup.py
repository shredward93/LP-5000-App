import os
import shutil

def build_buttercut_environment():
    # --- THE PATHFINDER UPGRADE ---
    script_dir = os.path.dirname(os.path.abspath(__file__))
    # V9.33 UPDATE: Versioned output folder!
    base_dir = os.path.join(script_dir, "Buttercut_Master_Template_v9_33")
    
    # 1. Build the Full Folder Tree
    folders = [
        "01_Footage/A-Roll/Cam_A",
        "01_Footage/A-Roll/Cam_B",
        "01_Footage/A-Roll/Cam_C",
        "01_Footage/A-Roll/Cam_D",
        "01_Footage/B-Roll/Gimbal",
        "01_Footage/B-Roll/Drone",
        "02_Audio/Ext_Audio",
        "02_Audio/Music",
        "03_Edit/Resolve_Projects",
        "03_Edit/XML_Exports",
        "03_Edit/Transcripts",
        "04_Graphics/Lower_Thirds",
        "05_VFX/After_Effects_Comps",
        "06_Preview/FrameIO_Exports",
        "07_Master/High_Res_ProRes"
    ]
    for folder in folders: os.makedirs(os.path.join(base_dir, folder), exist_ok=True)

    # 2. Automated Logo Sync
    source_logo = os.path.join(script_dir, "claude assets", "LP AI VIDEO EDITOR logo.png")
    dest_logo = os.path.join(base_dir, "assets", "LP AI VIDEO EDITOR logo.png")
    
    if os.path.exists(source_logo):
        try:
            shutil.copy(source_logo, dest_logo)
        except: pass
            
    print("✅ Final Master Template v9.33 Built! (The Scroll & Sort Update Active)")

if __name__ == "__main__": build_buttercut_environment()