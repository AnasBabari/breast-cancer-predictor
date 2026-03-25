from __future__ import annotations

import pytest

from backend.main import app


@pytest.fixture()
def client():
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


@pytest.fixture()
def model_info_payload(client):
    res = client.get("/model_info")
    assert res.status_code == 200
    return res.get_json()


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
    assert res.get_json() == {"status": "ok"}


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
    payload = res.get_json()

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
    payload = res.get_json()
    assert "detail" in payload


def test_predict_requires_features_list(client) -> None:
    res = client.post("/predict", json={})

    assert res.status_code == 400
    payload = res.get_json()
    assert "features" in payload["detail"]


def test_predict_rejects_non_list_features(client) -> None:
    res = client.post("/predict", json={"features": "not-a-list"})

    assert res.status_code == 400
    payload = res.get_json()
    assert "features" in payload["detail"]


def test_predict_rejects_wrong_feature_count(client, model_info_payload) -> None:
    features = _valid_features_from_model_info(model_info_payload)
    wrong_count = features[:-1] if len(features) > 1 else []
    res = client.post("/predict", json={"features": wrong_count})

    assert res.status_code == 400
    payload = res.get_json()
    assert "Expected" in payload["detail"]


def test_predict_rejects_non_numeric_feature_value(client, model_info_payload) -> None:
    features = _valid_features_from_model_info(model_info_payload)
    bad_index = 1 if len(features) > 1 else 0
    features[bad_index] = "abc"
    body = {"features": features}
    res = client.post("/predict", json=body)

    assert res.status_code == 422
    payload = res.get_json()
    assert isinstance(payload.get("detail"), list)
    assert any("must be numeric" in str(err) for err in payload["detail"])
