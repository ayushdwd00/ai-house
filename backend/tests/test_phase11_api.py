from fastapi.testclient import TestClient
from main import app
from infrastructure.storage import delete_project

client = TestClient(app)

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
    res = client.post("/api/generate", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "id" in data
    assert "rooms" in data
    assert len(data["rooms"]) > 0

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
            assert delete_project(project_id)

def test_async_job_polling_flow():
    payload = {
        "plot_width": 30.0,
        "plot_length": 40.0,
        "bedrooms": 2,
        "road_side": "north"
    }
    # 1. Start async job
    res = client.post("/api/generate?async_job=true", json=payload)
    assert res.status_code == 202
    job_info = res.json()
    assert "job_id" in job_info
    job_id = job_info["job_id"]
    
    # 2. Poll job status
    poll_res = client.get(f"/api/jobs/{job_id}")
    assert poll_res.status_code == 200
    poll_data = poll_res.json()
    assert poll_data["job_id"] == job_id
    assert poll_data["status"] in ["queued", "processing", "completed"]

def test_estimate_endpoint():
    # First generate layout
    payload = {
        "plot_width": 30.0,
        "plot_length": 40.0,
        "bedrooms": 2,
        "road_side": "north"
    }
    gen_res = client.post("/api/generate", json=payload)
    assert gen_res.status_code == 200
    layout_data = gen_res.json()
    
    # Post to estimate endpoint
    est_res = client.post("/api/estimate", json=layout_data)
    assert est_res.status_code == 200
    est_data = est_res.json()
    assert est_data["currency"] == "INR"
    assert est_data["total_expected"] > 0
    assert len(est_data["items"]) >= 20
