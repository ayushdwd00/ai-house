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
from datetime import datetime, timezone
import json
import re
import logging

from models import HouseLayout

logger = logging.getLogger(__name__)
PROJECT_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


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
    def list_projects(self, limit: int, offset: int) -> Tuple[List[Dict[str, Any]], int]:
        """Lists lightweight project metadata and total count."""
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

    def _project_dir(self, project_id: str) -> Path:
        if not PROJECT_ID_PATTERN.fullmatch(project_id):
            raise ValueError("Invalid project ID")
        base_path = self.base_dir.resolve()
        project_path = (base_path / project_id).resolve()
        if project_path.parent != base_path:
            raise ValueError("Invalid project ID")
        return project_path

    def _resolve_project_dir(self, project_id: str) -> Path:
        lookup_id = str(project_id).strip()
        if not lookup_id:
            raise ValueError("Invalid project ID")
        candidate = self._project_dir(lookup_id)
        if candidate.exists():
            return candidate
        if not self.base_dir.exists():
            return candidate
        for path in sorted(self.base_dir.iterdir(), key=lambda item: item.name):
            if not path.is_dir():
                continue
            project_file = path / "project.json"
            if not project_file.is_file():
                continue
            try:
                with project_file.open("r", encoding="utf-8") as file:
                    data = json.load(file)
            except (OSError, json.JSONDecodeError):
                continue
            if data.get("project_id") == lookup_id or data.get("id") == lookup_id:
                return path
            metadata_file = path / "metadata.json"
            if metadata_file.is_file():
                try:
                    with metadata_file.open("r", encoding="utf-8") as file:
                        metadata = json.load(file)
                except (OSError, json.JSONDecodeError):
                    continue
                if metadata.get("id") == lookup_id or metadata.get("project_id") == lookup_id:
                    return path
        return candidate

    def _get_project_dir(self, project_id: str) -> Path:
        p_dir = self._project_dir(project_id)
        p_dir.mkdir(parents=True, exist_ok=True)
        (p_dir / "versions").mkdir(exist_ok=True)
        return p_dir

    @staticmethod
    def _canonical_project_id(project_id: Optional[str], data: Optional[Dict[str, Any]] = None) -> str:
        for value in (project_id, data.get("project_id") if isinstance(data, dict) else None, data.get("id") if isinstance(data, dict) else None):
            if isinstance(value, str) and value.strip():
                return value.strip()
        return "project_default"

    def save(self, layout: HouseLayout, project_id: Optional[str] = None) -> Tuple[str, int]:
        pid = self._canonical_project_id(project_id or layout.project_id or layout.id or "project_default", layout.model_dump(mode="json"))
        if not pid:
            pid = "project_default"
        layout.id = pid
        layout.project_id = pid
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

        try:
            self._write_metadata(pid, layout_dict, cur_file)
        except OSError as error:
            logger.warning("Could not cache project metadata for %s: %s", pid, error)
        return pid, next_version

    @staticmethod
    def _metadata_from_data(project_id: str, data: Dict[str, Any], project_file: Path) -> Dict[str, Any]:
        stats = data.get("stats") or {}
        canonical_id = str(data.get("project_id") or data.get("id") or project_id or "project_default").strip() or project_id or "project_default"
        return {
            "id": canonical_id,
            "title": data.get("title") or "Residential Design",
            "updatedAt": datetime.fromtimestamp(
                project_file.stat().st_mtime, timezone.utc
            ).isoformat(),
            "areaSqft": stats.get("total_area_sqft"),
            "bedrooms": stats.get("bedroom_count"),
            "floors": data.get("num_floors", 1),
        }

    def _write_metadata(self, project_id: str, data: Dict[str, Any], project_file: Path) -> None:
        metadata = self._metadata_from_data(project_id, data, project_file)
        metadata_file = project_file.parent / "metadata.json"
        temporary_file = metadata_file.with_suffix(".json.tmp")
        with temporary_file.open("w", encoding="utf-8") as file:
            json.dump(metadata, file)
        temporary_file.replace(metadata_file)

    def get(self, project_id: str) -> Optional[HouseLayout]:
        project_dir = self._resolve_project_dir(project_id)
        cur_file = project_dir / "project.json"
        if not cur_file.exists():
            return None
        with open(cur_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        return HouseLayout.model_validate(data)

    def list_projects(self, limit: int, offset: int) -> Tuple[List[Dict[str, Any]], int]:
        if not self.base_dir.exists():
            return [], 0
        project_dirs = sorted(
            (
                path for path in self.base_dir.iterdir()
                if path.is_dir() and PROJECT_ID_PATTERN.fullmatch(path.name)
                and (path / "project.json").is_file()
            ),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
        total = len(project_dirs)
        projects: List[Dict[str, Any]] = []
        for project_dir in project_dirs[offset:offset + limit]:
            project_file = project_dir / "project.json"
            try:
                metadata_file = project_dir / "metadata.json"
                with project_file.open("r", encoding="utf-8") as file:
                    project_data = json.load(file)
                if metadata_file.is_file():
                    with metadata_file.open("r", encoding="utf-8") as file:
                        metadata = json.load(file)
                    metadata["id"] = str(project_data.get("project_id") or project_data.get("id") or metadata.get("id") or project_dir.name).strip() or project_dir.name
                    metadata["updatedAt"] = datetime.fromtimestamp(
                        project_file.stat().st_mtime, timezone.utc
                    ).isoformat()
                else:
                    canonical_id = str(project_data.get("project_id") or project_data.get("id") or project_dir.name).strip() or project_dir.name
                    metadata = self._metadata_from_data(canonical_id, project_data, project_file)
                    try:
                        self._write_metadata(canonical_id, project_data, project_file)
                    except OSError as error:
                        logger.warning("Could not cache project metadata for %s: %s", project_dir.name, error)
                projects.append(metadata)
            except (OSError, json.JSONDecodeError, AttributeError, TypeError) as error:
                logger.warning("Could not read project metadata for %s: %s", project_dir.name, error)
        return projects, total

    def list_versions(self, project_id: str) -> List[Dict[str, Any]]:
        project_dir = self._resolve_project_dir(project_id)
        versions_dir = project_dir / "versions"
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
        project_dir = self._resolve_project_dir(project_id)
        v_file = project_dir / "versions" / f"v{version_number}.json"
        if not v_file.exists():
            return None
        with open(v_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        layout = HouseLayout.model_validate(data)
        # Overwrite current active file
        cur_file = project_dir / "project.json"
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
        p_dir = self._resolve_project_dir(project_id)
        if not p_dir.exists():
            return False
        try:
            shutil.rmtree(p_dir)
            return True
        except OSError:
            logger.exception("Could not delete project %s", project_id)
            raise
