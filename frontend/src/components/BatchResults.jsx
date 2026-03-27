import Papa from "papaparse";
import { Download, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { Button, Card, cn } from "./ui";

export function BatchResults({ results, originalData, onReset }) {
  if (!results || results.length === 0) return null;

  const handleDownload = () => {
    const exportData = results.map((r, i) => ({
      ...originalData[i],
      prediction: r.label,
      probability: (r.probability * 100).toFixed(2) + "%",
      confidence: r.confidence_level
    }));

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "prediction_results.csv";
    a.click();
  };

  const malignantCount = results.filter(r => r.label.toLowerCase() === "malignant").length;
  const benignCount = results.length - malignantCount;

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <Card className="bg-medical-50 border-medical-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-medical-600 p-2 rounded-lg">
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Batch Processing Complete</h3>
              <p className="text-sm text-slate-600">Successfully analyzed {results.length} samples</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onReset}>New Upload</Button>
            <Button size="sm" onClick={handleDownload} className="gap-2">
              <Download className="w-4 h-4" /> Export CSV
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="flex items-center justify-center p-8 text-center border-l-8 border-l-malignant-500">
          <div>
            <span className="text-4xl font-black text-malignant-600">{malignantCount}</span>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">Malignant Detected</p>
          </div>
        </Card>
        <Card className="flex items-center justify-center p-8 text-center border-l-8 border-l-benign-500">
          <div>
            <span className="text-4xl font-black text-benign-600">{benignCount}</span>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">Benign Detected</p>
          </div>
        </Card>
      </div>

      <Card>
        <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4 text-medical-600" />
          Detailed Results
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="text-left py-2 font-medium">#</th>
                <th className="text-left py-2 font-medium">Prediction</th>
                <th className="text-right py-2 font-medium">Confidence</th>
                <th className="text-right py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {results.slice(0, 10).map((r, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 text-slate-400 font-mono text-xs">{i + 1}</td>
                  <td className={cn(
                    "py-3 font-bold uppercase tracking-wider",
                    r.label.toLowerCase() === "malignant" ? "text-malignant-600" : "text-benign-600"
                  )}>
                    {r.label}
                  </td>
                  <td className="text-right py-3 font-medium text-slate-700">
                    {(r.probability * 100).toFixed(1)}%
                  </td>
                  <td className="text-right py-3">
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider",
                      r.confidence_level === "high" ? "bg-green-100 text-green-700" : 
                      r.confidence_level === "moderate" ? "bg-yellow-100 text-yellow-700" : 
                      "bg-slate-100 text-slate-700"
                    )}>
                      {r.confidence_level}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {results.length > 10 && (
            <p className="text-xs text-slate-400 italic mt-4 text-center">
              Showing first 10 results. Export CSV to see all {results.length} predictions.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
