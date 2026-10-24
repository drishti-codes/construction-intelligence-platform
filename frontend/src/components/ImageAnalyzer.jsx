import React, { useState } from "react";
import { analyzeImage } from "../api.js";

const sevClass = (s) => `pill pill-${String(s).toLowerCase().replace(/\s+/g, "-")}`;

function SafetyResult({ r }) {
  return (
    <>
      <div className="metrics">
        <div className="metric"><span>Safety score</span><b>{r.safety_score}/100</b></div>
        <div className="metric"><span>Status</span><b>{r.overall_status}</b></div>
      </div>
      <h4>PPE checklist</h4>
      <ul className="plain">
        {Object.entries(r.ppe).map(([k, v]) => (
          <li key={k}>{k.replace(/_/g, " ")}: <span className={sevClass(v === "Compliant" ? "low" : v === "Missing" ? "high" : "medium")}>{v}</span></li>
        ))}
      </ul>
      <h4>Hazards</h4>
      {r.hazards.length === 0 && <p className="muted">No hazards identified.</p>}
      {r.hazards.map((h, i) => (
        <div className="card-sm" key={i}>
          <b>{h.name}</b> <span className={sevClass(h.severity)}>{h.severity}</span>
          <p>{h.remedy}</p>
        </div>
      ))}
    </>
  );
}

function CrackResult({ r }) {
  return (
    <>
      <div className="metrics">
        <div className="metric"><span>Crack type</span><b>{r.crack_type}</b></div>
        <div className="metric"><span>Width (est.)</span><b>{r.estimated_width_mm} mm</b></div>
        <div className="metric"><span>Severity</span><b><span className={sevClass(r.severity)}>{r.severity}</span></b></div>
        <div className="metric"><span>Urgency</span><b>{r.urgency}</b></div>
      </div>
      <h4>Probable causes</h4>
      <ul>{r.probable_causes.map((c, i) => <li key={i}>{c}</li>)}</ul>
      <h4>Corrective actions</h4>
      <ul>{r.corrective_actions.map((c, i) => <li key={i}>{c}</li>)}</ul>
    </>
  );
}

export default function ImageAnalyzer({ endpoint, title, hint, Result }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);

  const onFile = (e) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const run = async () => {
    setError("");
    setReport(null);
    if (!file && !description.trim()) return setError("Upload an image or write a description first.");
    setLoading(true);
    try {
      setReport(await analyzeImage(endpoint, file, description));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const download = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${endpoint}-report.json`;
    a.click();
  };

  return (
    <section className="panel">
      <h2>{title}</h2>
      <p className="muted">{hint}</p>
      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} />
      {preview && <img className="preview" src={preview} alt="Selected upload preview" />}
      <textarea rows={3} placeholder="Optional: describe the site / location / observations" value={description} onChange={(e) => setDescription(e.target.value)} />
      <button onClick={run} disabled={loading}>{loading ? "Analysing..." : "Analyse"}</button>
      {error && <div className="error" role="alert">{error}</div>}
      {report && (
        <div className="result">
          {report.mode === "demo" && <div className="banner">{report.warning || "Demo output"}</div>}
          <Result r={report} />
          <p className="summary">{report.summary}</p>
          <button className="secondary" onClick={download}>Download JSON report</button>
        </div>
      )}
    </section>
  );
}

export const SafetyTab = () => (
  <ImageAnalyzer endpoint="safety" title="Site Safety & PPE Audit" hint="Upload a site photo to check PPE compliance and hazards." Result={SafetyResult} />
);
export const CrackTab = () => (
  <ImageAnalyzer endpoint="cracks" title="Crack Diagnostics" hint="Upload a wall or concrete photo to classify the crack and get repair advice." Result={CrackResult} />
);
