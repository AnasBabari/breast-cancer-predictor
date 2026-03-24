from __future__ import annotations

import os
from typing import Any

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


ARTIFACT_PATH = os.path.join(os.path.dirname(__file__), "artifacts", "model.joblib")

app = FastAPI(title="Breast Cancer Predictor (Pretrained)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # beginner-friendly: allow local dev origins
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PredictRequest(BaseModel):
    # Features are provided in the same order as `model_info.feature_names`.
    features: list[float] = Field(min_length=5, max_length=5)


class PredictResponse(BaseModel):
    label: str
    probability: float  # probability of the predicted label
    probabilities: dict[str, float]
    feature_names: list[str]


class ModelInfoResponse(BaseModel):
    feature_names: list[str]
    target_names: list[str]
    metrics: dict[str, Any]


MODEL_ARTIFACT: dict[str, Any] | None = None


def _load_artifact() -> dict[str, Any]:
    if not os.path.exists(ARTIFACT_PATH):
        raise FileNotFoundError(
            f"Missing pretrained artifact at {ARTIFACT_PATH}. Run `python backend/train.py` first."
        )
    artifact = joblib.load(ARTIFACT_PATH)
    if "pipeline" not in artifact or "selected_feature_names" not in artifact:
        raise ValueError("Artifact format is invalid: expected keys `pipeline` and `selected_feature_names`.")
    return artifact


@app.on_event("startup")
def _startup() -> None:
    global MODEL_ARTIFACT
    MODEL_ARTIFACT = _load_artifact()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/model_info", response_model=ModelInfoResponse)
def model_info() -> ModelInfoResponse:
    assert MODEL_ARTIFACT is not None  # for type checkers
    return ModelInfoResponse(
        feature_names=list(MODEL_ARTIFACT["selected_feature_names"]),
        target_names=list(MODEL_ARTIFACT["target_names"]),
        metrics=dict(MODEL_ARTIFACT.get("metrics", {})),
    )


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest) -> PredictResponse:
    assert MODEL_ARTIFACT is not None  # for type checkers
    feature_names: list[str] = list(MODEL_ARTIFACT["selected_feature_names"])

    x = np.array(req.features, dtype=float).reshape(1, -1)
    proba: np.ndarray = MODEL_ARTIFACT["pipeline"].predict_proba(x)[0]

    classes = list(MODEL_ARTIFACT["classes"])  # e.g., [0, 1]
    target_names: list[str] = list(MODEL_ARTIFACT["target_names"])  # e.g., ['malignant', 'benign']

    # Map each sklearn class value (e.g., 0/1) to a human label.
    class_to_label = {cls: target_names[int(cls)] for cls in classes}
    probabilities = {class_to_label[cls]: float(p) for cls, p in zip(classes, proba)}

    label = max(probabilities, key=lambda k: probabilities[k])
    probability = float(probabilities[label])

    return PredictResponse(
        label=label,
        probability=probability,
        probabilities=probabilities,
        feature_names=feature_names,
    )

