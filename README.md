# AI Breast Cancer Predictor Tool

An educational web application that predicts whether a tumor pattern is **benign** or **malignant** from selected numeric features of the Wisconsin Breast Cancer dataset.

## Problem statement

Early cancer detection errors are costly. In this project, we optimize not just for accuracy, but for **malignant recall**, because missing cancer-like cases is the worst outcome.

## Dataset

- Source: scikit-learn `load_breast_cancer` (Wisconsin Diagnostic Breast Cancer)
- Type: tabular, supervised binary classification
- Labels:
  - `0 = malignant`
  - `1 = benign`

## Product architecture

- **Frontend**: React + Vite single-page app
  - slider-based feature inputs
  - prediction panel (benign/malignant)
  - explainability panel (top 3 factors)
  - model comparison and feature importance visibility
- **Backend**: Flask API
  - `GET /health`
  - `GET /model_info`
  - `POST /predict`

## Model choice and comparison

The training pipeline evaluates and compares:

1. Logistic Regression
2. Random Forest
3. Linear SVM

Best model is selected by:

1. highest `recall_malignant` (primary safety metric)
2. then `precision_malignant`
3. then `accuracy`

Reason is exposed via `/model_info` as `best_model_reason`.

## Evaluation metrics

We report more than accuracy:

- accuracy
- precision (malignant)
- recall (malignant)
- confusion matrix
- ROC AUC (malignant and benign)

This better reflects medical-risk tradeoffs.

## Why mistakes matter (impact thinking)

In this domain, a model can look statistically good but still be clinically weak if it misses malignant cases.

- **False negatives are critical**: a malignant case predicted as benign is the riskiest failure.
- **Recall (malignant)** is therefore a primary selection metric.
- **Precision + confusion matrix** are shown to understand tradeoffs, not just one score.

The web app now includes a confusion-matrix heatmap and explicit false-negative emphasis to make this risk visible.

## Explainability

Two explainability outputs are available:

1. **Global feature importance** (`/model_info`)
2. **Top 3 factors affecting current prediction** (`/predict` as `top_factors`)

In medical ML workflows, this helps interpretation and trust.


## Disclaimer and limitations

### Disclaimer

This project is an **educational tool**, not a medical device. It must not be used for diagnosis, triage, or treatment decisions.

### Limitations

- trained on one historical dataset
- no prospective clinical validation
- does not use imaging, pathology workflow, or patient context
- model explanations are supportive, not causal clinical evidence

## Local setup

### Python backend

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
python backend/train.py
python backend/main.py
```

Backend will run at `http://127.0.0.1:8000`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://127.0.0.1:5173`.

## Testing

```bash
python -m pytest -q backend/tests
```

Includes API smoke and validation tests.

## CI/CD

GitHub Actions workflow: `.github/workflows/ci.yml`

- runs backend tests on push/PR
- runs frontend build on push/PR

## Docker

### Single container

```bash
docker build -t breast-cancer-predictor .
docker run --rm -p 8000:8000 breast-cancer-predictor
```

### Docker Compose

```bash
docker compose up --build
```

## Model artifact policy

Current repo keeps `backend/artifacts/model.joblib` for quick startup.

Cleaner alternatives:

1. retrain during setup/CI (no binary in git)
2. Git LFS for `.joblib` artifacts

Git LFS quick start:

```bash
git lfs install
git lfs track "backend/artifacts/*.joblib"
git add .gitattributes
```

## Project structure

```
backend/
  main.py
  train.py
  requirements.txt
  tests/
frontend/
  src/
Dockerfile
docker-compose.yml
.github/workflows/ci.yml
```
