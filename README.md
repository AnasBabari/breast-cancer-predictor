# Breast Cancer Predictor

A small full-stack demo: train a **scikit-learn** model on the classic [Wisconsin Breast Cancer](https://scikit-learn.org/stable/modules/generated/sklearn.datasets.load_breast_cancer.html) dataset, expose it with **FastAPI**, and use a **React** (Vite) UI written in plain language for people who are not ML experts.

**Important:** This project is for **learning and prototyping only**. It is **not** a medical device and must **not** be used for diagnosis or treatment decisions.

## What you get

- **`backend/train.py`** — loads the dataset, selects the top 5 features (ANOVA F-score), fits a scaled logistic regression pipeline, writes `backend/artifacts/model.joblib`.
- **`backend/main.py`** — REST API (`/health`, `/model_info`, `/predict`) and serves the **built** React app from `frontend/dist` at `/` when that folder exists.
- **`frontend/`** — Vite + React UI: step-by-step inputs, “try example numbers,” and readable results.

A committed **`model.joblib`** is included so you can run the API right after installing Python deps. Re-run training if you change hyperparameters or feature count.

## Requirements

- **Python 3.10+**
- **Node.js 18+** (for building the frontend)
- Python packages in `backend/requirements.txt`

## Quick start (recommended)

**1. Python environment** (from the repo root):

**Windows (PowerShell):**

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
```

**macOS / Linux:**

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

**2. Install and build the frontend**

```bash
cd frontend
npm install
npm run build
cd ..
```

**3. Run the API + UI together**

```bash
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Open **http://127.0.0.1:8000/** — the built React app is served from the same origin. API docs: **http://127.0.0.1:8000/docs**

### Frontend development (hot reload)

Terminal A — API:

```bash
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Terminal B — Vite (proxies API routes to port 8000):

```bash
cd frontend
npm run dev
```

Open **http://127.0.0.1:5173/** while both are running.

### Optional: retrain the model

```bash
python backend/train.py
```

Use `python backend/train.py --k 5` to change how many features are selected (the API body must send exactly that many values, in the order shown by `/model_info`).

## API overview

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness check |
| GET | `/model_info` | Feature names, class names, training metrics |
| POST | `/predict` | JSON body: `{ "features": [n1, n2, n3, n4, n5] }` (order = `feature_names`) |

Example `curl` (values from the first row of the sklearn dataset, default trained feature order):

```bash
curl -s -X POST http://127.0.0.1:8000/predict ^
  -H "Content-Type: application/json" ^
  -d "{\"features\": [122.8, 0.1471, 25.38, 184.6, 0.2654]}"
```

On macOS/Linux, use `\` instead of `^`, or a single line.

**PowerShell:**

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8000/predict -Method Post -ContentType "application/json" -Body '{"features":[122.8,0.1471,25.38,184.6,0.2654]}'
```

## Project layout

```
backend/
  main.py           # FastAPI app + serves frontend/dist
  train.py
  requirements.txt
  artifacts/
    model.joblib
frontend/
  package.json
  vite.config.js
  src/
    App.jsx
    main.jsx
    index.css
    featureHints.js
  dist/             # produced by `npm run build` (gitignored)
```

## License

Use and modify freely for education. Add a license file if you redistribute publicly.
