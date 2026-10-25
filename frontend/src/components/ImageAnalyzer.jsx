import React, { useState } from "react";
import { analyzeImage } from "../api.js";
import { Banner, Bullets, DownloadJson, ErrorMsg, L, Metric, sevClass, useRequest } from "./ui.jsx";

function SafetyResult({ r }) {
  return (
    <>
      <div className="metrics">
        <Metric label="Safety score">{r.safety_score}/100</Metric>
        <Metric label="Status">{r.overall_status}</Metric>
      </div>
      <h4>PPE checklist</h4>
      <ul className="plain">
        {Object.entries(r.ppe || {}).map(([k, v]) => (
          <li key={k}>{k.replace(/_/g, " ")}: <span className={sevClass(v === "Compliant" ? "low" : v === "Missing" ? "high" : "medium")}>{v}</span></li>
        ))}
      </ul>
      <h4>Hazards</h4>
      {L(r.hazards).length === 0 && <p className="muted">No hazards identified.</p>}
      {L(r.hazards).map((h, i) => (
        <div className="card-sm" key={i}>
          <b>{h.name}</b> <span className={sevClass(h.severity)}>{h.severity}</span>
          {h.remedy && <p>{h.remedy}</p>}
        </div>
      ))}
      <Bullets title="Recommended PPE" items={r.recommended_ppe} />
      <Bullets title="Safety guidelines" items={r.safety_guidelines} />
      <Bullets title="Environmental risks" items={r.environmental_risks} />
    </>
  );
}

function CrackResult({ r }) {
  return (
    <>
      <div className="metrics">
        <Metric label="Crack type">{r.crack_type}</Metric>
        <Metric label="Width (est.)">{r.estimated_width_mm} mm</Metric>
        <Metric label="Severity"><span className={sevClass(r.severity)}>{r.severity}</span></Metric>
        <Metric label="Urgency">{r.urgency}</Metric>
      </div>
      <Bullets title="Probable causes" items={r.probable_causes} />
      <Bullets title="Potential risks" items={r.potential_risks} />
      <Bullets title="Corrective actions (repair)" items={r.corrective_actions} />
      <Bullets title="Preventive measures" items={r.preventive_measures} />
    </>
  );
}

function ImageAnalyzer({ endpoint, title, hint, Result }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [description, setDescription] = useState("");
  const [localError, setLocalError] = useState("");
  const { data, error, loading, run } = useRequest(analyzeImage);

  const onFile = (e) => {
    const f = e.target.files?.[0] || null;
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const submit = () => {
    setLocalError("");
    if (!file && !description.trim()) return setLocalError("Upload an image or write a description first.");
    run(endpoint, file, description);
  };

  return (
    <section className="panel">
      <h2>{title}</h2>
      <p className="muted">{hint}</p>
      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} />
      {preview && <img className="preview" src={preview} alt="Selected upload preview" />}
      <textarea rows={3} placeholder="Optional: describe the site / location / observations" value={description} onChange={(e) => setDescription(e.target.value)} />
      <button onClick={submit} disabled={loading}>{loading ? "Analysing..." : "Analyse"}</button>
      <ErrorMsg error={localError || error} />
      {data && (
        <div className="result">
          <Banner r={data} />
          <Result r={data} />
          {data.summary && <p className="summary">{data.summary}</p>}
          <DownloadJson data={data} name={endpoint} />
        </div>
      )}
    </section>
  );
}

export const SafetyTab = () => (
  <ImageAnalyzer endpoint="safety" title="Site Safety & PPE Audit" hint="Upload a site photo to check PPE compliance, hazards and environmental risks." Result={SafetyResult} />
);
export const CrackTab = () => (
  <ImageAnalyzer endpoint="cracks" title="Crack Diagnostics" hint="Upload a wall or concrete photo to classify the crack, assess severity and get repair advice." Result={CrackResult} />
);
