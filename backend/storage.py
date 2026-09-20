"""
Storage & Versioning Module
Canonical JSON project persistence and multi-version architectural history:
projects/
    {project_id}/
        project.json
        versions/
            v1.json
            v2.json
            ...
"""

import os
import json
import re
from typing import List, Dict, Optional, Tuple, Any
from pathlib import Path
from models import HouseLayout

BASE_PROJECTS_DIR = Path("projects")

def get_project_dir(project_id: str) -> Path:
    p_dir = BASE_PROJECTS_DIR / project_id
    p_dir.mkdir(parents=True, exist_ok=True)
    (p_dir / "versions").mkdir(exist_ok=True)
    return p_dir


def save_project(layout: HouseLayout, project_id: Optional[str] = None) -> Tuple[str, int]:
    """
    Saves the canonical HouseLayout and creates a new immutable version snapshot.
    Returns (project_id, version_number).
    """
    pid = project_id or layout.id or "project_default"
    p_dir = get_project_dir(pid)
    
    # Determine next version number
    versions_dir = p_dir / "versions"
    existing_versions = []
    for f in versions_dir.glob("v*.json"):
        match = re.search(r"v(\d+)\.json", f.name)
        if match:
            existing_versions.append(int(match.group(1)))
            
    next_version = (max(existing_versions) + 1) if existing_versions else 1
    
    # Version file
    v_file = versions_dir / f"v{next_version}.json"
    layout_dict = layout.model_dump(mode="json")
    layout_dict["version_number"] = next_version
    
    with open(v_file, "w", encoding="utf-8") as f:
        json.dump(layout_dict, f, indent=2)
        
    # Current active project file
    cur_file = p_dir / "project.json"
    with open(cur_file, "w", encoding="utf-8") as f:
        json.dump(layout_dict, f, indent=2)
        
    return pid, next_version


def get_project(project_id: str) -> Optional[HouseLayout]:
    """
    Loads current active project design JSON.
    """
    p_dir = BASE_PROJECTS_DIR / project_id
    cur_file = p_dir / "project.json"
    if not cur_file.exists():
        return None
        
    with open(cur_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    return HouseLayout.model_validate(data)


def list_project_versions(project_id: str) -> List[Dict[str, Any]]:
    """
    Lists all saved version snapshots for a project.
    """
    p_dir = BASE_PROJECTS_DIR / project_id
    versions_dir = p_dir / "versions"
    if not versions_dir.exists():
        return []
        
    versions = []
    for f in sorted(versions_dir.glob("v*.json")):
        match = re.search(r"v(\d+)\.json", f.name)
        if match:
            v_num = int(match.group(1))
            stat = f.stat()
            try:
                with open(f, "r", encoding="utf-8") as v_f:
                    data = json.load(v_f)
                    rationale = data.get("designer_rationale", "")
                    title = data.get("title", f"Version {v_num}")
            except Exception:
                rationale = ""
                title = f"Version {v_num}"
                
            versions.append({
                "version_number": v_num,
                "file_name": f.name,
                "title": title,
                "designer_rationale": rationale,
                "timestamp": stat.st_mtime
            })
    return sorted(versions, key=lambda v: v["version_number"], reverse=True)


def restore_project_version(project_id: str, version_number: int) -> Optional[HouseLayout]:
    """
    Restores an earlier version snapshot as the current active project design.
    """
    p_dir = BASE_PROJECTS_DIR / project_id
    v_file = p_dir / "versions" / f"v{version_number}.json"
    if not v_file.exists():
        return None
        
    with open(v_file, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    cur_file = p_dir / "project.json"
    with open(cur_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        
    return HouseLayout.model_validate(data)


def undo_project_version(project_id: str) -> Optional[HouseLayout]:
    """
    Reverts to the immediately preceding version.
    """
    versions = list_project_versions(project_id)
    if len(versions) <= 1:
        return get_project(project_id)
        
    # versions are sorted reverse (highest first)
    prev_version = versions[1]["version_number"]
    return restore_project_version(project_id, prev_version)
