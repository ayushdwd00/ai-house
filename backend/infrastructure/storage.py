"""
Storage & Versioning Module
Delegates canonical JSON project persistence and multi-version architectural history
to the ProjectRepository abstraction while providing backward-compatible function calls.
"""

from typing import List, Dict, Optional, Tuple, Any
from pathlib import Path
from models import HouseLayout
from infrastructure.project_repository import JsonFileProjectRepository, ProjectRepository

import os
from infrastructure.supabase_repository import SupabaseProjectRepository

def _get_base_projects_dir() -> Path:
    backend_projects = Path(__file__).resolve().parent.parent / "projects"
    if backend_projects.exists():
        return backend_projects
    return Path("projects")

BASE_PROJECTS_DIR = _get_base_projects_dir()

def _init_repository() -> ProjectRepository:
    sb_url = os.getenv("SUPABASE_URL", "").strip()
    sb_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", os.getenv("SUPABASE_KEY", "")).strip()
    if sb_url and sb_key:
        return SupabaseProjectRepository(sb_url, sb_key)
    return JsonFileProjectRepository(base_dir=BASE_PROJECTS_DIR)

_default_repo: ProjectRepository = _init_repository()


def get_project_repository() -> ProjectRepository:
    """Returns the configured ProjectRepository backend."""
    return _default_repo


def save_project(layout: HouseLayout, project_id: Optional[str] = None, user_id: Optional[str] = None) -> Tuple[str, int]:
    """Saves canonical HouseLayout and creates a new immutable version snapshot."""
    return _default_repo.save(layout, project_id, user_id=user_id)


def get_project(project_id: str, user_id: Optional[str] = None) -> Optional[HouseLayout]:
    """Loads current active project design JSON."""
    return _default_repo.get(project_id, user_id=user_id)

def list_projects(limit: int = 100, offset: int = 0, user_id: Optional[str] = None) -> Tuple[List[Dict[str, Any]], int]:
    """Lists lightweight project metadata without returning HouseLayout payloads."""
    return _default_repo.list_projects(limit, offset, user_id=user_id)


def list_project_versions(project_id: str, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Lists all saved version snapshots for a project."""
    return _default_repo.list_versions(project_id, user_id=user_id)


def restore_project_version(project_id: str, version_number: int, user_id: Optional[str] = None) -> Optional[HouseLayout]:
    """Restores a past version snapshot as active."""
    return _default_repo.restore_version(project_id, version_number, user_id=user_id)


def undo_project_version(project_id: str, user_id: Optional[str] = None) -> Optional[HouseLayout]:
    """Reverts to the preceding version snapshot."""
    return _default_repo.undo(project_id, user_id=user_id)


def delete_project(project_id: str, user_id: Optional[str] = None) -> bool:
    """Permanently deletes a saved project and its version history."""
    return _default_repo.delete(project_id, user_id=user_id)
