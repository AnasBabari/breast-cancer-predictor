import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';
import { Card, Alert, cn } from "./ui";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";

export function ResultDisplay({ result }) {
  if (!result) return null;

  const { label, probability, probabilities, top_factors } = result;
  const isMalignant = label.toLowerCase() === "malignant";
  
  const chartData = Object.entries(probabilities).map(([name, val]) => ({
    name,
    probability: val * 100,
  }));

  const factorData = top_factors.map(f => ({
    feature: f.feature,
    impact: f.impact,
    direction: f.direction
  }));

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <Card className={cn(
        "border-l-8 p-8 transition-all duration-300",
        isMalignant ? "border-malignant-600 bg-malignant-50" : "border-benign-600 bg-benign-50"
      )}>
        <div className="flex items-start gap-4">
          {isMalignant ? (
            <AlertCircle className="w-12 h-12 text-malignant-600 flex-shrink-0 mt-1" />
          ) : (
            <CheckCircle2 className="w-12 h-12 text-benign-600 flex-shrink-0 mt-1" />
          )}
          <div className="flex flex-col gap-2">
            <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight uppercase">
              {label} Prediction
            </h3>
            <p className="text-lg text-slate-700 font-medium">
              The model indicates a <strong>{(probability * 100).toFixed(1)}%</strong> probability of {label} tumor patterns.
            </p>
            <Alert 
              variant={isMalignant ? "error" : "success"} 
              className="mt-2 bg-white/60 border-none shadow-sm backdrop-blur-sm"
            >
              {result.confidence_note}
            </Alert>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Info className="w-4 h-4 text-medical-600" />
            Class Probabilities (%)
          </h4>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} />
                <Tooltip 
                  formatter={(val) => [`${val.toFixed(1)}%`, 'Probability']}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="probability" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.name.toLowerCase() === 'malignant' ? '#dc2626' : '#16a34a'} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Info className="w-4 h-4 text-medical-600" />
            Top Contributing Factors
          </h4>
          <div className="flex flex-col gap-3">
            {top_factors.map((f, i) => (
              <div key={i} className="flex flex-col gap-1 p-3 bg-slate-50 rounded-lg border border-slate-100 transition-hover hover:shadow-sm">
                <div className="flex justify-between text-sm">
                  <span className="font-semibold text-slate-700 capitalize">{f.feature}</span>
                  <span className={cn(
                    "text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider",
                    f.direction === "malignant" ? "bg-malignant-100 text-malignant-600" : "bg-benign-100 text-benign-600"
                  )}>
                    {f.direction}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 rounded-full mt-1">
                  <div 
                    className={cn(
                      "h-full rounded-full",
                      f.direction === "malignant" ? "bg-malignant-500" : "bg-benign-500"
                    )}
                    style={{ width: `${Math.min(100, f.impact * 50)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
