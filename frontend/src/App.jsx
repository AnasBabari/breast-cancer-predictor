import { useCallback, useEffect, useState } from "react";
import { 
  Activity, 
  History, 
  LayoutDashboard, 
  RefreshCcw, 
  Settings2, 
  ShieldAlert,
  Menu,
  X,
  Stethoscope
} from "lucide-react";
import { Button, Card, Alert, cn } from "./components/ui";
import { FeatureInputs } from "./components/FeatureInputs";
import { ResultDisplay } from "./components/ResultDisplay";
import { ModelComparison } from "./components/ModelComparison";

const STORAGE_KEY = "bcp:form-values:v1";
const HISTORY_KEY = "bcp:prediction-history:v1";

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

export default function App() {
  const [modelInfo, setModelInfo] = useState(null);
  const [values, setValues] = useState({});
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState("predict");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Initialize
  useEffect(() => {
    async function init() {
      try {
        const res = await fetch("/model_info");
        if (!res.ok) throw new Error("Failed to load model info");
        const info = await res.json();
        setModelInfo(info);

        // Load saved values or use defaults
        const initial = {};
        info.feature_names.forEach(n => { initial[n] = ""; });
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            info.feature_names.forEach(n => {
              if (parsed[n] !== undefined) initial[n] = parsed[n];
            });
          } catch {}
        }
        setValues(initial);

        // Load history
        const savedHistory = localStorage.getItem(HISTORY_KEY);
        if (savedHistory) {
          try {
            setHistory(JSON.parse(savedHistory));
          } catch {}
        }
      } catch (err) {
        setLoadError(err.message);
      }
    }
    init();
  }, []);

  // Save values to local storage
  useEffect(() => {
    if (Object.keys(values).length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    }
  }, [values]);

  // Save history to local storage
  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  const handlePredict = async () => {
    setBusy(true);
    setLoadError(null);
    try {
      const featureArray = modelInfo.feature_names.map(n => {
        const v = values[n];
        if (v === "") {
          const [lo, hi] = modelInfo.feature_bounds[n];
          return (lo + hi) / 2;
        }
        return parseFloat(v);
      });

      const res = await fetch("/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features: featureArray }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Prediction failed");
      }

      const data = await res.json();
      setResult(data);
      
      const entry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        label: data.label,
        probability: data.probability,
        values: { ...values }
      };
      setHistory(prev => [entry, ...prev].slice(0, 10));
      
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleReset = () => {
    const resetValues = {};
    modelInfo.feature_names.forEach(n => { resetValues[n] = ""; });
    setValues(resetValues);
    setResult(null);
  };

  if (!modelInfo && !loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <RefreshCcw className="w-8 h-8 text-medical-600 animate-spin" />
          <p className="text-slate-500 font-medium animate-pulse">Initializing Medical AI Model...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Mobile Sidebar Toggle */}
      <button 
        className="lg:hidden fixed bottom-6 right-6 z-50 p-4 bg-medical-600 text-white rounded-full shadow-xl"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        {isSidebarOpen ? <X /> : <Menu />}
      </button>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-72 bg-white border-r border-slate-200 transition-transform duration-300 lg:translate-x-0 lg:static",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="bg-medical-600 p-2 rounded-lg">
                <Stethoscope className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-xl font-extrabold text-slate-800 tracking-tight">
                BCP <span className="text-medical-600 font-normal">AI Tool</span>
              </h1>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            <button
              onClick={() => { setActiveTab("predict"); setIsSidebarOpen(false); }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all font-medium",
                activeTab === "predict" ? "bg-medical-50 text-medical-700 shadow-sm" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <LayoutDashboard className="w-5 h-5" /> Prediction
            </button>
            <button
              onClick={() => { setActiveTab("compare"); setIsSidebarOpen(false); }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all font-medium",
                activeTab === "compare" ? "bg-medical-50 text-medical-700 shadow-sm" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <Activity className="w-5 h-5" /> Model Analysis
            </button>
            <div className="pt-6 pb-2 px-4 uppercase text-[10px] font-bold tracking-widest text-slate-400">Recent Activity</div>
            {history.length === 0 ? (
              <p className="px-4 py-2 text-xs text-slate-400 italic">No recent history</p>
            ) : (
              history.map(h => (
                <div 
                  key={h.id} 
                  className="px-4 py-3 rounded-lg bg-slate-50 border border-slate-100 text-xs flex flex-col gap-1 transition-hover hover:border-medical-200"
                >
                  <div className="flex justify-between items-center">
                    <span className={cn(
                      "font-bold uppercase tracking-wider",
                      h.label === "malignant" ? "text-malignant-600" : "text-benign-600"
                    )}>{h.label}</span>
                    <span className="text-slate-400 text-[10px]">{new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="text-slate-500 font-medium">Confidence: {(h.probability * 100).toFixed(0)}%</div>
                </div>
              ))
            )}
          </nav>

          <div className="p-4 border-t border-slate-100">
            <Alert variant="warning" className="p-3 text-[10px] leading-tight opacity-75 grayscale hover:grayscale-0 transition-all">
              <ShieldAlert className="w-3 h-3 inline mr-1" />
              Educational tool only. Not for clinical diagnosis.
            </Alert>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200 p-6 flex justify-between items-center lg:hidden">
          <div className="flex items-center gap-2">
             <Stethoscope className="w-6 h-6 text-medical-600" />
             <h1 className="text-lg font-bold text-slate-800">BCP Tool</h1>
          </div>
        </header>

        <div className="max-w-6xl mx-auto p-4 md:p-10 space-y-10">
          {loadError && (
            <Alert variant="error" title="System Error" className="mb-6">
              {loadError}
            </Alert>
          )}

          {activeTab === "predict" ? (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-10 items-start">
              <div className="xl:col-span-7 space-y-10">
                <FeatureInputs 
                  featureNames={modelInfo.feature_names}
                  featureBounds={modelInfo.feature_bounds}
                  values={values}
                  setValues={setValues}
                  busy={busy}
                  onPredict={handlePredict}
                  onReset={handleReset}
                  presets={PRESET_VALUES}
                />
              </div>
              <div className="xl:col-span-5">
                {result ? (
                  <ResultDisplay result={result} />
                ) : (
                  <Card className="flex flex-col items-center justify-center py-20 text-center border-dashed border-2 border-slate-200 bg-transparent">
                    <div className="bg-slate-100 p-4 rounded-full mb-4">
                      <LayoutDashboard className="w-10 h-10 text-slate-300" />
                    </div>
                    <h3 className="text-slate-600 font-bold text-lg">Awaiting Input</h3>
                    <p className="text-slate-400 max-w-xs text-sm mt-1">
                      Adjust the sliders and click "Generate Prediction" to see the AI analysis.
                    </p>
                  </Card>
                )}
              </div>
            </div>
          ) : (
            <ModelComparison modelInfo={modelInfo} />
          )}

          <footer className="pt-10 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-400 font-medium">
             <p>© 2026 AI Breast Cancer Predictor Tool</p>
             <div className="flex gap-6">
               <span className="flex items-center gap-1"><Settings2 className="w-3 h-3" /> Version 2.0 (FastAPI + XGBoost + SHAP)</span>
               <a href="/docs" target="_blank" className="hover:text-medical-600 transition-colors">API Documentation</a>
             </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
