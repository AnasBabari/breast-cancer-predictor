import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

// Animated probability bar that counts up on mount
function AnimatedBar({ pct, tone }) {
  const [displayed, setDisplayed] = useState(0);
  useEffect(() => {
    let frame;
    const start = performance.now();
    const duration = 700;
    function step(now) {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setDisplayed(Math.round(pct * ease * 10) / 10);
      if (t < 1) frame = requestAnimationFrame(step);
    }
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [pct]);

  return (
    <div className="bar-row">
      <div className="bar-label">
        <span>{tone === "ok" ? "Benign (non-aggressive)" : "Malignant (aggressive)"}</span>
        <span className={`bar-pct bar-pct--${tone}`}>{displayed}%</span>
      </div>
      <div className="bar-track">
        <div
          className={`bar-fill bar-fill--${tone}`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}

export default function App() {
  const [modelInfo, setModelInfo] = useState(null);
  const [values, setValues] = useState({});
  const [touched, setTouched] = useState({});
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [predictError, setPredictError] = useState(null);
  const [result, setResult] = useState(null);
  const resultRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const info = await fetchJson("/model_info");
        if (cancelled) return;
        setModelInfo(info);
        const initial = {};
        (info.feature_names || []).forEach((name) => { initial[name] = ""; });
        setValues(initial);
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const featureNames = modelInfo?.feature_names ?? [];

  const fillExample = useCallback(() => {
    if (!modelInfo) return;
    const exampleByName = {
      "mean perimeter": 122.8,
      "mean concave points": 0.1471,
      "worst radius": 25.38,
      "worst perimeter": 184.6,
      "worst concave points": 0.2654,
    };
    const next = {};
    const nextTouched = {};
    modelInfo.feature_names.forEach((name) => {
      next[name] = exampleByName[name] != null ? String(exampleByName[name]) : "";
      nextTouched[name] = true;
    });
    setValues(next);
    setTouched(nextTouched);
    setPredictError(null);
    setResult(null);
  }, [modelInfo]);

  const onChange = useCallback((name, raw) => {
    setValues((v) => ({ ...v, [name]: raw }));
    setPredictError(null);
    setResult(null);
  }, []);

  const onBlur = useCallback((name) => {
    setTouched((t) => ({ ...t, [name]: true }));
  }, []);

  const fieldError = useCallback(
    (name) => {
      if (!touched[name]) return null;
      const s = values[name];
      if (s == null || String(s).trim() === "") return "Required";
      const n = parseFloat(s);
      if (Number.isNaN(n)) return "Must be a number";
      const bounds = modelInfo?.feature_bounds?.[name];
      if (bounds) {
        const [lo, hi] = bounds;
        if (n < lo || n > hi) return `Expected ${lo}–${hi}`;
      }
      return null;
    },
    [touched, values, modelInfo]
  );

  const canSubmit = useMemo(() => {
    if (!modelInfo) return false;
    return modelInfo.feature_names.every((n) => {
      const s = values[n];
      if (!s || String(s).trim() === "") return false;
      const num = parseFloat(s);
      if (Number.isNaN(num)) return false;
      const bounds = modelInfo?.feature_bounds?.[n];
      if (!bounds) return true;
      const [lo, hi] = bounds;
      return num >= lo && num <= hi;
    });
  }, [modelInfo, values]);

  const filledCount = useMemo(() => {
    return featureNames.filter((n) => {
      const s = values[n];
      return s && String(s).trim() !== "" && !Number.isNaN(parseFloat(s));
    }).length;
  }, [featureNames, values]);

  const onSubmit = useCallback(
    async (ev) => {
      ev?.preventDefault?.();
      if (!modelInfo || !canSubmit) return;
      // Touch all fields to show any errors
      const allTouched = {};
      modelInfo.feature_names.forEach((n) => { allTouched[n] = true; });
      setTouched(allTouched);

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
        setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      } catch (e) {
        setPredictError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [modelInfo, canSubmit, values]
  );

  const outcome = result ? friendlyOutcomeLabel(result.label, result.confidence_level) : null;

  return (
    <div className="layout">
      <header className="hero">
        <div className="hero-badge">Educational Demo</div>
        <h1>Breast Tissue<br />Sample Checker</h1>
        <p className="tagline">
          Enter five cell-measurement numbers from the Wisconsin research dataset and see
          how a simple logistic regression model classifies the pattern — built to learn from,
          not to diagnose with.
        </p>
      </header>

      <div className="disclaimer" role="alert" aria-label="Medical disclaimer">
        <span className="disclaimer-icon">⚠</span>
        <div>
          <strong>Not medical advice.</strong> This is a learning prototype. It cannot
          examine real patients, read scans, or replace clinical judgement. Never use
          it to make decisions about care.
        </div>
      </div>

      {loadError ? (
        <section className="card">
          <h2>Could not connect to the model</h2>
          <p className="muted">Start the API server, then refresh this page.</p>
          <pre className="error-box">{`python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000\n\nDetails: ${loadError}`}</pre>
        </section>
      ) : !modelInfo ? (
        <section className="card card--loading">
          <span className="spinner" aria-hidden />
          <span>Loading model info…</span>
        </section>
      ) : (
        <>
          {/* Progress indicator */}
          <div className="progress-bar-wrap" aria-label={`${filledCount} of ${featureNames.length} fields filled`}>
            <div className="progress-header">
              <span>Inputs filled</span>
              <span>{filledCount} / {featureNames.length}</span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${featureNames.length > 0 ? (filledCount / featureNames.length) * 100 : 0}%` }}
              />
            </div>
          </div>

          <section className="card">
            <div className="form-header">
              <h2>Measurements</h2>
              <button className="btn btn--ghost" type="button" onClick={fillExample}>
                Try example values
              </button>
            </div>
            <p className="muted form-subhead">
              These fields map directly to columns in the Wisconsin Breast Cancer
              research dataset. Each describes the shape of cell nuclei under a microscope.
            </p>

            <div className="field-grid">
              {featureNames.map((name, i) => {
                const hint = hintForFeature(name);
                const err = fieldError(name);
                const val = values[name] ?? "";
                const filled = val !== "" && !Number.isNaN(parseFloat(val));
                return (
                  <div className={`field ${filled ? "field--filled" : ""} ${err ? "field--error" : ""}`} key={name}>
                    <div className="field-top">
                      <span className="field-index">{String(i + 1).padStart(2, "0")}</span>
                      <p className="field-title">{hint.title}</p>
                    </div>
                    <p className="field-hint">{hint.hint}</p>
                    {hint.exampleRange && (
                      <p className="field-range">{hint.exampleRange}{hint.unit ? ` ${hint.unit}` : ""}</p>
                    )}
                    <div className="input-wrap">
                      <label className="sr-only" htmlFor={`in-${name}`}>{hint.title}</label>
                      <input
                        id={`in-${name}`}
                        name={name}
                        type="number"
                        inputMode="decimal"
                        step="any"
                        autoComplete="off"
                        placeholder="Enter a number"
                        value={val}
                        onChange={(e) => onChange(name, e.target.value)}
                        onBlur={() => onBlur(name)}
                        aria-invalid={err ? "true" : undefined}
                        aria-describedby={err ? `err-${name}` : undefined}
                      />
                      {filled && !err && <span className="input-check" aria-hidden>✓</span>}
                    </div>
                    {err && <p className="field-error-msg" id={`err-${name}`} role="alert">{err}</p>}
                    <span className="technical-pill" title="Dataset column name">{hint.technical}</span>
                  </div>
                );
              })}
            </div>

            <div className="actions">
              <button
                className="btn btn--primary"
                type="button"
                onClick={onSubmit}
                disabled={!canSubmit || busy}
                aria-busy={busy}
              >
                {busy
                  ? <><span className="spinner spinner--sm" aria-hidden /> Analysing…</>
                  : "Run prediction"}
              </button>
            </div>

            {predictError && (
              <div className="error-box" role="alert">
                <strong>Prediction failed</strong>
                <pre>{predictError}</pre>
              </div>
            )}
          </section>

          {result && (
            <section
              className={`card result-card result-card--${outcome?.tone}`}
              aria-live="polite"
              ref={resultRef}
            >
              <div className="result-icon" aria-hidden>{outcome?.icon}</div>
              <h2 className="result-headline">{outcome?.headline}</h2>
              <p className="result-detail">{outcome?.detail}</p>

              {/* Confidence badge */}
              <div className={`confidence-badge confidence-badge--${result.confidence_level}`}>
                <span className="confidence-dot" />
                Confidence:{" "}
                <strong>
                  {result.confidence_level === "high"
                    ? "High"
                    : result.confidence_level === "moderate"
                    ? "Moderate"
                    : "Uncertain"}
                </strong>
                <span className="confidence-pct">({(result.probability * 100).toFixed(1)}%)</span>
              </div>

              {result.confidence_level !== "uncertain" && (
                <p className="confidence-note">{result.confidence_note}</p>
              )}

              <div className="bars">
                {Object.entries(result.probabilities || {}).map(([label, p]) => {
                  const pct = Math.round(Number(p) * 1000) / 10;
                  const tone = String(label).toLowerCase() === "benign" ? "ok" : "alert";
                  return <AnimatedBar key={label} pct={pct} tone={tone} />;
                })}
              </div>

              {modelInfo?.metrics && Object.keys(modelInfo.metrics).length > 0 && (
                <details className="metrics-details">
                  <summary>Model training stats</summary>
                  <div className="metrics-grid">
                    {Object.entries(modelInfo.metrics).map(([k, v]) => (
                      <div className="metric-item" key={k}>
                        <span className="metric-label">{k.replace(/_/g, " ")}</span>
                        <span className="metric-value">
                          {typeof v === "number" ? v.toFixed(4) : String(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              <button
                className="btn btn--ghost btn--sm"
                type="button"
                onClick={() => { setResult(null); setValues(Object.fromEntries(featureNames.map((n) => [n, ""]))); setTouched({}); }}
              >
                ← Reset and try again
              </button>
            </section>
          )}
        </>
      )}

      <footer className="footer">
        Educational demo · Not a medical device ·{" "}
        <a href="/docs" target="_blank" rel="noreferrer">API docs</a>
      </footer>

      <style>{`.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}`}</style>
    </div>
  );
}
