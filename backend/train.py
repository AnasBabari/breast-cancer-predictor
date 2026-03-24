from __future__ import annotations

import argparse
import os

import joblib
import numpy as np
from sklearn.datasets import load_breast_cancer
from sklearn.feature_selection import SelectKBest, f_classif
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


ARTIFACT_PATH = os.path.join(os.path.dirname(__file__), "artifacts", "model.joblib")


def train_and_save(k: int = 5, random_state: int = 42) -> None:
    data = load_breast_cancer()
    X = data.data
    y = data.target

    feature_names = data.feature_names
    target_names = list(data.target_names)  # ['malignant', 'benign']

    # Pick top k features by ANOVA F-score
    selector = SelectKBest(score_func=f_classif, k=k)
    selector.fit(X, y)
    support = selector.get_support()
    selected_feature_names = feature_names[support].tolist()

    X_selected = X[:, support]

    # Record realistic value bounds from the full dataset for API-side validation
    feature_stats: dict[str, dict[str, float]] = {}
    for i, name in enumerate(selected_feature_names):
        col = X_selected[:, i]
        feature_stats[name] = {
            "min": float(col.min()),
            "max": float(col.max()),
            "mean": float(col.mean()),
            "std": float(col.std()),
        }

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
    proba = pipeline.predict_proba(X_test)
    classes = pipeline.named_steps["clf"].classes_

    pos_class = 1
    if pos_class not in classes:
        raise RuntimeError(f"Expected class {pos_class} in trained model, but got {classes}")
    pos_index = int(np.where(classes == pos_class)[0][0])
    roc_auc = roc_auc_score(y_test, proba[:, pos_index])

    # Cross-validated accuracy for a more honest metric
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=random_state)
    cv_scores = cross_val_score(pipeline, X_selected, y, cv=cv, scoring="accuracy")

    metrics = {
        "accuracy": float(accuracy_score(y_test, preds)),
        "roc_auc_benign_positive": float(roc_auc),
        "cv_accuracy_mean": float(cv_scores.mean()),
        "cv_accuracy_std": float(cv_scores.std()),
    }

    artifact = {
        "dataset": "breast_cancer",
        "selected_feature_names": selected_feature_names,
        "target_names": target_names,
        "classes": classes.tolist(),
        "pipeline": pipeline,
        "metrics": metrics,
        "feature_stats": feature_stats,
        "k": k,
    }

    os.makedirs(os.path.dirname(ARTIFACT_PATH), exist_ok=True)
    joblib.dump(artifact, ARTIFACT_PATH)

    print(f"\n✓ Artifact saved to: {ARTIFACT_PATH}")
    print(f"  Selected features (k={k}): {selected_feature_names}")
    print(f"  Hold-out accuracy : {metrics['accuracy']:.4f}")
    print(f"  ROC-AUC (benign)  : {metrics['roc_auc_benign_positive']:.4f}")
    print(f"  CV accuracy       : {metrics['cv_accuracy_mean']:.4f} ± {metrics['cv_accuracy_std']:.4f}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train the breast cancer predictor model.")
    parser.add_argument("--k", type=int, default=5, help="Number of top features to select (default: 5)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed (default: 42)")
    args = parser.parse_args()
    train_and_save(k=args.k, random_state=args.seed)
