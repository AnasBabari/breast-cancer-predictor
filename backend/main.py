from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import shap
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# --- Configuration ---
ARTIFACT_PATH = os.path.join(os.path.dirname(__file__), "artifacts", "model.joblib")
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIST = _PROJECT_ROOT / "frontend" / "dist"

HIGH_CONFIDENCE = 0.80
LOW_CONFIDENCE = 0.55

# --- State ---
MODEL_ARTIFACT: dict[str, Any] | None = None
FEATURE_BOUNDS: dict[str, tuple[float, float]] = {}
SHAP_EXPLAINER: shap.Explainer | None = None

# --- Rate Limiter ---
limiter = Limiter(key_func=get_remote_address)

# --- Schemas ---
class PredictRequest(BaseModel):
    features: list[float] = Field(..., description="List of feature values in order.")


class TopFactor(BaseModel):
    feature: str
    value: float
    impact: float
    direction: str


class PredictResponse(BaseModel):
    label: str
    probability: float
    probabilities: dict[str, float]
    feature_names: list[str]
    confidence_level: str
    confidence_note: str
    top_factors: list[TopFactor]
    shap_values: dict[str, float] | None = None


class ModelInfoResponse(BaseModel):
    feature_names: list[str]
    target_names: list[str]
    metrics: dict[str, Any]
    feature_bounds: dict[str, list[float]]
    best_model: str
    best_model_reason: str
    model_comparison: dict[str, Any]
    global_feature_importance: list[dict[str, Any]]
    disclaimer: str
    limitations: list[str]


# --- Helpers ---
def _load_artifact() -> dict[str, Any]:
    if not os.path.exists(ARTIFACT_PATH):
        raise FileNotFoundError(
            f"Missing pretrained artifact at {ARTIFACT_PATH}. Run `python backend/train.py` first."
        )
    artifact = joblib.load(ARTIFACT_PATH)
    if "pipeline" not in artifact or "selected_feature_names" not in artifact:
        raise ValueError("Artifact format is invalid.")
    return artifact


def _resolve_feature_bounds(artifact: dict[str, Any]) -> dict[str, tuple[float, float]]:
    names = list(artifact.get("selected_feature_names", []))
    stats = dict(artifact.get("feature_stats", {}))
    resolved = {}

    for name in names:
        stat = stats.get(name)
        if stat and "min" in stat and "max" in stat:
            raw_min = float(stat["min"])
            raw_max = float(stat["max"])
            span = max(raw_max - raw_min, 1e-6)
            margin = 0.10 * span
            resolved[name] = (max(0.0, raw_min - margin), raw_max + margin)
        else:
            resolved[name] = (0.0, 1e6)
    return resolved


def _init_shap(artifact: dict[str, Any]):
    global SHAP_EXPLAINER
    pipeline = artifact["pipeline"]
    clf = pipeline.named_steps["clf"]
    scaler = pipeline.named_steps["scaler"]
    background = artifact.get("background_data")

    if background is not None:
        background_transformed = scaler.transform(background)
        try:
            # Tree-based models (XGBoost, Random Forest)
            if hasattr(clf, "feature_importances_"):
                SHAP_EXPLAINER = shap.TreeExplainer(clf)
            else:
                # Fallback to KernelExplainer only if really needed,
                # but it's slow. Linear models don't need it.
                if not hasattr(clf, "coef_"):
                    SHAP_EXPLAINER = shap.KernelExplainer(clf.predict_proba, background_transformed)
        except Exception as e:
            print(f"Warning: SHAP initialization failed: {e}")


def _compute_explanations(artifact: dict[str, Any], x: np.ndarray, predicted_label: str):
    pipeline = artifact["pipeline"]
    scaler = pipeline.named_steps["scaler"]
    feature_names = artifact["selected_feature_names"]
    classes = list(artifact["classes"])

    # Malignant is class 0 in this dataset
    try:
        mal_idx = classes.index(0)
    except ValueError:
        mal_idx = 0

    x_transformed = scaler.transform(x)

    # 1. Try SHAP (best for non-linear/tree models)
    if SHAP_EXPLAINER is not None:
        try:
            if isinstance(SHAP_EXPLAINER, shap.KernelExplainer):
                shap_vals = SHAP_EXPLAINER.shap_values(x_transformed)
            else:
                shap_vals = SHAP_EXPLAINER.shap_values(x_transformed)

            if isinstance(shap_vals, list):
                val = shap_vals[mal_idx][0]
            else:
                val = shap_vals[0, :, mal_idx] if len(shap_vals.shape) == 3 else shap_vals[0]

            top_indices = np.argsort(np.abs(val))[::-1][:3]
            top_factors = []
            for idx in top_indices:
                top_factors.append(
                    {
                        "feature": feature_names[idx],
                        "value": float(x[0, idx]),
                        "impact": float(abs(val[idx])),
                        # Positive SHAP for malignant class means it pushes toward Malignant
                        "direction": "malignant" if val[idx] > 0 else "benign",
                    }
                )

            shap_map = {name: float(v) for name, v in zip(feature_names, val, strict=False)}
            return top_factors, shap_map
        except Exception as e:
            print(f"Warning: SHAP explanation failed: {e}")

    # 2. Fallback to linear coefficients (for LogisticRegression, SVM)
    clf = pipeline.named_steps["clf"]
    if hasattr(clf, "coef_"):
        coef = np.array(clf.coef_, dtype=float)
        coef_1d = coef[0] if coef.ndim > 1 else coef
        # coef[0] is for class 1 (benign) in many sklearn models,
        # but we want to know what pushes toward malignant (0).
        # We invert the sign to show impact toward Malignant.
        contributions = x_transformed[0] * (-coef_1d)
        ordering = np.argsort(np.abs(contributions))[::-1][:3]

        top = []
        for idx in ordering:
            toward = "malignant" if contributions[idx] >= 0 else "benign"
            top.append(
                {
                    "feature": feature_names[idx],
                    "value": float(x[0, idx]),
                    "impact": float(abs(contributions[idx])),
                    "direction": toward,
                }
            )
        return top, None

    return [], None


# --- Lifespan ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    global MODEL_ARTIFACT, FEATURE_BOUNDS
    # Fail fast on startup if model cannot be loaded
    try:
        MODEL_ARTIFACT = _load_artifact()
        FEATURE_BOUNDS = _resolve_feature_bounds(MODEL_ARTIFACT)
        _init_shap(MODEL_ARTIFACT)
    except Exception as e:
        print(f"CRITICAL: Application startup failed: {e}")
        # In production, we might want to exit here
        raise RuntimeError(f"Could not initialize model artifact: {e}") from e
    yield


# --- FastAPI App ---
app = FastAPI(title="AI Breast Cancer Predictor Tool API", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("CORS_ORIGINS", "*")],
    allow_credentials=False,  # Wildcard origins + allow_credentials is invalid
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/model_info", response_model=ModelInfoResponse)
def get_model_info():
    if not MODEL_ARTIFACT:
        raise HTTPException(status_code=500, detail="Model not loaded")

    feature_names = list(MODEL_ARTIFACT["selected_feature_names"])
    bounds = {name: list(FEATURE_BOUNDS.get(name, (0.0, 1e6))) for name in feature_names}

    return {
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


@app.post("/predict", response_model=PredictResponse)
@limiter.limit("30/minute")
def predict(request: Request, body: PredictRequest):
    if not MODEL_ARTIFACT:
        raise HTTPException(status_code=500, detail="Model not loaded")

    feature_names = list(MODEL_ARTIFACT["selected_feature_names"])
    if len(body.features) != len(feature_names):
        raise HTTPException(status_code=400, detail=f"Expected {len(feature_names)} features.")

    # Validation
    errors = []
    for name, val in zip(feature_names, body.features, strict=False):
        lo, hi = FEATURE_BOUNDS.get(name, (0.0, 1e6))
        if not (lo <= val <= hi):
            errors.append(f"'{name}': {val} outside expected range [{lo:.2f}, {hi:.2f}].")

    if errors:
        raise HTTPException(status_code=422, detail=errors)

    x = np.array(body.features).reshape(1, -1)
    pipeline = MODEL_ARTIFACT["pipeline"]

    try:
        proba = pipeline.predict_proba(x)[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {e}") from e

    classes = list(MODEL_ARTIFACT["classes"])
    target_names = list(MODEL_ARTIFACT["target_names"])
    class_to_label = {cls: target_names[int(cls)] for cls in classes}
    probabilities = {class_to_label[cls]: float(p) for cls, p in zip(classes, proba, strict=False)}

    label = max(probabilities, key=probabilities.get)
    probability = probabilities[label]

    if probability >= HIGH_CONFIDENCE:
        confidence_level = "high"
        confidence_note = f"Fairly confident ({probability:.0%}). Educational only."
    elif probability >= LOW_CONFIDENCE:
        confidence_level = "moderate"
        confidence_note = f"Moderate confidence ({probability:.0%})."
    else:
        confidence_level = "uncertain"
        confidence_note = f"Uncertain ({probability:.0%})."

    top_factors, shap_values = _compute_explanations(MODEL_ARTIFACT, x, label)

    return {
        "label": label,
        "probability": probability,
        "probabilities": probabilities,
        "feature_names": feature_names,
        "confidence_level": confidence_level,
        "confidence_note": confidence_note,
        "top_factors": top_factors,
        "shap_values": shap_values,
    }


# Serving Frontend
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{rest_of_path:path}")
    async def serve_frontend(rest_of_path: str):
        file_path = FRONTEND_DIST / rest_of_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(FRONTEND_DIST / "index.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
