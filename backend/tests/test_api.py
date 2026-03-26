from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def model_info_payload(client):
    res = client.get("/model_info")
    assert res.status_code == 200
    return res.json()


def _valid_features_from_model_info(payload) -> list[float]:
    feature_names = payload["feature_names"]
    feature_bounds = payload["feature_bounds"]

    values: list[float] = []
    for name in feature_names:
        lo, hi = feature_bounds[name]
        lo = float(lo)
        hi = float(hi)
        values.append((lo + hi) / 2.0)
    return values


def test_health_ok(client) -> None:
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_model_info_shape(model_info_payload) -> None:
    payload = model_info_payload
    assert isinstance(payload.get("feature_names"), list)
    assert len(payload["feature_names"]) > 0
    assert isinstance(payload.get("feature_bounds"), dict)
    assert len(payload["feature_bounds"]) == len(payload["feature_names"])
    assert set(payload["feature_bounds"].keys()) == set(payload["feature_names"])


def test_predict_smoke(client, model_info_payload) -> None:
    body = {"features": _valid_features_from_model_info(model_info_payload)}
    res = client.post("/predict", json=body)

    assert res.status_code == 200
    payload = res.json()

    assert payload["label"] in {"benign", "malignant"}
    assert 0.0 <= float(payload["probability"]) <= 1.0
    assert payload["confidence_level"] in {"high", "moderate", "uncertain"}
    assert isinstance(payload.get("confidence_note"), str)
    assert isinstance(payload.get("probabilities"), dict)
    assert isinstance(payload.get("top_factors"), list)


def test_predict_out_of_range_rejected(client, model_info_payload) -> None:
    features = _valid_features_from_model_info(model_info_payload)
    first_feature = model_info_payload["feature_names"][0]
    lo, hi = model_info_payload["feature_bounds"][first_feature]
    features[0] = float(hi) + max(float(hi) - float(lo), 1.0) + 1.0
    body = {"features": features}
    res = client.post("/predict", json=body)

    assert res.status_code == 422
    payload = res.json()
    assert "detail" in payload


def test_predict_wrong_feature_count_rejected(client, model_info_payload) -> None:
    features = _valid_features_from_model_info(model_info_payload)
    wrong_count = features[:-1] if len(features) > 1 else []
    body = {"features": wrong_count}
    res = client.post("/predict", json=body)

    assert res.status_code == 400
    payload = res.json()
    assert "detail" in payload


def test_predict_non_numeric_feature_rejected(client, model_info_payload) -> None:
    # FastAPI/Pydantic returns 422 for type errors in JSON
    valid_features = _valid_features_from_model_info(model_info_payload)
    features: list[float | str] = [*valid_features]
    bad_index = 1 if len(features) > 1 else 0
    features[bad_index] = "not-a-number"
    body = {"features": features}
    res = client.post("/predict", json=body)

    assert res.status_code == 422
    payload = res.json()
    assert "detail" in payload


def test_predict_missing_body_rejected(client) -> None:
    # FastAPI returns 422 Unprocessable Entity for missing required fields
    res = client.post("/predict", json={})

    assert res.status_code == 422
    payload = res.json()
    assert "detail" in payload
