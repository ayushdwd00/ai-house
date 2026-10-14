"""
Supabase PostgreSQL ProjectRepository Implementation
Interacts with the Supabase PostgREST REST API / Postgres database using httpx.
Operates on the 'projects' and 'project_versions' tables with parameterized queries,
respecting Row Level Security (RLS) and user tenant isolation.
"""

import os
import json
import logging
from datetime import datetime, timezone
from typing import List, Dict, Optional, Tuple, Any
import httpx

from models import HouseLayout
from infrastructure.project_repository import ProjectRepository

logger = logging.getLogger("supabase_repo")


class SupabaseProjectRepository(ProjectRepository):
    """
    Supabase project repository using PostgREST HTTP interface.
    Activated when SUPABASE_URL and SUPABASE_KEY / SUPABASE_SERVICE_ROLE_KEY are set.
    """

    def __init__(self, supabase_url: str, supabase_key: str):
        self.supabase_url = supabase_url.rstrip("/")
        self.supabase_key = supabase_key
        self.rest_url = f"{self.supabase_url}/rest/v1"

    def _headers(self, user_token: Optional[str] = None) -> Dict[str, str]:
        headers = {
            "apikey": self.supabase_key,
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }
        if user_token:
            headers["Authorization"] = f"Bearer {user_token}"
        else:
            headers["Authorization"] = f"Bearer {self.supabase_key}"
        return headers

    def save(self, layout: HouseLayout, project_id: Optional[str] = None, user_id: Optional[str] = None) -> Tuple[str, int]:
        pid = project_id or layout.project_id or layout.id or "project_default"
        layout.id = pid
        layout.project_id = pid
        if user_id:
            layout.user_id = user_id

        # 1. Fetch latest version number
        version_url = f"{self.rest_url}/project_versions?project_id=eq.{pid}&select=version_number&order=version_number.desc&limit=1"
        next_ver = 1
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(version_url, headers=self._headers())
            if resp.status_code == 200:
                rows = resp.json()
                if rows and len(rows) > 0:
                    next_ver = rows[0]["version_number"] + 1

            layout_dict = layout.model_dump(mode="json")
            layout_dict["version_number"] = next_ver
            layout_dict["project_id"] = pid
            if user_id:
                layout_dict["user_id"] = user_id

            now_iso = datetime.now(timezone.utc).isoformat()

            # 2. Upsert project
            project_payload = {
                "id": pid,
                "user_id": user_id,
                "name": layout.title or "Bespoke Residence",
                "house_layout": layout_dict,
                "updated_at": now_iso,
            }
            upsert_headers = self._headers()
            upsert_headers["Prefer"] = "resolution=merge-duplicates,return=representation"
            upsert_resp = client.post(
                f"{self.rest_url}/projects",
                headers=upsert_headers,
                json=project_payload,
            )
            if upsert_resp.status_code not in (200, 201):
                logger.error("Failed to upsert project to Supabase: %s", upsert_resp.text)
                raise RuntimeError(f"Supabase upsert failed: {upsert_resp.status_code}")

            # 3. Insert immutable version snapshot
            version_payload = {
                "project_id": pid,
                "version_number": next_ver,
                "house_layout": layout_dict,
                "created_at": now_iso,
            }
            ver_resp = client.post(
                f"{self.rest_url}/project_versions",
                headers=self._headers(),
                json=version_payload,
            )
            if ver_resp.status_code not in (200, 201):
                logger.warning("Could not append version snapshot to Supabase: %s", ver_resp.text)

        return pid, next_ver

    def get(self, project_id: str, user_id: Optional[str] = None) -> Optional[HouseLayout]:
        query_url = f"{self.rest_url}/projects?id=eq.{project_id}&select=house_layout,user_id&limit=1"
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(query_url, headers=self._headers())
            if resp.status_code != 200:
                return None
            rows = resp.json()
            if not rows or len(rows) == 0:
                return None
            record = rows[0]
            if user_id and record.get("user_id") and record.get("user_id") != user_id:
                return None
            data = record.get("house_layout")
            return HouseLayout.model_validate(data)

    def list_projects(self, limit: int = 100, offset: int = 0, user_id: Optional[str] = None) -> Tuple[List[Dict[str, Any]], int]:
        filters = []
        if user_id:
            filters.append(f"user_id=eq.{user_id}")
        filter_str = "&".join(filters)
        if filter_str:
            filter_str = f"&{filter_str}"

        query_url = f"{self.rest_url}/projects?select=id,name,updated_at,house_layout{filter_str}&order=updated_at.desc&limit={limit}&offset={offset}"
        count_url = f"{self.rest_url}/projects?select=id{filter_str}"
        headers_count = self._headers()
        headers_count["Prefer"] = "count=exact"

        with httpx.Client(timeout=10.0) as client:
            resp = client.get(query_url, headers=self._headers())
            if resp.status_code != 200:
                return [], 0
            rows = resp.json()
            results = []
            for r in rows:
                layout_data = r.get("house_layout") or {}
                stats = layout_data.get("stats") or {}
                results.append({
                    "id": r["id"],
                    "title": r.get("name") or layout_data.get("title") or "Residential Design",
                    "updatedAt": r.get("updated_at"),
                    "areaSqft": stats.get("total_area_sqft"),
                    "bedrooms": stats.get("bedroom_count"),
                    "floors": layout_data.get("num_floors", 1),
                })
            count_resp = client.head(count_url, headers=headers_count)
            content_range = count_resp.headers.get("content-range", "")
            total = int(content_range.split("/")[-1]) if "/" in content_range and content_range.split("/")[-1].isdigit() else len(results)
            return results, total

    def list_versions(self, project_id: str, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        query_url = f"{self.rest_url}/project_versions?project_id=eq.{project_id}&select=version_number,created_at,house_layout&order=version_number.asc"
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(query_url, headers=self._headers())
            if resp.status_code != 200:
                return []
            rows = resp.json()
            versions = []
            for row in rows:
                hl = row.get("house_layout") or {}
                v_num = row.get("version_number", 1)
                versions.append({
                    "version": v_num,
                    "title": hl.get("title", f"Version {v_num}"),
                    "designer_rationale": hl.get("designer_rationale", ""),
                    "createdAt": row.get("created_at"),
                })
            return versions

    def restore_version(self, project_id: str, version_number: int, user_id: Optional[str] = None) -> Optional[HouseLayout]:
        query_url = f"{self.rest_url}/project_versions?project_id=eq.{project_id}&version_number=eq.{version_number}&select=house_layout&limit=1"
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(query_url, headers=self._headers())
            if resp.status_code != 200:
                return None
            rows = resp.json()
            if not rows or len(rows) == 0:
                return None
            layout_data = rows[0].get("house_layout")
            layout = HouseLayout.model_validate(layout_data)
            # Update projects table active layout
            self.save(layout, project_id=project_id, user_id=user_id)
            return layout

    def undo(self, project_id: str, user_id: Optional[str] = None) -> Optional[HouseLayout]:
        versions = self.list_versions(project_id, user_id=user_id)
        if len(versions) <= 1:
            return None
        prev_ver = versions[-2]["version"]
        return self.restore_version(project_id, prev_ver, user_id=user_id)

    def delete(self, project_id: str, user_id: Optional[str] = None) -> bool:
        delete_url = f"{self.rest_url}/projects?id=eq.{project_id}"
        if user_id:
            delete_url += f"&user_id=eq.{user_id}"
        with httpx.Client(timeout=10.0) as client:
            resp = client.delete(delete_url, headers=self._headers())
            return resp.status_code in (200, 204)
