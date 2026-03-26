from __future__ import annotations

import argparse
import os
from typing import Any, cast

import joblib
import numpy as np
import shap
from sklearn.datasets import load_breast_cancer
from sklearn.feature_selection import SelectKBest, f_classif
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    precision_score,
    recall_score,
    roc_auc_score,
    make_scorer,
)
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.pipeline import Pipeline
from sklearn.svm import SVC
from sklearn.preprocessing import StandardScaler
from sklearn.utils import Bunch
from xgboost import XGBClassifier


ARTIFACT_PATH = os.path.join(os.path.dirname(__file__), "artifacts", "model.joblib")
MALIGNANT_CLASS = 0


def _feature_importance_from_pipeline(
    pipeline: Pipeline,
    feature_names: list[str],
) -> list[dict[str, float | str]]:
    clf = pipeline.named_steps["clf"]

    if hasattr(clf, "feature_importances_"):
        importance = np.array(clf.feature_importances_, dtype=float)
    elif hasattr(clf, "coef_"):
        coef = np.array(clf.coef_, dtype=float)
        importance = np.abs(coef[0]) if coef.ndim > 1 else np.abs(coef)
    else:
        importance = np.ones(len(feature_names), dtype=float)

    total = float(np.sum(importance))
    if total > 0:
        importance = importance / total

    out = [
        {"feature": name, "importance": float(val)}
        for name, val in zip(feature_names, importance, strict=False)
    ]
    out.sort(key=lambda x: float(x["importance"]), reverse=True)
    return out


def _evaluate_model(
    model_name: str,
    pipeline: Pipeline,
    param_grid: dict[str, Any],
    x_train: np.ndarray,
    x_test: np.ndarray,
    y_train: np.ndarray,
    y_test: np.ndarray,
) -> tuple[dict[str, Any], Pipeline]:
    # We prioritize recall for malignant cases in our scoring
    scorer = make_scorer(recall_score, pos_label=MALIGNANT_CLASS)

    grid_search = GridSearchCV(
        pipeline,
        param_grid,
        scoring=scorer,
        cv=5,
        n_jobs=-1,
    )
    grid_search.fit(x_train, y_train)

    best_pipeline = cast(Pipeline, grid_search.best_estimator_)
    preds = best_pipeline.predict(x_test)
    proba = best_pipeline.predict_proba(x_test)
    classes = best_pipeline.named_steps["clf"].classes_

    malignant_index = int(np.where(classes == MALIGNANT_CLASS)[0][0])
    benign_index = int(np.where(classes == 1)[0][0])

    metrics = {
        "accuracy": float(accuracy_score(y_test, preds)),
        "precision_malignant": float(
            precision_score(y_test, preds, pos_label=MALIGNANT_CLASS, zero_division=0)
        ),
        "recall_malignant": float(
            recall_score(y_test, preds, pos_label=MALIGNANT_CLASS, zero_division=0)
        ),
        "roc_auc_malignant": float(
            roc_auc_score(y_test == MALIGNANT_CLASS, proba[:, malignant_index])
        ),
        "roc_auc_benign": float(roc_auc_score(y_test == 1, proba[:, benign_index])),
        "confusion_matrix": confusion_matrix(y_test, preds, labels=[0, 1]).tolist(),
        "best_params": grid_search.best_params_,
    }

    print(
        f"  {model_name:20s} "
        f"acc={metrics['accuracy']:.4f} "
        f"prec_mal={metrics['precision_malignant']:.4f} "
        f"rec_mal={metrics['recall_malignant']:.4f}"
    )
    return metrics, best_pipeline


def train_and_save(k: int = 5, random_state: int = 42) -> None:
    data = cast(Bunch, load_breast_cancer(return_X_y=False, as_frame=False))
    x_all = data.data
    y_all = data.target

    feature_names = data.feature_names
    target_names = list(data.target_names)  # ['malignant', 'benign']

    # Pick top k features by ANOVA F-score
    selector = SelectKBest(score_func=f_classif, k=k)
    selector.fit(x_all, y_all)
    support = selector.get_support()
    selected_feature_names = feature_names[support].tolist()

    x_selected = x_all[:, support]

    # Record realistic value bounds from the full dataset for API-side validation
    feature_stats: dict[str, dict[str, float]] = {}
    for i, name in enumerate(selected_feature_names):
        col = x_selected[:, i]
        feature_stats[name] = {
            "min": float(col.min()),
            "max": float(col.max()),
            "mean": float(col.mean()),
            "std": float(col.std()),
        }

    splits = train_test_split(
        x_selected, y_all, test_size=0.2, random_state=random_state, stratify=y_all
    )
    x_train = cast(np.ndarray, splits[0])
    x_test = cast(np.ndarray, splits[1])
    y_train = cast(np.ndarray, splits[2])
    y_test = cast(np.ndarray, splits[3])

    candidate_configs = [
        (
            "logistic_regression",
            Pipeline(
                [
                    ("scaler", StandardScaler()),
                    ("clf", LogisticRegression(max_iter=5000, random_state=random_state)),
                ]
            ),
            {"clf__C": [0.1, 1.0, 10.0], "clf__class_weight": [None, "balanced"]},
        ),
        (
            "random_forest",
            Pipeline(
                [
                    ("scaler", StandardScaler()),
                    ("clf", RandomForestClassifier(random_state=random_state)),
                ]
            ),
            {
                "clf__n_estimators": [100, 300],
                "clf__max_depth": [None, 10, 20],
                "clf__class_weight": ["balanced", "balanced_subsample"],
            },
        ),
        (
            "svm_linear",
            Pipeline(
                [
                    ("scaler", StandardScaler()),
                    ("clf", SVC(kernel="linear", probability=True, random_state=random_state)),
                ]
            ),
            {"clf__C": [0.1, 1.0, 10.0], "clf__class_weight": [None, "balanced"]},
        ),
        (
            "xgboost",
            Pipeline(
                [
                    ("scaler", StandardScaler()),
                    (
                        "clf",
                        XGBClassifier(
                            random_state=random_state,
                            use_label_encoder=False,
                            eval_metric="logloss",
                        ),
                    ),
                ]
            ),
            {
                "clf__n_estimators": [100, 200],
                "clf__learning_rate": [0.01, 0.1, 0.2],
                "clf__max_depth": [3, 5, 7],
            },
        ),
    ]

    print("\nModel comparison (tuning for malignant recall):")

    model_comparison: dict[str, dict[str, Any]] = {}
    trained_models: dict[str, Pipeline] = {}

    for model_name, pipeline, param_grid in candidate_configs:
        model_metrics, trained = _evaluate_model(
            model_name=model_name,
            pipeline=pipeline,
            param_grid=param_grid,
            x_train=x_train,
            x_test=x_test,
            y_train=y_train,
            y_test=y_test,
        )
        model_comparison[model_name] = model_metrics
        trained_models[model_name] = trained

    # Select best model: prioritize recall_malignant, then accuracy
    best_model_name = max(
        model_comparison,
        key=lambda name: (
            float(model_comparison[name]["recall_malignant"]),
            float(model_comparison[name]["accuracy"]),
        ),
    )
    best_pipeline = trained_models[best_model_name]
    best_metrics = model_comparison[best_model_name]

    best_model_reason = (
        f"Selected {best_model_name} because it achieved the highest malignant recall "
        f"({best_metrics['recall_malignant']:.4f}), which is critical for medical safety."
    )

    classes = best_pipeline.named_steps["clf"].classes_
    global_feature_importance = _feature_importance_from_pipeline(
        pipeline=best_pipeline,
        feature_names=selected_feature_names,
    )

    # Initialize SHAP explainer
    background_data = shap.sample(x_train, 50)

    artifact = {
        "dataset": "breast_cancer",
        "selected_feature_names": selected_feature_names,
        "target_names": target_names,
        "classes": classes.tolist(),
        "pipeline": best_pipeline,
        "best_model_name": best_model_name,
        "best_model_reason": best_model_reason,
        "metrics": best_metrics,
        "model_comparison": model_comparison,
        "global_feature_importance": global_feature_importance,
        "feature_stats": feature_stats,
        "k": k,
        "background_data": background_data,
    }

    os.makedirs(os.path.dirname(ARTIFACT_PATH), exist_ok=True)
    joblib.dump(artifact, ARTIFACT_PATH)

    print(f"\n✓ Artifact saved to: {ARTIFACT_PATH}")
    print(f"  Selected features (k={k}): {selected_feature_names}")
    print(f"  Best model        : {best_model_name}")
    print(f"  Best params       : {best_metrics['best_params']}")
    print(f"  Accuracy          : {float(best_metrics['accuracy']):.4f}")
    print(f"  Precision (mal)   : {float(best_metrics['precision_malignant']):.4f}")
    print(f"  Recall (mal)      : {float(best_metrics['recall_malignant']):.4f}")
    print(f"  Confusion matrix  : {best_metrics['confusion_matrix']}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train the breast cancer predictor model.")
    parser.add_argument(
        "--k", type=int, default=5, help="Number of top features to select (default: 5)"
    )
    parser.add_argument("--seed", type=int, default=42, help="Random seed (default: 42)")
    args = parser.parse_args()
    train_and_save(k=args.k, random_state=args.seed)
