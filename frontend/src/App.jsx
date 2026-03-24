import { useCallback, useEffect, useMemo, useState } from "react";
import { friendlyOutcomeLabel, hintForFeature } from "./featureHints.js";

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text);
      if (j.detail != null) {
        detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail, null, 2);
      }
    } catch {
      /* keep raw */
    }
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }
  return text ? JSON.parse(text) : null;
}

export default function App() {
  const [modelInfo, setModelInfo] = useState(null);
  const [values, setValues] = useState({});
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [predictError, setPredictError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const info = await fetchJson("/model_info");
        if (cancelled) return;
        setModelInfo(info);
        const initial = {};
        (info.feature_names || []).forEach((name) => {
          initial[name] = "";
        });
        setValues(initial);
        setLoadError(null);
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const featureNames = modelInfo?.feature_names ?? [];

  const fillExample = useCallback(() => {
    if (!modelInfo) return;
    // First row of sklearn Wisconsin set, in default model feature order (k=5).
    const exampleByName = {
      "mean perimeter": 122.8,
      "mean concave points": 0.1471,
      "worst radius": 25.38,
      "worst perimeter": 184.6,
      "worst concave points": 0.2654,
    };
    const next = {};
    modelInfo.feature_names.forEach((name) => {
      next[name] = exampleByName[name] != null ? String(exampleByName[name]) : "";
    });
    setValues(next);
    setPredictError(null);
    setResult(null);
  }, [modelInfo]);

  const onChange = useCallback((name, raw) => {
    setValues((v) => ({ ...v, [name]: raw }));
    setPredictError(null);
  }, []);

  const canSubmit = useMemo(() => {
    if (!modelInfo) return false;
    return modelInfo.feature_names.every((n) => {
      const s = values[n];
      if (s == null || String(s).trim() === "") return false;
      return !Number.isNaN(parseFloat(s));
    });
  }, [modelInfo, values]);

  const onSubmit = useCallback(
    async (ev) => {
      ev.preventDefault();
      if (!modelInfo || !canSubmit) return;
      const features = modelInfo.feature_names.map((n) => parseFloat(values[n]));
      setBusy(true);
      setPredictError(null);
      setResult(null);
      try {
        const data = await fetchJson("/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ features }),
        });
        setResult(data);
      } catch (e) {
        setPredictError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [modelInfo, canSubmit, values]
  );

  const outcome = result ? friendlyOutcomeLabel(result.label) : null;

  return (
    <div className="layout">
      <header className="hero">
        <h1>Breast tissue sample checker</h1>
        <p className="tagline">
          A gentle, step-by-step demo. Enter five numbers from the same kind of lab measurements used in classic
          research data — then see how a simple model would lean (educational only).
        </p>
      </header>

      <section className="card disclaimer" aria-label="Disclaimer">
        <h2>Not medical advice</h2>
        <p>
          This page is a learning toy. It does <strong>not</strong> check real patients, read your scans, or replace a
          doctor. Never use it to decide on care.
        </p>
      </section>

      {loadError ? (
        <section className="card">
          <h2>We couldn&apos;t reach the model</h2>
          <p className="muted">Fix: start the API from the project folder, then refresh.</p>
          <div className="error-box">
            {`Tip: in one terminal run

  python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000

For the React dev server (separate terminal):

  cd frontend
  npm install
  npm run dev

Details: ${loadError}`}
          </div>
        </section>
      ) : !modelInfo ? (
        <section className="card">
          <div className="loading" role="status">
            <span className="spinner" aria-hidden />
            Loading the form…
          </div>
        </section>
      ) : (
        <>
          <section className="card steps-intro" aria-label="How this works">
            <h2>How it works (simple)</h2>
            <p>
              You&apos;ll fill in <strong>{featureNames.length} numbers</strong>, one at a time. Each number describes
              something about cell shape from image-based measurements (like the Wisconsin Breast Cancer research
              dataset). Then press <strong>See result</strong>.
            </p>
            <details>
              <summary>Why does it still sound technical under the hood?</summary>
              <p style={{ marginTop: 10, marginBottom: 0 }}>
                The server uses exact column names from the research dataset so the machine-learning model stays
                aligned. Above each question we use everyday wording; you can peek at the tiny gray dataset label if you
                want the precise name.
              </p>
            </details>
          </section>

          <form className="card" onSubmit={onSubmit} aria-label="Measurements">
            <h2>Your numbers</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Type decimal numbers (for example <code style={{ color: "var(--text)" }}>12.5</code>). Use{" "}
              <strong>Try example numbers</strong> if you just want to see a result.
            </p>

            <div className="field-grid">
              {featureNames.map((name, i) => {
                const hint = hintForFeature(name);
                return (
                  <div className="field" key={name}>
                    <div className="field-top">
                      <p className="field-title">{hint.title}</p>
                      <span className="field-step">
                        Step {i + 1} of {featureNames.length}
                      </span>
                    </div>
                    <p className="field-hint">{hint.hint}</p>
                    <label className="sr-only" htmlFor={`in-${name}`}>
                      {hint.title}
                    </label>
                    <input
                      id={`in-${name}`}
                      name={name}
                      type="number"
                      inputMode="decimal"
                      step="any"
                      autoComplete="off"
                      placeholder="Type a number"
                      value={values[name] ?? ""}
                      onChange={(e) => onChange(name, e.target.value)}
                    />
                    <span className="technical-pill">Dataset field: {hint.technical}</span>
                  </div>
                );
              })}
            </div>

            <div className="actions">
              <button type="submit" className="btn" disabled={!canSubmit || busy}>
                {busy ? "Working…" : "See result"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={fillExample}>
                Try example numbers
              </button>
            </div>

            {predictError ? <div className="error-box">{predictError}</div> : null}
          </form>

          {result ? (
            <section className="card" aria-live="polite" aria-label="Result">
              <h2>What the demo model says</h2>
              {outcome ? (
                <>
                  <p className={`result-headline ${outcome.tone}`}>{outcome.headline}</p>
                  <p className="result-detail">{outcome.detail}</p>
                </>
              ) : null}

              <p className="muted" style={{ marginTop: 0 }}>
                The model is not sure in life — it only outputs probabilities for this tutorial:
              </p>

              {Object.entries(result.probabilities || {}).map(([label, p]) => {
                const pct = Math.round(Number(p) * 1000) / 10;
                const isBenign = String(label).toLowerCase() === "benign";
                return (
                  <div className="bar-row" key={label}>
                    <div className="bar-label">
                      <strong>{isBenign ? "Benign (less aggressive pattern)" : "Malignant (more aggressive pattern)"}</strong>
                      <span>{pct}%</span>
                    </div>
                    <div className="bar-track">
                      <div
                        className={`bar-fill ${isBenign ? "ok" : "alert"}`}
                        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              {modelInfo?.metrics && Object.keys(modelInfo.metrics).length > 0 ? (
                <div className="metrics">
                  Training notes (for nerds):{" "}
                  {Object.entries(modelInfo.metrics)
                    .map(([k, v]) => `${k}=${typeof v === "number" ? v.toFixed(4) : v}`)
                    .join(", ")}
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      )}

      <footer className="footer">
        Educational demo ·{" "}
        <a href="/docs" target="_blank" rel="noreferrer">
          API docs
        </a>
      </footer>

      <style>{`
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
      `}</style>
    </div>
  );
}
