import json
import time

from fastapi.testclient import TestClient
import main
from models import HouseLayout
from infrastructure.project_repository import JsonFileProjectRepository

client = TestClient(main.app)

def test_health_endpoint():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert "service" in data

def test_synchronous_generate():
    payload = {
        "plot_width": 30.0,
        "plot_length": 40.0,
        "bedrooms": 2,
        "road_side": "north"
    }
    project_id = None
    try:
        res = client.post("/api/generate", json=payload)
        assert res.status_code == 200
        data = res.json()
        project_id = data["id"]
        assert "rooms" in data
        assert len(data["rooms"]) > 0
    finally:
        if project_id:
            assert client.delete(f"/api/projects/{project_id}").status_code == 200

def test_create_generate_validate_and_plan_flow():
    payload = {
        "plot_width": 30.0,
        "plot_length": 40.0,
        "bedrooms": 2,
        "bathrooms": 2.0,
        "road_side": "north",
    }
    project_id = None
    try:
        generated = client.post("/api/generate", json=payload)
        assert generated.status_code == 200, generated.text
        layout = generated.json()
        project_id = layout["id"]
        assert layout["rooms"] and layout["floors"] and layout["site"]

        created = client.post("/api/projects", json=layout)
        assert created.status_code == 200, created.text
        retrieved = client.get(f"/api/projects/{project_id}")
        assert retrieved.status_code == 200, retrieved.text
        canonical_layout = retrieved.json()

        validation = client.post("/api/validate", json=canonical_layout)
        assert validation.status_code == 200, validation.text
        assert validation.json()["is_valid"]

        plan = client.post("/api/mep/plan", json=canonical_layout)
        assert plan.status_code == 200, plan.text
        planned_layout = plan.json()
        assert planned_layout["id"] == project_id
        assert planned_layout["mep_plan"] is not None
    finally:
        if project_id:
            deleted = client.delete(f"/api/projects/{project_id}")
            assert deleted.status_code == 200, deleted.text
            assert deleted.json() == {"success": True, "project_id": project_id}
            assert client.get(f"/api/projects/{project_id}").status_code == 404

def test_async_job_polling_flow():
    payload = {
        "plot_width": 30.0,
        "plot_length": 40.0,
        "bedrooms": 2,
        "road_side": "north"
    }
    # 1. Start async job
    headers = {"Idempotency-Key": "api-test-async-generation"}
    res = client.post("/api/generate?async_job=true", json=payload, headers=headers)
    assert res.status_code == 202
    job_info = res.json()
    assert "job_id" in job_info
    job_id = job_info["job_id"]

    duplicate = client.post("/api/generate?async_job=true", json=payload, headers=headers)
    assert duplicate.status_code == 202
    assert duplicate.json()["job_id"] == job_id
    
    # 2. Poll until the worker reaches a terminal state.
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        poll_res = client.get(f"/api/jobs/{job_id}")
        assert poll_res.status_code == 200
        poll_data = poll_res.json()
        assert poll_data["job_id"] == job_id
        assert poll_data["status"] in ["queued", "processing", "completed", "failed"]
        if poll_data["status"] in ["completed", "failed"]:
            break
        time.sleep(0.1)
    assert poll_data["status"] == "completed", poll_data
    assert poll_data["completed_stages"] == [
        "understanding", "planning", "solving", "validating", "rendering"
    ]
    assert poll_data["result"]["rooms"]
    assert poll_data["project_id"] == poll_data["result"]["id"]
    assert client.get(f"/api/projects/{poll_data['project_id']}").status_code == 200
    assert client.delete(f"/api/projects/{poll_data['project_id']}").status_code == 200
    assert client.get(f"/api/jobs/{job_id}").status_code == 404


def test_projects_list_returns_lightweight_metadata(tmp_path):
    repository = JsonFileProjectRepository(tmp_path)
    project_dir = tmp_path / "fixture_project"
    project_dir.mkdir()
    (project_dir / "project.json").write_text(
        '{"id":"fixture_project","title":"Fixture Home","num_floors":2,'
        '"stats":{"total_area_sqft":1800,"bedroom_count":3},"rooms":[{"id":"large"}]}',
        encoding="utf-8",
    )

    projects, total = repository.list_projects(limit=10, offset=0)

    assert total == 1
    assert projects[0]["id"] == "fixture_project"
    assert projects[0]["title"] == "Fixture Home"
    assert projects[0]["areaSqft"] == 1800
    assert projects[0]["bedrooms"] == 3
    assert projects[0]["floors"] == 2
    assert "rooms" not in projects[0]
    assert (project_dir / "metadata.json").is_file()


def test_projects_list_api_paginates_metadata(monkeypatch):
    item = {"id": "fixture", "title": "Fixture", "updatedAt": "2026-10-01T00:00:00+00:00"}
    monkeypatch.setattr(main, "list_projects", lambda limit, offset: ([item], 7))

    response = client.get("/api/projects?limit=5&offset=2")

    assert response.status_code == 200
    assert response.json() == {"projects": [item], "total": 7, "limit": 5, "offset": 2}
    assert "rooms" not in response.json()["projects"][0]


def test_project_repository_resolves_mismatched_project_ids(tmp_path):
    repository = JsonFileProjectRepository(tmp_path)
    project_dir = tmp_path / "legacy_directory_name"
    project_dir.mkdir()
    layout = HouseLayout(
        id="canonical_project_id",
        title="Canonical Project",
        designer_rationale="Test project",
        plot_width=30,
        plot_length=40,
        stats={
            "total_area_sqft": 1200,
            "living_area_sqft": 900,
            "width_ft": 30,
            "length_ft": 40,
            "num_floors": 1,
            "bedroom_count": 2,
            "bathroom_count": 2.0,
            "aspect_ratio": 1.33,
        },
        rooms=[],
        floors=[],
        walls=[],
        exterior_walls=[],
        interior_walls=[],
        doors=[],
        windows=[],
    )
    project_data = layout.model_dump(mode="json")
    (project_dir / "project.json").write_text(json.dumps(project_data), encoding="utf-8")

    stored = repository.get("canonical_project_id")
    assert stored is not None
    assert stored.id == "canonical_project_id"

    projects, total = repository.list_projects(limit=10, offset=0)
    assert total == 1
    assert projects[0]["id"] == "canonical_project_id"
    assert repository.delete("canonical_project_id") is True
    assert not project_dir.exists()


def test_delete_project_requires_existing_safe_id():
    assert client.delete("/api/projects/project-that-does-not-exist").status_code == 404
    traversal = client.delete("/api/projects/%2E%2E%2Foutside")
    assert traversal.status_code >= 400

def test_estimate_endpoint():
    # First generate layout
    payload = {
        "plot_width": 30.0,
        "plot_length": 40.0,
        "bedrooms": 2,
        "road_side": "north"
    }
    project_id = None
    try:
        gen_res = client.post("/api/generate", json=payload)
        assert gen_res.status_code == 200
        layout_data = gen_res.json()
        project_id = layout_data["id"]

        est_res = client.post("/api/estimate", json=layout_data)
        assert est_res.status_code == 200
        est_data = est_res.json()
        assert est_data["currency"] == "INR"
        assert est_data["total_expected"] > 0
        assert len(est_data["items"]) >= 20
    finally:
        if project_id:
            assert client.delete(f"/api/projects/{project_id}").status_code == 200
