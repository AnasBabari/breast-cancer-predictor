import { useState } from "react";
import Papa from "papaparse";
import { Upload, FileDown, AlertCircle, CheckCircle2, Loader2, Info } from "lucide-react";
import { Button, Card, Alert, cn } from "./ui";

export function BatchUpload({ featureNames, onResults }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    
    setFile(selectedFile);
    setError(null);
    setPreview(null);

    // Initial parse for preview/validation
    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          setError("Error parsing CSV file.");
          return;
        }
        
        const headers = results.meta.fields;
        const missing = featureNames.filter(n => !headers.includes(n));
        
        if (missing.length > 0) {
          setError(`Missing required columns: ${missing.join(", ")}`);
          return;
        }

        setPreview(results.data.slice(0, 5));
      }
    });
  };

  const handleUpload = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const samples = results.data.map(row => 
            featureNames.map(name => parseFloat(row[name]))
          );

          // Validate numbers
          if (samples.some(s => s.some(v => isNaN(v)))) {
            throw new Error("Some rows contain non-numeric data in required columns.");
          }

          const res = await fetch("/predict/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ samples }),
          });

          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "Batch prediction failed");
          }

          const data = await res.json();
          onResults(data.results, results.data);
        } catch (err) {
          setError(err.message);
        } finally {
          setBusy(false);
        }
      }
    });
  };

  const downloadTemplate = () => {
    const csv = Papa.unparse([
      featureNames.reduce((acc, name) => ({ ...acc, [name]: 0 }), {})
    ]);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bcp_template.csv";
    a.click();
  };

  return (
    <Card className="flex flex-col gap-6">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Batch Processing</h2>
          <p className="text-sm text-slate-500">Upload a CSV file for multiple predictions</p>
        </div>
        <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-2">
          <FileDown className="w-4 h-4" /> Template
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <Upload className="w-8 h-8 text-slate-400 mb-2" />
            <p className="text-sm text-slate-500">
              <span className="font-semibold text-medical-600">Click to upload</span> or drag and drop
            </p>
            <p className="text-xs text-slate-400 mt-1">CSV file with tumor measurements</p>
          </div>
          <input type="file" className="hidden" accept=".csv" onChange={handleFileChange} />
        </label>

        {file && !error && (
          <div className="flex items-center justify-between p-3 bg-medical-50 border border-medical-100 rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-medical-600" />
              <span className="text-sm font-medium text-medical-800">{file.name}</span>
            </div>
            <span className="text-xs text-medical-600 font-mono">Ready to process</span>
          </div>
        )}

        {error && (
          <Alert variant="error" icon={<AlertCircle className="w-4 h-4" />}>
            {error}
          </Alert>
        )}

        <Button 
          onClick={handleUpload} 
          disabled={!file || busy || !!error}
          className="w-full py-6 text-lg gap-2"
        >
          {busy ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Processing Samples...
            </>
          ) : (
            "Start Batch Analysis"
          )}
        </Button>
      </div>

      <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
          <Info className="w-3 h-3" /> Requirements
        </h4>
        <ul className="text-xs text-slate-500 space-y-1 list-disc list-inside">
          <li>CSV must include headers matching all {featureNames.length} features.</li>
          <li>Maximum 100 samples per batch.</li>
          <li>All measurement columns must contain numeric values.</li>
        </ul>
      </div>
    </Card>
  );
}
