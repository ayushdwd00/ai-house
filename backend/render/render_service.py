import os
import sys
import json
import uuid
import shutil
import base64
import tempfile
import subprocess
from typing import Optional, Dict, Any, Tuple

def find_blender_executable() -> Optional[str]:
    """
    Locates the Blender executable on Windows, Linux, or macOS.
    Detection order:
    1. BLENDER_PATH environment variable override (if set and valid).
    2. System PATH via shutil.which('blender').
    3. Common Windows installation paths and Windows Registry App Paths.
    4. macOS / Linux standard paths.
    """
    # 1. Environment variable override from .env or os.environ
    env_path = os.getenv("BLENDER_PATH", "").strip().strip('"').strip("'")
    if env_path and (os.path.isfile(env_path) or (os.path.exists(env_path) and os.access(env_path, os.X_OK))):
        return env_path
        
    # 2. System PATH
    in_path = shutil.which("blender")
    if in_path and (os.path.isfile(in_path) or os.path.exists(in_path)):
        return in_path
        
    # 3. Windows Common Installation Paths & Registry
    if sys.platform == "win32":
        # Check Windows Registry App Paths
        try:
            import winreg
            for hkey in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
                try:
                    with winreg.OpenKey(hkey, r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\blender.exe") as key:
                        val, _ = winreg.QueryValueEx(key, "")
                        if val and os.path.isfile(val):
                            return val
                except OSError:
                    pass
        except ImportError:
            pass

        search_dirs = [
            r"C:\Program Files\Blender Foundation",
            r"C:\Program Files\Blender",
            r"C:\Program Files (x86)\Blender Foundation",
            r"C:\Program Files (x86)\Blender",
            os.path.expandvars(r"%LOCALAPPDATA%\Programs\Blender Foundation"),
            os.path.expandvars(r"%LOCALAPPDATA%\Programs\Blender"),
            os.path.expandvars(r"%ProgramW6432%\Blender Foundation"),
            os.path.expandvars(r"%ProgramFiles%\Blender Foundation")
        ]
        for base_dir in search_dirs:
            if os.path.exists(base_dir):
                # Check root of folder or nested version folders (e.g. Blender 4.5, Blender 4.4, etc.)
                direct_exe = os.path.join(base_dir, "blender.exe")
                if os.path.isfile(direct_exe):
                    return direct_exe
                for root, dirs, files in os.walk(base_dir):
                    if "blender.exe" in files:
                        candidate = os.path.join(root, "blender.exe")
                        if os.path.isfile(candidate):
                            return candidate
                            
    # 4. macOS Common Paths
    elif sys.platform == "darwin":
        mac_paths = [
            "/Applications/Blender.app/Contents/MacOS/Blender",
            os.path.expanduser("~/Applications/Blender.app/Contents/MacOS/Blender")
        ]
        for p in mac_paths:
            if os.path.isfile(p):
                return p
                
    # 5. Linux Common Paths
    else:
        linux_paths = [
            "/usr/bin/blender",
            "/usr/local/bin/blender",
            "/snap/bin/blender"
        ]
        for p in linux_paths:
            if os.path.isfile(p) or (os.path.exists(p) and os.access(p, os.X_OK)):
                return p
                
    return None

def check_blender_status() -> Dict[str, Any]:
    blender_path = find_blender_executable()
    if blender_path:
        return {
            "available": True,
            "path": blender_path,
            "message": "Blender is available and ready for realistic rendering."
        }
    return {
        "available": False,
        "path": None,
        "message": "Blender is not detected on the backend system.",
        "instructions": (
            "To enable realistic Cycles rendering, install Blender (v3.6+) from https://www.blender.org/download/ "
            "and add it to your PATH, or set the BLENDER_PATH environment variable in your .env file."
        )
    }

def render_layout_realistic(
    layout_data: Dict[str, Any],
    cutaway: bool = True,
    resolution: str = "1920x1080",
    samples: int = 64,
    lighting: str = "day"
) -> Dict[str, Any]:
    """
    Executes headless Blender Cycles rendering for the given canonical HouseLayout.
    """
    blender_path = find_blender_executable()
    if not blender_path:
        status_info = check_blender_status()
        return {
            "status": "blender_not_installed",
            "available": False,
            "message": status_info["message"],
            "instructions": status_info["instructions"]
        }
        
    script_path = os.path.join(os.path.dirname(__file__), "blender_render.py")
    if not os.path.exists(script_path):
        return {
            "status": "error",
            "available": True,
            "message": f"Blender render script missing at {script_path}"
        }
        
    temp_dir = tempfile.mkdtemp(prefix="ai_house_render_")
    layout_file = os.path.join(temp_dir, "layout.json")
    output_file = os.path.join(temp_dir, f"render_{uuid.uuid4().hex[:8]}.png")
    
    try:
        # Write layout JSON
        with open(layout_file, "w", encoding="utf-8") as f:
            json.dump(layout_data, f, ensure_ascii=False)
            
        cmd = [
            blender_path,
            "--background",
            "--python", script_path,
            "--",
            "--layout", layout_file,
            "--output", output_file,
            "--resolution", resolution,
            "--samples", str(samples),
            "--lighting", lighting
        ]
        if cutaway:
            cmd.append("--cutaway")
            
        print(f"[RENDER SERVICE] Running: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        
        if result.returncode != 0:
            print(f"[RENDER SERVICE ERROR] Blender failed: {result.stderr}")
            return {
                "status": "error",
                "available": True,
                "message": f"Blender rendering process failed with code {result.returncode}",
                "details": result.stderr[-1000:] if result.stderr else result.stdout[-1000:]
            }
            
        if not os.path.exists(output_file):
            return {
                "status": "error",
                "available": True,
                "message": "Blender finished but the output image file was not created.",
                "details": result.stdout[-1000:]
            }
            
        # Read rendered image and convert to base64
        with open(output_file, "rb") as img_f:
            b64_img = base64.b64encode(img_f.read()).decode("ascii")
            
        return {
            "status": "success",
            "available": True,
            "image_base64": f"data:image/png;base64,{b64_img}",
            "resolution": resolution,
            "samples": samples,
            "cutaway": cutaway,
            "lighting": lighting,
            "engine": "Cycles",
            "message": "Realistic photo render completed successfully."
        }
        
    except subprocess.TimeoutExpired:
        return {
            "status": "timeout",
            "available": True,
            "message": "Blender rendering exceeded the 3-minute time limit."
        }
    except Exception as e:
        return {
            "status": "error",
            "available": True,
            "message": f"Unexpected error during render execution: {str(e)}"
        }
    finally:
        # Clean up temporary files
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception:
            pass
