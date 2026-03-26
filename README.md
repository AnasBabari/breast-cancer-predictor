# AI Breast Cancer Predictor Tool v2.0

An educational web application that predicts whether a tumor pattern is **benign** or **malignant** from selected numeric features of the Wisconsin Breast Cancer dataset.

## Core philosophy

Early cancer detection errors are costly. In this project, we optimize not just for accuracy, but for **malignant recall**, because missing cancer-like cases is the worst outcome.

## Key features (v2.0)

- **FastAPI Backend**: High performance, strict type validation, and automatic OpenAPI docs.
- **XGBoost & SVM**: Expanded model candidates with hyperparameter tuning via Grid Search.
- **SHAP Explainability**: Scientifically grounded local and global feature importance.
- **Modern UI**: Rebuilt with **Tailwind CSS**, **Recharts**, and **Lucide** for a polished medical dashboard feel.
- **Interactive Charts**: Dynamic visualization of class probabilities and factor impacts.

## Dataset

- Source: scikit-learn `load_breast_cancer` (Wisconsin Diagnostic Breast Cancer)
- Type: tabular, supervised binary classification
- Labels: `0 = malignant`, `1 = benign`

## Product architecture

- **Frontend**: React (Vite) + Tailwind CSS + Recharts
  - **FeatureInputs**: Interactive sliders with preset values.
  - **ResultDisplay**: Real-time prediction analysis with SHAP-based factors.
  - **ModelComparison**: Radar charts and performance metrics for multiple algorithms.
- **Backend**: FastAPI (Python 3.12+)
  - `GET /health`: Service status.
  - `GET /model_info`: Comprehensive metadata, comparison data, and global importance.
  - `POST /predict`: Prediction with probability scores and local SHAP explanations.

## Model choice and comparison

The training pipeline evaluates and compares:
1. **Logistic Regression** (Optimized with Grid Search)
2. **Random Forest** (Balanced class weights)
3. **Linear SVM** (Linear kernel, high recall tuning)
4. **XGBoost** (Gradient boosting for high precision/recall balance)

**Selection logic**: Models are ranked by `recall_malignant` (primary safety), then `accuracy` (secondary performance).

## Explainability (SHAP)

We use **SHAP (SHapley Additive exPlanations)** to provide two levels of insight:
1. **Global Importance**: Which features the model values most across the entire dataset.
2. **Local Impact**: For a specific prediction, which factors pushed the result toward "malignant" vs "benign."

## Disclaimer and limitations

**Educational tool only.** Not a medical device. Must not be used for diagnosis, triage, or treatment decisions. Trained on historical data without prospective clinical validation.

## Local setup

### Python backend

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
# Train the model and generate the artifact
python backend/train.py
# Start the server
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```
Backend API docs available at `http://127.0.0.1:8000/docs`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```
Frontend runs at `http://localhost:5173`.

## Testing

```bash
# Run backend tests (FastAPI + TestClient)
python -m pytest backend/tests
```

## Docker

### Build and run
```bash
docker compose up --build
```
The Docker build process automatically trains the model and bundles the optimized frontend.

## Project structure

```text
backend/
  main.py          # FastAPI application & SHAP integration
  train.py         # ML pipeline (GridSearch + Model Selection)
  requirements.txt # Dependencies
  tests/           # API TestClient suite
frontend/
  src/
    components/    # Modular React components (Tailwind + Recharts)
    App.jsx        # Main application logic
    index.css      # Tailwind base styles
Dockerfile         # Multi-stage production build
docker-compose.yml # Dev/Test orchestration
pyproject.toml     # Ruff (linting) configuration
```
