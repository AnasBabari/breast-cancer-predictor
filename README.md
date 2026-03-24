# Breast Cancer Predictor

A small full-stack demo: train a **scikit-learn** model on the classic [Wisconsin Breast Cancer](https://scikit-learn.org/stable/modules/generated/sklearn.datasets.load_breast_cancer.html) dataset, expose it with **FastAPI**, and use a **React** (Vite) UI written in plain language for people who are not ML experts.

**Important:** This project is for **learning and prototyping only**. It is **not** a medical device and must **not** be used for diagnosis or treatment decisions.

## What you get

- **`backend/train.py`** — loads the dataset, selects the top 5 features (ANOVA F-score), fits a scaled logistic regression pipeline, writes `backend/artifacts/model.joblib`.
- **`backend/main.py`** — REST API (`/health`, `/model_info`, `/predict`) and serves the **built** React app from `frontend/dist` at `/` when that folder exists.
- **`frontend/`** — Vite + React UI: step-by-step inputs, “try example numbers,” and readable results.

A committed **`model.joblib`** is included so you can run the API right after installing Python deps. Re-run training if you change hyperparameters or feature count.

## Recent Improvements

- Backend validation now uses dynamic per-feature bounds computed from model training statistics, with a small safety margin.
- `/predict` now returns confidence metadata: `confidence_level` and `confidence_note`.
- `/model_info` now returns `feature_bounds` so the frontend can enforce valid numeric ranges.
- Training now reports cross-validated accuracy (`cv_accuracy_mean`, `cv_accuracy_std`) and stores per-feature stats in the artifact.
- Frontend now includes improved input validation, progress tracking, animated probability bars, confidence badges, and clearer result states.
- The form now includes guided workflow steps, quick presets (benign-like / malignant-like), midpoint autofill, and one-click reset.
- Inputs are auto-saved in browser local storage and restored on reload for a smoother workflow.
- A JSON payload preview and copy button make API usage easier for beginners.
- The UI now includes an API status badge, keyboard shortcut support (`Ctrl+Enter`), and per-field range-position hints.
- New visibility controls let users toggle high-contrast mode, larger text, and reduced motion.
- Recent prediction history is stored locally and can be reused with one click.
- UI styling was modernized for readability and accessibility while keeping the app mobile-friendly.
- Added backend API tests (pytest) including a `/predict` smoke test and validation test.
- Added CI workflow (GitHub Actions) to run backend tests and frontend build on push/PR.
- Added Docker and docker-compose support for simpler sharing/deployment.

## UI/UX Feature Guide

- Guided 3-step workflow panel that explains the full flow from inputs to interpretation.
- Next-field helper that highlights what to complete next.
- Quick action buttons:
  - `Malignant-like preset`
  - `Benign-like preset`
  - `Fill midpoint values`
  - `Clear all`
- Per-field validation shows:
  - required errors
  - numeric parsing errors
  - allowed range from backend `feature_bounds`
- Request preview tools:
  - expandable JSON payload preview
  - copy-to-clipboard action once the payload is valid
- Visibility controls:
  - high contrast mode
  - larger text mode
  - reduced motion mode
- API status indicator:
  - shows online/offline/checking state from `/health`
- Productivity helpers:
  - keyboard shortcut `Ctrl+Enter` to run prediction
  - recent prediction history with "Reuse values"
- Result panel includes confidence level, confidence note, and animated probability bars.

## Git Ignore Notes

The root `.gitignore` now covers:

- Python caches and virtual environments
- Frontend build output and package cache logs
- Local temp/log files
- common IDE and OS-generated files

The pretrained model artifact `backend/artifacts/model.joblib` remains tracked intentionally for quick startup.

## Requirements

- **Python 3.10+**
- **Node.js 18+** (for building the frontend)
- Python packages in `backend/requirements.txt`

## Testing

Run backend tests from repo root:

```bash
python -m pytest -q backend/tests
```

Current test coverage includes:

- `/health` endpoint sanity check
- `/model_info` response shape check
- `/predict` smoke test with known valid payload
- `/predict` out-of-range input validation check

## CI/CD

GitHub Actions workflow is available at `.github/workflows/ci.yml` and runs on push/PR:

- backend test job (`pytest`)
- frontend build job (`npm run build`)

This gives a baseline CI gate before merges.

## Docker

### Build and run with Docker

```bash
docker build -t breast-cancer-predictor .
docker run --rm -p 8000:8000 breast-cancer-predictor
```

### Or run with Docker Compose

```bash
docker compose up --build
```

Open: `http://127.0.0.1:8000/`

## Model Artifact Strategy

Right now `backend/artifacts/model.joblib` is committed for convenience. For cleaner long-term repo hygiene, you have two recommended options:

1. Keep artifact out of git and retrain in setup/CI:
  - Remove tracked artifact from git
  - Run `python backend/train.py` as a setup step
2. Track artifact via Git LFS:
  - Install git-lfs
  - `git lfs track "backend/artifacts/*.joblib"`
  - Commit `.gitattributes`

If project size grows or model versions increase, option 2 is generally cleaner.

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
| GET | `/model_info` | Feature names, class names, training metrics, and per-feature bounds |
| POST | `/predict` | JSON body: `{ "features": [n1, n2, n3, n4, n5] }` (order = `feature_names`) + confidence metadata |

Example `/predict` response fields:

- `label`: predicted class name (`"benign"` or `"malignant"`)
- `probability`: probability of the predicted class
- `probabilities`: per-class probability map
- `confidence_level`: one of `high`, `moderate`, `uncertain`
- `confidence_note`: human-readable confidence guidance

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
