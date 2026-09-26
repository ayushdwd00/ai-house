"""
Storage & Versioning Module
Delegates canonical JSON project persistence and multi-version architectural history
to the ProjectRepository abstraction while providing backward-compatible function calls.
"""

from typing import List, Dict, Optional, Tuple, Any
from pathlib import Path
from models import HouseLayout
from infrastructure.project_repository import JsonFileProjectRepository, ProjectRepository

BASE_PROJECTS_DIR = Path("projects")
_default_repo: ProjectRepository = JsonFileProjectRepository(base_dir=BASE_PROJECTS_DIR)


def get_project_repository() -> ProjectRepository:
    """Returns the configured ProjectRepository backend."""
    return _default_repo


def save_project(layout: HouseLayout, project_id: Optional[str] = None) -> Tuple[str, int]:
    """Saves canonical HouseLayout and creates a new immutable version snapshot."""
    return _default_repo.save(layout, project_id)


def get_project(project_id: str) -> Optional[HouseLayout]:
    """Loads current active project design JSON."""
    return _default_repo.get(project_id)


def list_project_versions(project_id: str) -> List[Dict[str, Any]]:
    """Lists all saved version snapshots for a project."""
    return _default_repo.list_versions(project_id)


def restore_project_version(project_id: str, version_number: int) -> Optional[HouseLayout]:
    """Restores a past version snapshot as active."""
    return _default_repo.restore_version(project_id, version_number)


def undo_project_version(project_id: str) -> Optional[HouseLayout]:
    """Reverts to the preceding version snapshot."""
    return _default_repo.undo(project_id)


def delete_project(project_id: str) -> bool:
    """Permanently deletes a saved project and its version history."""
    return _default_repo.delete(project_id)
