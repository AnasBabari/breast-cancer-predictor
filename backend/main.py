from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS


ARTIFACT_PATH = os.path.join(os.path.dirname(__file__), "artifacts", "model.joblib")
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIST = _PROJECT_ROOT / "frontend" / "dist"

MODEL_ARTIFACT: dict[str, Any] | None = None

FALLBACK_FEATURE_BOUNDS: dict[str, tuple[float, float]] = {
    "mean perimeter": (40.0, 210.0),
    "mean concave points": (0.0, 0.23),
    "worst radius": (7.0, 40.0),
    "worst perimeter": (45.0, 280.0),
    "worst concave points": (0.0, 0.32),
}

FEATURE_BOUNDS: dict[str, tuple[float, float]] = {}

HIGH_CONFIDENCE = 0.80
LOW_CONFIDENCE = 0.55


def _load_artifact() -> dict[str, Any]:
    if not os.path.exists(ARTIFACT_PATH):
        raise FileNotFoundError(
            f"Missing pretrained artifact at {ARTIFACT_PATH}. "
            "Run `python backend/train.py` first."
        )
    artifact = joblib.load(ARTIFACT_PATH)
    if "pipeline" not in artifact or "selected_feature_names" not in artifact:
        raise ValueError(
            "Artifact format is invalid: expected keys `pipeline` and `selected_feature_names`."
        )
    return artifact


def _resolve_feature_bounds(artifact: dict[str, Any]) -> dict[str, tuple[float, float]]:
    names = list(artifact.get("selected_feature_names", []))
    stats: dict[str, dict[str, float]] = dict(artifact.get("feature_stats", {}))
    resolved: dict[str, tuple[float, float]] = {}

    for name in names:
        stat = stats.get(name)
        if stat and "min" in stat and "max" in stat:
            raw_min = float(stat["min"])
            raw_max = float(stat["max"])
            span = max(raw_max - raw_min, 1e-6)
            margin = 0.10 * span
            lo = max(0.0, raw_min - margin)
            hi = raw_max + margin
            resolved[name] = (lo, hi)
        elif name in FALLBACK_FEATURE_BOUNDS:
            resolved[name] = FALLBACK_FEATURE_BOUNDS[name]
        else:
            resolved[name] = (0.0, 1e6)

    return resolved


def _compute_top_factors(
    artifact: dict[str, Any],
    x: np.ndarray,
    predicted_label: str,
) -> list[dict[str, Any]]:
    feature_names: list[str] = list(artifact["selected_feature_names"])
    pipeline = artifact["pipeline"]
    clf = pipeline.named_steps["clf"]
    scaler = pipeline.named_steps["scaler"]

    if hasattr(clf, "coef_"):
        transformed = scaler.transform(x)[0]
        coef = np.array(clf.coef_, dtype=float)
        coef_1d = coef[0] if coef.ndim > 1 else coef
        contributions = transformed * coef_1d
        ordering = np.argsort(np.abs(contributions))[::-1][:3]

        top = []
        for idx in ordering:
            toward = "benign" if contributions[idx] >= 0 else "malignant"
            top.append(
                {
                    "feature": feature_names[idx],
                    "value": float(x[0, idx]),
                    "impact": float(abs(contributions[idx])),
                    "direction": toward,
                }
            )
        return top

    global_importance = list(artifact.get("global_feature_importance", []))
    importance_map = {
        str(item["feature"]): float(item["importance"]) for item in global_importance
    }
    stats: dict[str, dict[str, float]] = dict(artifact.get("feature_stats", {}))

    approximated: list[dict[str, Any]] = []
    for idx, name in enumerate(feature_names):
        info = stats.get(name, {})
        mean = float(info.get("mean", 0.0))
        std = float(info.get("std", 1.0)) or 1.0
        z = abs((float(x[0, idx]) - mean) / std)
        approx_impact = z * importance_map.get(name, 0.0)
        approximated.append(
            {
                "feature": name,
                "value": float(x[0, idx]),
                "impact": float(approx_impact),
                "direction": predicted_label,
            }
        )

    approximated.sort(key=lambda item: float(item["impact"]), reverse=True)
    return approximated[:3]


def _init_model() -> None:
    global MODEL_ARTIFACT, FEATURE_BOUNDS
    MODEL_ARTIFACT = _load_artifact()
    FEATURE_BOUNDS = _resolve_feature_bounds(MODEL_ARTIFACT)


app = Flask(
    __name__,
    static_folder=str(FRONTEND_DIST) if FRONTEND_DIST.is_dir() else None,
    static_url_path="",
)
CORS(app)


@app.get("/health")
def health() -> Any:
    return jsonify({"status": "ok"})


@app.get("/model_info")
def model_info() -> Any:
    if MODEL_ARTIFACT is None:
        return jsonify({"error": "Model artifact not loaded"}), 500

    feature_names = list(MODEL_ARTIFACT["selected_feature_names"])
    bounds = {name: FEATURE_BOUNDS.get(name, (0.0, 1e6)) for name in feature_names}

    return jsonify(
        {
            "feature_names": feature_names,
            "target_names": list(MODEL_ARTIFACT["target_names"]),
            "metrics": dict(MODEL_ARTIFACT.get("metrics", {})),
            "feature_bounds": bounds,
            "best_model": str(MODEL_ARTIFACT.get("best_model_name", "unknown")),
            "best_model_reason": str(MODEL_ARTIFACT.get("best_model_reason", "")),
            "model_comparison": dict(MODEL_ARTIFACT.get("model_comparison", {})),
            "global_feature_importance": list(MODEL_ARTIFACT.get("global_feature_importance", [])),
            "disclaimer": "Educational tool only. Not for diagnosis or treatment decisions.",
            "limitations": [
                "Trained on a single historical dataset.",
                "Not validated for clinical deployment.",
                "Should not replace pathology, imaging, or physician judgement.",
            ],
        }
    )


@app.post("/predict")
def predict() -> Any:
    if MODEL_ARTIFACT is None:
        return jsonify({"detail": "Model artifact not loaded"}), 500

    data = request.get_json(silent=True) or {}
    features = data.get("features")
    if not isinstance(features, list):
        return jsonify({"detail": "Request body must include `features` list."}), 400

    feature_names: list[str] = list(MODEL_ARTIFACT["selected_feature_names"])
    expected_len = len(feature_names)
    if len(features) != expected_len:
        return jsonify({"detail": f"Expected {expected_len} features."}), 400

    values: list[float] = []
    errors: list[str] = []
    for name, raw in zip(feature_names, features):
        try:
            value = float(raw)
        except Exception:
            errors.append(f"'{name}' must be numeric.")
            continue

        lo, hi = FEATURE_BOUNDS.get(name, (0.0, 1e6))
        if not (lo <= value <= hi):
            errors.append(f"'{name}': {value} outside expected range [{lo}, {hi}].")
        values.append(value)

    if errors:
        return jsonify({"detail": errors}), 422

    x = np.array(values, dtype=float).reshape(1, -1)

    try:
        proba: np.ndarray = MODEL_ARTIFACT["pipeline"].predict_proba(x)[0]
    except Exception as exc:
        return jsonify({"detail": f"Prediction failed: {exc}"}), 500

    classes = list(MODEL_ARTIFACT["classes"])
    target_names: list[str] = list(MODEL_ARTIFACT["target_names"])
    class_to_label = {cls: target_names[int(cls)] for cls in classes}
    probabilities = {class_to_label[cls]: float(p) for cls, p in zip(classes, proba)}

    label = max(probabilities, key=lambda k: probabilities[k])
    probability = float(probabilities[label])

    if probability >= HIGH_CONFIDENCE:
        confidence_level = "high"
        confidence_note = (
            f"The model is fairly confident ({probability:.0%}). "
            "Still educational, not clinical."
        )
    elif probability >= LOW_CONFIDENCE:
        confidence_level = "moderate"
        confidence_note = f"The model has moderate confidence ({probability:.0%})."
    else:
        confidence_level = "uncertain"
        confidence_note = f"The model is uncertain ({probability:.0%})."

    top_factors = _compute_top_factors(
        artifact=MODEL_ARTIFACT,
        x=x,
        predicted_label=label,
    )

    return jsonify(
        {
            "label": label,
            "probability": probability,
            "probabilities": probabilities,
            "feature_names": feature_names,
            "confidence_level": confidence_level,
            "confidence_note": confidence_note,
            "top_factors": top_factors,
        }
    )


@app.get("/docs")
def docs() -> Any:
    return jsonify(
        {
            "name": "AI Breast Cancer Predictor Tool API",
            "routes": {
                "GET /health": "Service health",
                "GET /model_info": "Model metadata, comparison, and feature importance",
                "POST /predict": "Prediction + confidence + top 3 factors",
            },
        }
    )


if FRONTEND_DIST.is_dir():
    @app.route("/")
    def index() -> Any:
        return send_from_directory(str(FRONTEND_DIST), "index.html")

    @app.route("/<path:path>")
    def static_proxy(path: str) -> Any:
        full = FRONTEND_DIST / path
        if full.exists() and full.is_file():
            return send_from_directory(str(FRONTEND_DIST), path)
        return send_from_directory(str(FRONTEND_DIST), "index.html")


_init_model()


if __name__ == "__main__":
    debug = os.getenv("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=8000, debug=debug)
