import { 
  Radar, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  ResponsiveContainer 
} from 'recharts';
import { Card, cn } from "./ui";
import { Award, Layers, Scale } from "lucide-react";

export function ModelComparison({ modelInfo }) {
  if (!modelInfo) return null;

  const { model_comparison, best_model, best_model_reason } = modelInfo;
  
  const metricsData = Object.entries(model_comparison).map(([name, m]) => ({
    model: name.replace('_', ' '),
    accuracy: m.accuracy * 100,
    recall: m.recall_malignant * 100,
    precision: m.precision_malignant * 100,
  }));

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <Card className="bg-medical-50 border-medical-200">
        <div className="flex items-start gap-4">
          <div className="bg-medical-500 p-2 rounded-lg">
            <Award className="w-6 h-6 text-white" />
          </div>
          <div>
            <h4 className="text-lg font-bold text-slate-900">Best Model: <span className="capitalize">{best_model.replace('_', ' ')}</span></h4>
            <p className="text-sm text-slate-700 mt-1 italic leading-relaxed">
              "{best_model_reason}"
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Scale className="w-4 h-4 text-medical-600" />
            Performance Metrics (%)
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="text-left py-2 font-medium">Model</th>
                  <th className="text-right py-2 font-medium">Accuracy</th>
                  <th className="text-right py-2 font-medium">Recall (Mal)</th>
                  <th className="text-right py-2 font-medium">Precision (Mal)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {metricsData.map((d, i) => (
                  <tr key={i} className={cn("hover:bg-slate-50 transition-colors", d.model === best_model.replace('_', ' ') && "bg-medical-50/50 font-semibold")}>
                    <td className="py-3 capitalize">{d.model}</td>
                    <td className="text-right py-3">{d.accuracy.toFixed(1)}%</td>
                    <td className="text-right py-3 text-malignant-600">{d.recall.toFixed(1)}%</td>
                    <td className="text-right py-3">{d.precision.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Layers className="w-4 h-4 text-medical-600" />
            Model Trade-offs
          </h4>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={metricsData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="model" tick={{ fontSize: 10 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} hide />
                <Radar
                  name="Accuracy"
                  dataKey="accuracy"
                  stroke="#0ea5e9"
                  fill="#0ea5e9"
                  fillOpacity={0.4}
                />
                <Radar
                  name="Recall"
                  dataKey="recall"
                  stroke="#dc2626"
                  fill="#dc2626"
                  fillOpacity={0.2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 text-[10px] font-bold uppercase tracking-widest mt-2">
            <span className="flex items-center gap-1 text-medical-600">
              <span className="w-2 h-2 bg-medical-500 rounded-full" /> Accuracy
            </span>
            <span className="flex items-center gap-1 text-malignant-600">
              <span className="w-2 h-2 bg-malignant-500 rounded-full" /> Recall (Safety)
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}
