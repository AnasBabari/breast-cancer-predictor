import { Button, Card, cn } from "./ui";
import { Info } from "lucide-react";

export function FeatureInputs({ 
  featureNames, 
  featureBounds, 
  values, 
  setValues, 
  busy,
  onPredict,
  onReset,
  presets
}) {
  const handleChange = (name, val) => {
    setValues(prev => ({ ...prev, [name]: val }));
  };

  return (
    <Card className="flex flex-col gap-6">
      <div className="flex items-center justify-between border-b pb-4">
        <h2 className="text-xl font-bold text-slate-800">Tumor Measurements</h2>
        <div className="flex gap-2">
          {Object.entries(presets).map(([key, p]) => (
            <Button 
              key={key} 
              variant="outline" 
              size="sm" 
              onClick={() => setValues(p)}
              className="text-xs h-8 px-2"
            >
              {key.replace('_', ' ')}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
        {featureNames.map((name) => {
          const [min, max] = featureBounds[name] || [0, 100];
          const step = (max - min) / 100;
          const val = values[name] === "" ? (min + max) / 2 : parseFloat(values[name]);

          return (
            <div key={name} className="flex flex-col gap-2">
              <div className="flex justify-between items-center text-sm font-medium">
                <label className="text-slate-700 capitalize flex items-center gap-1">
                  {name}
                </label>
                <span className="text-medical-600 font-bold bg-medical-50 px-2 py-1 rounded">
                  {val.toFixed(3)}
                </span>
              </div>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={val}
                onChange={(e) => handleChange(name, e.target.value)}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-medical-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono uppercase tracking-tighter">
                <span>{min.toFixed(2)}</span>
                <span>{max.toFixed(2)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-4 pt-4 border-t">
        <Button 
          onClick={onPredict} 
          disabled={busy}
          className="flex-1 py-6 text-lg"
        >
          {busy ? "Analyzing..." : "Generate Prediction"}
        </Button>
        <Button 
          variant="secondary" 
          onClick={onReset}
          className="px-6"
        >
          Reset
        </Button>
      </div>
    </Card>
  );
}
