from __future__ import annotations

import argparse
import os

import joblib
import numpy as np
from sklearn.datasets import load_breast_cancer
from sklearn.feature_selection import SelectKBest, f_classif
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


ARTIFACT_PATH = os.path.join(os.path.dirname(__file__), "artifacts", "model.joblib")


def train_and_save(k: int = 5, random_state: int = 42) -> None:
    data = load_breast_cancer()
    X = data.data
    y = data.target

    feature_names = data.feature_names
    target_names = list(data.target_names)  # typically ['malignant', 'benign']

    # Pick top k features (based on ANOVA F-score).
    selector = SelectKBest(score_func=f_classif, k=k)
    selector.fit(X, y)
    support = selector.get_support()
    selected_feature_names = feature_names[support].tolist()

    # Train only on the selected features so the API only needs 5 inputs.
    X_selected = X[:, support]
    X_train, X_test, y_train, y_test = train_test_split(
        X_selected, y, test_size=0.2, random_state=random_state, stratify=y
    )

    pipeline = Pipeline(
        [
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(max_iter=5000, random_state=random_state)),
        ]
    )
    pipeline.fit(X_train, y_train)

    preds = pipeline.predict(X_test)
    proba = pipeline.predict_proba(X_test)[0 : len(X_test)]
    classes = pipeline.named_steps["clf"].classes_  # e.g., array([0, 1])

    # roc_auc_score needs probabilities for the positive class (we use class `1` = benign).
    pos_class = 1
    if pos_class not in classes:
        raise RuntimeError(f"Expected class {pos_class} in trained model, but got {classes}")
    pos_index = int(np.where(classes == pos_class)[0][0])
    roc_auc = roc_auc_score(y_test, proba[:, pos_index])

    metrics = {
        "accuracy": float(accuracy_score(y_test, preds)),
        "roc_auc_benign_positive": float(roc_auc),
    }

    artifact = {
        "dataset": "breast_cancer",
        "selected_feature_names": selected_feature_names,
        "target_names": target_names,
        "classes": classes.tolist(),
        "pipeline": pipeline,
        "metrics": metrics,
        "k": k,
    }

    os.makedirs(os.path.dirname(ARTIFACT_PATH), exist_ok=True)
    joblib.dump(artifact, ARTIFACT_PATH)
    print(f"Wrote pretrained artifact to: {ARTIFACT_PATH}")
    print(f"Selected features (k={k}): {selected_feature_names}")
    print(f"Metrics: {metrics}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--k", type=int, default=5)
    args = parser.parse_args()
    train_and_save(k=args.k)

