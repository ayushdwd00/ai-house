import pytest
import time
from fastapi.testclient import TestClient
from main import app

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
