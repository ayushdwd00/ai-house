"""
Project Repository Abstraction Module
Defines an abstract ProjectRepository interface for persisting and versioning
HouseLayout project entities, with a concrete JsonFileProjectRepository implementation
backed by the local filesystem.
Enables pluggable database backends (e.g. PostgreSQL, Supabase, MongoDB) in production.
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Optional, Tuple, Any
from pathlib import Path
import json
import re

from models import HouseLayout


class ProjectRepository(ABC):
    """Abstract interface for HouseLayout persistence and version snapshots."""

    @abstractmethod
    def save(self, layout: HouseLayout, project_id: Optional[str] = None) -> Tuple[str, int]:
        """Saves current state and appends an immutable version snapshot. Returns (project_id, version_number)."""
        pass

    @abstractmethod
    def get(self, project_id: str) -> Optional[HouseLayout]:
        """Retrieves active project layout."""
        pass

    @abstractmethod
    def list_versions(self, project_id: str) -> List[Dict[str, Any]]:
        """Lists saved version snapshots with metadata."""
        pass

    @abstractmethod
    def restore_version(self, project_id: str, version_number: int) -> Optional[HouseLayout]:
        """Restores a past version snapshot as active."""
        pass

    @abstractmethod
    def undo(self, project_id: str) -> Optional[HouseLayout]:
        """Reverts to preceding version snapshot."""
        pass

    @abstractmethod
    def delete(self, project_id: str) -> bool:
        """Deletes project and its version history from repository."""
        pass


class JsonFileProjectRepository(ProjectRepository):
    """Local filesystem JSON implementation storing projects under projects/{project_id}/"""

    def __init__(self, base_dir: Path = Path("projects")):
        self.base_dir = base_dir

    def _get_project_dir(self, project_id: str) -> Path:
        p_dir = self.base_dir / project_id
        p_dir.mkdir(parents=True, exist_ok=True)
        (p_dir / "versions").mkdir(exist_ok=True)
        return p_dir

    def save(self, layout: HouseLayout, project_id: Optional[str] = None) -> Tuple[str, int]:
        pid = project_id or layout.project_id or layout.id or "project_default"
        p_dir = self._get_project_dir(pid)
        versions_dir = p_dir / "versions"

        existing_versions = []
        for f in versions_dir.glob("v*.json"):
            match = re.search(r"v(\d+)\.json", f.name)
            if match:
                existing_versions.append(int(match.group(1)))

        next_version = (max(existing_versions) + 1) if existing_versions else 1

        layout_dict = layout.model_dump(mode="json")
        layout_dict["version_number"] = next_version
        layout_dict["project_id"] = pid

        v_file = versions_dir / f"v{next_version}.json"
        with open(v_file, "w", encoding="utf-8") as f:
            json.dump(layout_dict, f, indent=2)

        cur_file = p_dir / "project.json"
        with open(cur_file, "w", encoding="utf-8") as f:
            json.dump(layout_dict, f, indent=2)

        return pid, next_version

    def get(self, project_id: str) -> Optional[HouseLayout]:
        cur_file = self.base_dir / project_id / "project.json"
        if not cur_file.exists():
            return None
        with open(cur_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        return HouseLayout.model_validate(data)

    def list_versions(self, project_id: str) -> List[Dict[str, Any]]:
        versions_dir = self.base_dir / project_id / "versions"
        if not versions_dir.exists():
            return []

        versions = []
        for f in sorted(versions_dir.glob("v*.json")):
            match = re.search(r"v(\d+)\.json", f.name)
            if match:
                v_num = int(match.group(1))
                try:
                    with open(f, "r", encoding="utf-8") as v_f:
                        data = json.load(v_f)
                        rationale = data.get("designer_rationale", "")
                        title = data.get("title", f"Version {v_num}")
                except Exception:
                    rationale = ""
                    title = f"Version {v_num}"

                versions.append({
                    "version": v_num,
                    "file": f.name,
                    "title": title,
                    "designer_rationale": rationale
                })
        return versions

    def restore_version(self, project_id: str, version_number: int) -> Optional[HouseLayout]:
        v_file = self.base_dir / project_id / "versions" / f"v{version_number}.json"
        if not v_file.exists():
            return None
        with open(v_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        layout = HouseLayout.model_validate(data)
        # Overwrite current active file
        cur_file = self.base_dir / project_id / "project.json"
        with open(cur_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        return layout

    def undo(self, project_id: str) -> Optional[HouseLayout]:
        versions = self.list_versions(project_id)
        if len(versions) <= 1:
            return None
        prev_ver = versions[-2]["version"]
        return self.restore_version(project_id, prev_ver)

    def delete(self, project_id: str) -> bool:
        import shutil
        p_dir = self.base_dir / project_id
        if p_dir.exists():
            try:
                shutil.rmtree(p_dir)
                return True
            except Exception as e:
                print(f"[STORAGE ERROR] Could not delete project {project_id}: {e}")
                return False
        return False
