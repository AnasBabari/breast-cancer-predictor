from __future__ import annotations

import pytest

from backend.main import app


@pytest.fixture()
def client():
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


def test_health_ok(client) -> None:
    res = client.get("/health")
    assert res.status_code == 200
    assert res.get_json() == {"status": "ok"}


def test_model_info_shape(client) -> None:
    res = client.get("/model_info")
    assert res.status_code == 200
    payload = res.get_json()

    assert isinstance(payload.get("feature_names"), list)
    assert len(payload["feature_names"]) == 5
    assert isinstance(payload.get("feature_bounds"), dict)
    assert len(payload["feature_bounds"]) == len(payload["feature_names"])


def test_predict_smoke(client) -> None:
    # Sample values from the sklearn dataset in expected feature order.
    body = {"features": [122.8, 0.1471, 25.38, 184.6, 0.2654]}
    res = client.post("/predict", json=body)

    assert res.status_code == 200
    payload = res.get_json()

    assert payload["label"] in {"benign", "malignant"}
    assert 0.0 <= float(payload["probability"]) <= 1.0
    assert payload["confidence_level"] in {"high", "moderate", "uncertain"}
    assert isinstance(payload.get("confidence_note"), str)
    assert isinstance(payload.get("probabilities"), dict)
    assert isinstance(payload.get("top_factors"), list)


def test_predict_out_of_range_rejected(client) -> None:
    # First feature is intentionally unrealistic and should fail validation.
    body = {"features": [9999.0, 0.1471, 25.38, 184.6, 0.2654]}
    res = client.post("/predict", json=body)

    assert res.status_code == 422
    payload = res.get_json()
    assert "detail" in payload
