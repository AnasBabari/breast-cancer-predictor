from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator
from starlette.staticfiles import StaticFiles


ARTIFACT_PATH = os.path.join(os.path.dirname(__file__), "artifacts", "model.joblib")
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIST = _PROJECT_ROOT / "frontend" / "dist"

MODEL_ARTIFACT: dict[str, Any] | None = None

# Fallback bounds used only if the artifact has no feature_stats.
FALLBACK_FEATURE_BOUNDS: dict[str, tuple[float, float]] = {
    "mean perimeter": (40.0, 210.0),
    "mean concave points": (0.0, 0.23),
    "worst radius": (7.0, 40.0),
    "worst perimeter": (45.0, 280.0),
    "worst concave points": (0.0, 0.32),
}

FEATURE_BOUNDS: dict[str, tuple[float, float]] = {}

# Confidence thresholds
HIGH_CONFIDENCE   = 0.80
LOW_CONFIDENCE    = 0.55  # below this → "uncertain"


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
    """Build per-feature bounds from artifact stats with a small margin."""
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    global MODEL_ARTIFACT, FEATURE_BOUNDS
    MODEL_ARTIFACT = _load_artifact()
    FEATURE_BOUNDS = _resolve_feature_bounds(MODEL_ARTIFACT)
    yield


app = FastAPI(
    title="Breast Cancer Predictor",
    description=(
        "Educational demo using the Wisconsin Breast Cancer dataset. "
        "NOT a medical device — never use for diagnosis or treatment."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PredictRequest(BaseModel):
    features: list[float] = Field(
        min_length=5,
        max_length=5,
        description="Five feature values in the order returned by /model_info",
    )

    @model_validator(mode="after")
    def validate_feature_ranges(self) -> "PredictRequest":
        """Reject values that are clearly outside the dataset's realistic range."""
        if MODEL_ARTIFACT is None:
            return self  # model not loaded yet; skip (startup edge case)

        feature_names: list[str] = list(MODEL_ARTIFACT["selected_feature_names"])
        errors: list[str] = []

        for name, value in zip(feature_names, self.features):
            bounds = FEATURE_BOUNDS.get(name)
            if bounds is None:
                continue
            lo, hi = bounds
            if not (lo <= value <= hi):
                errors.append(
                    f"'{name}': {value} is outside the expected range [{lo}, {hi}]."
                )

        if errors:
            raise ValueError(
                "One or more feature values are outside the realistic range for this dataset:\n"
                + "\n".join(f"  • {e}" for e in errors)
            )
        return self


class PredictResponse(BaseModel):
    label: str
    probability: float
    probabilities: dict[str, float]
    feature_names: list[str]
    confidence_level: Literal["high", "moderate", "uncertain"]
    confidence_note: str


class ModelInfoResponse(BaseModel):
    feature_names: list[str]
    target_names: list[str]
    metrics: dict[str, Any]
    feature_bounds: dict[str, tuple[float, float]]


@app.get("/health", tags=["Meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/model_info", response_model=ModelInfoResponse, tags=["Meta"])
def model_info() -> ModelInfoResponse:
    assert MODEL_ARTIFACT is not None
    feature_names = list(MODEL_ARTIFACT["selected_feature_names"])
    bounds = {name: FEATURE_BOUNDS.get(name, (0.0, 1e6)) for name in feature_names}
    return ModelInfoResponse(
        feature_names=feature_names,
        target_names=list(MODEL_ARTIFACT["target_names"]),
        metrics=dict(MODEL_ARTIFACT.get("metrics", {})),
        feature_bounds=bounds,
    )


@app.post("/predict", response_model=PredictResponse, tags=["Prediction"])
def predict(req: PredictRequest) -> PredictResponse:
    assert MODEL_ARTIFACT is not None

    feature_names: list[str] = list(MODEL_ARTIFACT["selected_feature_names"])
    x = np.array(req.features, dtype=float).reshape(1, -1)

    try:
        proba: np.ndarray = MODEL_ARTIFACT["pipeline"].predict_proba(x)[0]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {exc}") from exc

    classes = list(MODEL_ARTIFACT["classes"])
    target_names: list[str] = list(MODEL_ARTIFACT["target_names"])
    class_to_label = {cls: target_names[int(cls)] for cls in classes}
    probabilities = {class_to_label[cls]: float(p) for cls, p in zip(classes, proba)}

    label = max(probabilities, key=lambda k: probabilities[k])
    probability = float(probabilities[label])

    # Derive confidence level and human note
    if probability >= HIGH_CONFIDENCE:
        confidence_level: Literal["high", "moderate", "uncertain"] = "high"
        confidence_note = (
            f"The model is fairly confident in this result ({probability:.0%} probability). "
            "Remember: this is still an educational demo, not a clinical tool."
        )
    elif probability >= LOW_CONFIDENCE:
        confidence_level = "moderate"
        confidence_note = (
            f"The model shows moderate confidence ({probability:.0%}). "
            "The result should be interpreted with extra caution."
        )
    else:
        confidence_level = "uncertain"
        confidence_note = (
            f"The model is uncertain ({probability:.0%}) — both outcomes are nearly equally likely. "
            "This result is not meaningful for the given inputs."
        )

    return PredictResponse(
        label=label,
        probability=probability,
        probabilities=probabilities,
        feature_names=feature_names,
        confidence_level=confidence_level,
        confidence_note=confidence_note,
    )


if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
