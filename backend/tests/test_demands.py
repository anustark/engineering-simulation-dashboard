from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_list_demands_returns_a_list():
    response = client.get("/api/demands")

    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_create_demand_from_missing_result_is_rejected():
    response = client.post(
        "/api/demands",
        json={
            "result_id": 999999,
            "description": "Test invalid source finding",
            "status": "Open",
            "origin": "finding",
        },
    )

    assert response.status_code == 404
