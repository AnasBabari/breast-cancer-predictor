import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { friendlyOutcomeLabel, hintForFeature } from "./featureHints.js";

const STORAGE_KEY = "bcp:form-values:v1";
const HISTORY_KEY = "bcp:prediction-history:v1";
const UI_PREFS_KEY = "bcp:ui-prefs:v1";

const PRESET_VALUES = {
  malignant_like: {
    "mean perimeter": 122.8,
    "mean concave points": 0.1471,
    "worst radius": 25.38,
    "worst perimeter": 184.6,
    "worst concave points": 0.2654,
  },
  benign_like: {
    "mean perimeter": 75.0,
    "mean concave points": 0.03,
    "worst radius": 14.0,
    "worst perimeter": 90.0,
    "worst concave points": 0.08,
  },
};

function formatTimestamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown time";
  return d.toLocaleString();
}

function TogglePill({ active, onClick, label }) {
  return (
    <button
      type="button"
      className={`toggle-pill ${active ? "toggle-pill--active" : ""}`}
      onClick={onClick}
      aria-pressed={active ? "true" : "false"}
    >
      {label}
    </button>
  );
}

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
function AnimatedBar({ pct, tone, reducedMotion }) {
  const [displayed, setDisplayed] = useState(0);
  useEffect(() => {
    if (reducedMotion) {
      setDisplayed(pct);
      return undefined;
    }
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
  }, [pct, reducedMotion]);

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
  const [copied, setCopied] = useState(false);
  const [apiStatus, setApiStatus] = useState("checking");
  const [history, setHistory] = useState([]);
  const [uiPrefs, setUiPrefs] = useState({
    highContrast: false,
    largeText: false,
    reducedMotion: false,
  });
  const resultRef = useRef(null);

  useEffect(() => {
    try {
      const rawPrefs = localStorage.getItem(UI_PREFS_KEY);
      if (rawPrefs) {
        const parsed = JSON.parse(rawPrefs);
        setUiPrefs((prev) => ({
          ...prev,
          highContrast: Boolean(parsed.highContrast),
          largeText: Boolean(parsed.largeText),
          reducedMotion: Boolean(parsed.reducedMotion),
        }));
      }
    } catch {
      /* ignore invalid saved prefs */
    }

    try {
      const rawHistory = localStorage.getItem(HISTORY_KEY);
      if (rawHistory) {
        const parsed = JSON.parse(rawHistory);
        if (Array.isArray(parsed)) {
          setHistory(parsed.slice(0, 6));
        }
      }
    } catch {
      /* ignore invalid saved history */
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(UI_PREFS_KEY, JSON.stringify(uiPrefs));
  }, [uiPrefs]);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    let cancelled = false;

    async function ping() {
      try {
        await fetchJson("/health");
        if (!cancelled) setApiStatus("online");
      } catch {
        if (!cancelled) setApiStatus("offline");
      }
    }

    ping();
    const t = setInterval(ping, 15000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const info = await fetchJson("/model_info");
        if (cancelled) return;
        setModelInfo(info);
        const initial = {};
        (info.feature_names || []).forEach((name) => { initial[name] = ""; });
        const rawSaved = localStorage.getItem(STORAGE_KEY);
        if (rawSaved) {
          try {
            const parsed = JSON.parse(rawSaved);
            info.feature_names.forEach((name) => {
              if (typeof parsed[name] === "string") {
                initial[name] = parsed[name];
              }
            });
          } catch {
            /* ignore invalid local data */
          }
        }
        setValues(initial);
        setLoadError(null);
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const featureNames = modelInfo?.feature_names ?? [];

  useEffect(() => {
    if (!modelInfo) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  }, [values, modelInfo]);

  const applyPreset = useCallback((preset) => {
    if (!modelInfo) return;
    const byName = PRESET_VALUES[preset] || {};
    const next = {};
    const nextTouched = {};
    modelInfo.feature_names.forEach((name) => {
      next[name] = byName[name] != null ? String(byName[name]) : "";
      nextTouched[name] = true;
    });
    setValues(next);
    setTouched(nextTouched);
    setPredictError(null);
    setResult(null);
  }, [modelInfo]);

  const sliderStepFor = useCallback((name) => {
    const bounds = modelInfo?.feature_bounds?.[name];
    if (!bounds) return 0.01;
    const [lo, hi] = bounds;
    const span = Math.max(hi - lo, 1e-6);
    if (span >= 100) return 0.5;
    if (span >= 10) return 0.1;
    return 0.001;
  }, [modelInfo]);

  const fillMidpoints = useCallback(() => {
    if (!modelInfo) return;
    const next = {};
    const nextTouched = {};
    modelInfo.feature_names.forEach((name) => {
      const bounds = modelInfo?.feature_bounds?.[name];
      if (!bounds) {
        next[name] = "";
      } else {
        const [lo, hi] = bounds;
        next[name] = String(Math.round((((lo + hi) / 2) * 1000)) / 1000);
      }
      nextTouched[name] = true;
    });
    setValues(next);
    setTouched(nextTouched);
    setPredictError(null);
    setResult(null);
  }, [modelInfo]);

  const clearForm = useCallback(() => {
    if (!modelInfo) return;
    const next = {};
    modelInfo.feature_names.forEach((name) => {
      next[name] = "";
    });
    setValues(next);
    setTouched({});
    setPredictError(null);
    setResult(null);
    localStorage.removeItem(STORAGE_KEY);
  }, [modelInfo]);

  const initializeToMidpoints = useCallback((info) => {
    if (!info) return;
    const next = {};
    info.feature_names.forEach((name) => {
      const bounds = info?.feature_bounds?.[name];
      if (!bounds) {
        next[name] = "";
      } else {
        const [lo, hi] = bounds;
        next[name] = String(Math.round((((lo + hi) / 2) * 1000)) / 1000);
      }
    });
    setValues(next);
  }, []);

  const onChange = useCallback((name, raw) => {
    setValues((v) => ({ ...v, [name]: raw }));
    setPredictError(null);
    setResult(null);
  }, []);

  const onBlur = useCallback((name) => {
    setTouched((t) => ({ ...t, [name]: true }));
  }, []);

  const focusNextField = useCallback((nextFieldName) => {
    if (!nextFieldName) return;
    const el = document.getElementById(`in-${nextFieldName}`);
    el?.focus();
  }, []);

  const parseField = useCallback((name) => {
    const s = values[name];
    if (!s || String(s).trim() === "") return { valid: false, value: null };
    const num = parseFloat(s);
    if (Number.isNaN(num)) return { valid: false, value: null };
    const bounds = modelInfo?.feature_bounds?.[name];
    if (bounds) {
      const [lo, hi] = bounds;
      if (num < lo || num > hi) return { valid: false, value: num };
    }
    return { valid: true, value: num };
  }, [modelInfo, values]);

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
    return modelInfo.feature_names.every((n) => parseField(n).valid);
  }, [modelInfo, parseField]);

  const filledCount = useMemo(() => {
    return featureNames.filter((n) => parseField(n).valid).length;
  }, [featureNames, parseField]);

  const nextFieldName = useMemo(() => {
    return featureNames.find((n) => !parseField(n).valid) || null;
  }, [featureNames, parseField]);

  const invalidCount = useMemo(() => {
    return Math.max(0, featureNames.length - filledCount);
  }, [featureNames.length, filledCount]);

  const payload = useMemo(() => {
    if (!modelInfo || !canSubmit) return null;
    return {
      features: modelInfo.feature_names.map((n) => parseFloat(values[n])),
    };
  }, [modelInfo, canSubmit, values]);

  const topImportance = useMemo(() => {
    const arr = modelInfo?.global_feature_importance;
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, 5);
  }, [modelInfo]);

  const comparisonRows = useMemo(() => {
    const comparison = modelInfo?.model_comparison;
    if (!comparison || typeof comparison !== "object") return [];
    return Object.entries(comparison);
  }, [modelInfo]);

  const bestModelMetrics = useMemo(() => {
    const best = modelInfo?.best_model;
    const cmp = modelInfo?.model_comparison;
    if (!best || !cmp || typeof cmp !== "object") return null;
    return cmp[best] || null;
  }, [modelInfo]);

  const confusion = useMemo(() => {
    const cm = bestModelMetrics?.confusion_matrix;
    if (!Array.isArray(cm) || cm.length !== 2) return null;
    if (!Array.isArray(cm[0]) || !Array.isArray(cm[1])) return null;
    // Matrix was produced with labels [0, 1] where 0=malignant and 1=benign.
    const tp = Number(cm[0][0] ?? 0);
    const fn = Number(cm[0][1] ?? 0);
    const fp = Number(cm[1][0] ?? 0);
    const tn = Number(cm[1][1] ?? 0);
    const total = Math.max(1, tn + fp + fn + tp);
    const malignantTotal = Math.max(1, tp + fn);
    return {
      tn,
      fp,
      fn,
      tp,
      total,
      fnRate: fn / malignantTotal,
    };
  }, [bestModelMetrics]);

  const onSubmit = useCallback(
    async (ev) => {
      ev?.preventDefault?.();
      if (!modelInfo) return;
      // Touch all fields to show any errors
      const allTouched = {};
      modelInfo.feature_names.forEach((n) => { allTouched[n] = true; });
      setTouched(allTouched);
      if (!canSubmit) return;

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
        const entry = {
          id: Date.now(),
          at: new Date().toISOString(),
          label: data.label,
          confidence_level: data.confidence_level,
          probability: data.probability,
          features,
        };
        setHistory((prev) => [entry, ...prev].slice(0, 6));
        setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      } catch (e) {
        setPredictError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [modelInfo, canSubmit, values]
  );

  const copyPayload = useCallback(async () => {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1300);
    } catch {
      setCopied(false);
    }
  }, [payload]);

  const applyHistoryEntry = useCallback((entry) => {
    if (!modelInfo || !Array.isArray(entry?.features)) return;
    const next = {};
    const nextTouched = {};
    modelInfo.feature_names.forEach((name, idx) => {
      next[name] = String(entry.features[idx] ?? "");
      nextTouched[name] = true;
    });
    setValues(next);
    setTouched(nextTouched);
    setPredictError(null);
    setResult(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [modelInfo]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (!busy) {
          onSubmit();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onSubmit]);

  const outcome = result ? friendlyOutcomeLabel(result.label, result.confidence_level) : null;

  useEffect(() => {
    if (modelInfo && Object.keys(values).length === 0) {
      initializeToMidpoints(modelInfo);
    }
  }, [modelInfo, values, initializeToMidpoints]);

  return (
    <div
      className={`layout ${uiPrefs.highContrast ? "layout--contrast" : ""} ${uiPrefs.largeText ? "layout--large-text" : ""} ${uiPrefs.reducedMotion ? "layout--reduced-motion" : ""}`}
    >
      <header className="hero">
        <div className="hero-toprow">
          <div className="hero-badge">AI Breast Cancer Predictor Tool</div>
          <span className={`status-pill status-pill--${apiStatus}`}>
            API {apiStatus}
          </span>
        </div>
        <h1>AI Breast Cancer<br />Predictor Tool</h1>
        <p className="tagline">
          Product-style educational app for screening model behavior on breast-cancer cell features.
          It compares multiple models and highlights explainability so predictions are interpretable.
        </p>
      </header>

      <section className="card visibility-card">
        <h2>Visibility and comfort</h2>
        <div className="toggle-row">
          <TogglePill
            active={uiPrefs.highContrast}
            onClick={() => setUiPrefs((p) => ({ ...p, highContrast: !p.highContrast }))}
            label="High contrast"
          />
          <TogglePill
            active={uiPrefs.largeText}
            onClick={() => setUiPrefs((p) => ({ ...p, largeText: !p.largeText }))}
            label="Large text"
          />
          <TogglePill
            active={uiPrefs.reducedMotion}
            onClick={() => setUiPrefs((p) => ({ ...p, reducedMotion: !p.reducedMotion }))}
            label="Reduced motion"
          />
        </div>
      </section>

      <div className="disclaimer" role="alert" aria-label="Medical disclaimer">
        <span className="disclaimer-icon">⚠</span>
        <div>
          <strong>Educational use only.</strong> This is not a medical device and cannot
          examine real patients, read scans, or replace clinical judgement. Never use
          it to make decisions about care.
        </div>
      </div>

      {loadError ? (
        <section className="card">
          <h2>Could not connect to the model</h2>
          <p className="muted">Start the API server, then refresh this page.</p>
          <pre className="error-box">{`python backend/main.py\n\nDetails: ${loadError}`}</pre>
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

          <section className="card workflow">
            <h2>Simple workflow</h2>
            <div className="workflow-list">
              <p className="workflow-item">1. Adjust the feature sliders.</p>
              <p className="workflow-item">2. Click Predict.</p>
              <p className="workflow-item">3. Inspect label, probabilities, and top 3 driving factors.</p>
            </div>
            {nextFieldName ? (
              <p className="next-step">
                Next field to complete: <strong>{hintForFeature(nextFieldName).title}</strong>
              </p>
            ) : (
              <p className="next-step next-step--ok">All inputs are valid. You can run prediction.</p>
            )}
            <div className="workflow-actions">
              <button
                className="btn btn--ghost btn--sm"
                type="button"
                onClick={() => focusNextField(nextFieldName)}
                disabled={!nextFieldName}
              >
                Jump to next field
              </button>
              <span className="kbd-tip">Tip: press Ctrl+Enter to run prediction</span>
            </div>
            {invalidCount > 0 && (
              <p className="invalid-summary">{invalidCount} field(s) still need valid values.</p>
            )}
          </section>

          <form className="card" onSubmit={onSubmit}>
            <div className="form-header">
              <h2>Input Features (Sliders)</h2>
            </div>
            <p className="muted form-subhead">
              Move sliders to simulate nucleus measurement values from the Wisconsin dataset.
            </p>

            <div className="quick-actions">
              <button className="btn btn--ghost btn--sm" type="button" onClick={() => applyPreset("malignant_like")}>
                Malignant-like preset
              </button>
              <button className="btn btn--ghost btn--sm" type="button" onClick={() => applyPreset("benign_like")}>
                Benign-like preset
              </button>
              <button className="btn btn--ghost btn--sm" type="button" onClick={fillMidpoints}>
                Fill midpoint values
              </button>
              <button className="btn btn--ghost btn--sm" type="button" onClick={clearForm}>
                Clear all
              </button>
            </div>

            <div className="field-grid">
              {featureNames.map((name, i) => {
                const hint = hintForFeature(name);
                const err = fieldError(name);
                const val = values[name] ?? "";
                const filled = val !== "" && !Number.isNaN(parseFloat(val));
                const bounds = modelInfo?.feature_bounds?.[name];
                const parsed = parseField(name);
                let valueBand = null;
                if (bounds && parsed.valid) {
                  const [lo, hi] = bounds;
                  const ratio = (parsed.value - lo) / Math.max(hi - lo, 1e-6);
                  if (ratio < 0.2) valueBand = { label: "Near lower bound", tone: "low" };
                  else if (ratio > 0.8) valueBand = { label: "Near upper bound", tone: "high" };
                  else valueBand = { label: "Mid-range", tone: "mid" };
                }
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
                      {bounds ? (
                        <>
                          <input
                            id={`in-${name}`}
                            name={name}
                            type="range"
                            min={bounds[0]}
                            max={bounds[1]}
                            step={sliderStepFor(name)}
                            value={val}
                            onChange={(e) => onChange(name, e.target.value)}
                            onBlur={() => onBlur(name)}
                            className="slider"
                          />
                          <div className="range-labels">
                            <span>{bounds[0]}</span>
                            <span>{bounds[1]}</span>
                          </div>
                        </>
                      ) : null}
                      <input
                        id={`num-${name}`}
                        name={`num-${name}`}
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
                        className="number-input"
                      />
                      {filled && !err && <span className="input-check" aria-hidden>✓</span>}
                    </div>
                    {bounds && <p className="field-bounds">Allowed range: {bounds[0]} to {bounds[1]}</p>}
                    {valueBand && <span className={`value-band value-band--${valueBand.tone}`}>{valueBand.label}</span>}
                    {err && <p className="field-error-msg" id={`err-${name}`} role="alert">{err}</p>}
                    <span className="technical-pill" title="Dataset column name">{hint.technical}</span>
                  </div>
                );
              })}
            </div>

            <div className="actions">
              <button
                className="btn btn--primary"
                type="submit"
                disabled={!canSubmit || busy}
                aria-busy={busy}
              >
                {busy
                  ? <><span className="spinner spinner--sm" aria-hidden /> Analysing…</>
                  : "Predict"}
              </button>
            </div>

            <div className="form-tools">
              <details className="payload-box" open={false}>
                <summary>Request preview (JSON payload)</summary>
                <pre>{payload ? JSON.stringify(payload, null, 2) : "Fill valid values to preview payload"}</pre>
              </details>
              <div className="payload-actions">
                <button className="btn btn--ghost btn--sm" type="button" onClick={copyPayload} disabled={!payload}>
                  Copy payload JSON
                </button>
                {copied && <span className="copy-ok">Copied</span>}
              </div>
            </div>

            {predictError && (
              <div className="error-box" role="alert">
                <strong>Prediction failed</strong>
                <pre>{predictError}</pre>
              </div>
            )}
          </form>

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
                  return <AnimatedBar key={label} pct={pct} tone={tone} reducedMotion={uiPrefs.reducedMotion} />;
                })}
              </div>

              {Array.isArray(result.top_factors) && result.top_factors.length > 0 && (
                <section className="explain-card">
                  <h3>Top 3 factors affecting this prediction</h3>
                  <ul className="factor-list">
                    {result.top_factors.map((item) => (
                      <li key={item.feature} className="factor-item">
                        <strong>{item.feature}</strong>
                        <span>value: {Number(item.value).toFixed(4)}</span>
                        <span>impact: {Number(item.impact).toFixed(4)}</span>
                        <span>direction: {item.direction}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

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
                onClick={() => { clearForm(); }}
              >
                Reset and try again
              </button>
            </section>
          )}

          {history.length > 0 && (
            <section className="card history-card" aria-label="Recent predictions">
              <div className="form-header">
                <h2>Recent predictions</h2>
                <button className="btn btn--ghost btn--sm" type="button" onClick={clearHistory}>
                  Clear history
                </button>
              </div>
              <div className="history-list">
                {history.map((item) => (
                  <div className="history-item" key={item.id}>
                    <div>
                      <p className="history-title">
                        {String(item.label).toLowerCase() === "benign" ? "Benign" : "Malignant"} · {(Number(item.probability) * 100).toFixed(1)}%
                      </p>
                      <p className="history-meta">{formatTimestamp(item.at)} · confidence {item.confidence_level}</p>
                    </div>
                    <button className="btn btn--ghost btn--sm" type="button" onClick={() => applyHistoryEntry(item)}>
                      Reuse values
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="card">
            <h2>Global feature importance</h2>
            {topImportance.length === 0 ? (
              <p className="muted">No feature importance available for this model.</p>
            ) : (
              <div className="importance-grid importance-grid--chart">
                {topImportance.map((row) => (
                  <div key={row.feature} className="importance-row importance-row--bar">
                    <div className="importance-head">
                      <span>{row.feature}</span>
                      <span>{(Number(row.importance) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="importance-track" aria-hidden>
                      <div
                        className="importance-fill"
                        style={{ width: `${Math.max(0, Math.min(100, Number(row.importance) * 100))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {confusion && (
            <section className="card">
              <h2>Clinical impact view (confusion matrix)</h2>
              <p className="muted form-subhead">
                False negatives are high-risk in screening contexts because malignant cases may be missed.
              </p>
              <div className="cm-grid" role="img" aria-label="Confusion matrix heatmap">
                <div className="cm-cell cm-cell--tn">
                  <span className="cm-label">True Negative</span>
                  <strong>{confusion.tn}</strong>
                </div>
                <div className="cm-cell cm-cell--fp">
                  <span className="cm-label">False Positive</span>
                  <strong>{confusion.fp}</strong>
                </div>
                <div className="cm-cell cm-cell--fn">
                  <span className="cm-label">False Negative</span>
                  <strong>{confusion.fn}</strong>
                </div>
                <div className="cm-cell cm-cell--tp">
                  <span className="cm-label">True Positive</span>
                  <strong>{confusion.tp}</strong>
                </div>
              </div>
              <p className="impact-text">
                False negatives: <strong>{confusion.fn}</strong> ({(confusion.fnRate * 100).toFixed(1)}% of actual malignant samples).
                Lower is better because missed malignant cases are the highest-risk outcome.
              </p>
            </section>
          )}

          <section className="card">
            <h2>Model comparison</h2>
            <p className="muted form-subhead">
              Best model: <strong>{modelInfo?.best_model || "N/A"}</strong>. {modelInfo?.best_model_reason || ""}
            </p>
            {comparisonRows.length > 0 ? (
              <div className="comparison-table-wrap">
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th>Accuracy</th>
                      <th>Precision (malignant)</th>
                      <th>Recall (malignant)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map(([modelName, m]) => (
                      <tr key={modelName}>
                        <td>{modelName}</td>
                        <td>{Number(m.accuracy ?? 0).toFixed(4)}</td>
                        <td>{Number(m.precision_malignant ?? 0).toFixed(4)}</td>
                        <td>{Number(m.recall_malignant ?? 0).toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">Model comparison is unavailable.</p>
            )}
          </section>
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
