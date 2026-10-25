import React, { useRef, useState } from "react";
import { analyzeImage } from "../api.js";
import {
  Banner,
  Bullets,
  CircularGauge,
  DownloadJson,
  ErrorMsg,
  IconAlertTriangle,
  IconCheckCircle,
  IconCrack,
  IconShield,
  IconUpload,
  L,
  Metric,
  sevClass,
  useRequest,
} from "./ui.jsx";

const MAX_DIMENSION = 1280;

// Resize large images in browser via Canvas before transmission
function downsampleImage(file, maxDimension = MAX_DIMENSION) {
  if (!file || !(file instanceof Blob)) return Promise.resolve(file);
  if (file._downsampled) return Promise.resolve(file);

  const type = file.type || "image/jpeg";
  if (!type.startsWith("image/")) return Promise.resolve(file);

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;

      // Keep original if dimensions are already within limit and file size is <= 1.5 MB
      if (width <= maxDimension && height <= maxDimension && file.size <= 1.5 * 1024 * 1024) {
        resolve(file);
        return;
      }

      // Preserve aspect ratio
      let targetWidth = width;
      let targetHeight = height;
      if (width > maxDimension || height > maxDimension) {
        if (width >= height) {
          targetHeight = Math.round((height * maxDimension) / width);
          targetWidth = maxDimension;
        } else {
          targetWidth = Math.round((width * maxDimension) / height);
          targetHeight = maxDimension;
        }
      }

      try {
        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        // Keep PNG format for PNGs (lossless/transparency); use 0.85 quality for JPEG and WebP
        const outputType = type === "image/png" ? "image/png" : (type === "image/webp" ? "image/webp" : "image/jpeg");
        const quality = outputType === "image/png" ? undefined : 0.85;

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            if (blob.size >= file.size && width <= maxDimension && height <= maxDimension) {
              resolve(file);
              return;
            }
            const fileName = file.name || `image.${outputType.split("/")[1] || "jpg"}`;
            const resizedFile = new File([blob], fileName, {
              type: outputType,
              lastModified: Date.now(),
            });
            resizedFile._downsampled = true;
            resolve(resizedFile);
          },
          outputType,
          quality
        );
      } catch {
        resolve(file);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });
}

function SafetyResult({ r }) {
  const ppeItems = Object.entries(r.ppe || {});

  return (
    <>
      <div className="gauge-overview">
        <CircularGauge score={r.safety_score} label="Safety Score" />
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase" }}>
            Audit Assessment
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              className={`pill ${
                r.overall_status === "Safe"
                  ? "pill-low"
                  : r.overall_status === "Unsafe"
                  ? "pill-critical"
                  : "pill-medium"
              }`}
              style={{ fontSize: "1rem", padding: "6px 16px" }}
            >
              {r.overall_status}
            </span>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: "0.88rem", color: "var(--muted)", maxWidth: "450px" }}>
            {r.overall_status === "Safe"
              ? "All critical safety protocols and standard PPE observed."
              : r.overall_status === "Unsafe"
              ? "Immediate action required: critical safety gaps or hazards detected."
              : "Moderate compliance: address missing PPE or elevated hazard points."}
          </p>
        </div>
      </div>

      <div style={{ marginTop: "12px" }}>
        <h4 style={{ margin: "0 0 10px", fontSize: "0.95rem", color: "var(--ink)" }}>PPE Compliance Checklist</h4>
        <div className="ppe-grid">
          {ppeItems.map(([item, status]) => {
            const isCompliant = status === "Compliant";
            const isMissing = status === "Missing";
            return (
              <div key={item} className="ppe-card">
                <span className="ppe-name">{item.replace(/_/g, " ")}</span>
                <span
                  className={`pill ${
                    isCompliant ? "pill-low" : isMissing ? "pill-critical" : "pill-medium"
                  }`}
                  style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                >
                  {isCompliant ? <IconCheckCircle size={13} color="currentColor" /> : isMissing ? <IconAlertTriangle size={13} color="currentColor" /> : null}
                  {status}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: "12px" }}>
        <h4 style={{ margin: "0 0 10px", fontSize: "0.95rem", color: "var(--ink)" }}>Identified Hazards ({L(r.hazards).length})</h4>
        {L(r.hazards).length === 0 && <p className="muted" style={{ fontStyle: "italic" }}>No critical site hazards identified.</p>}
        {L(r.hazards).map((h, i) => (
          <div key={i} className="hazard-card" style={{ borderLeftColor: h.severity === "Critical" || h.severity === "High" ? "#ef4444" : "#f59e0b" }}>
            <div className="hazard-header">
              <span className="hazard-title">{h.name}</span>
              <span className={sevClass(h.severity)}>{h.severity} Severity</span>
            </div>
            {h.remedy && <p className="hazard-remedy"><strong>Remedy:</strong> {h.remedy}</p>}
          </div>
        ))}
      </div>

      <Bullets title="Recommended PPE Upgrades" items={r.recommended_ppe} />
      <Bullets title="Site Safety Guidelines" items={r.safety_guidelines} />
      <Bullets title="Environmental & Ambient Risks" items={r.environmental_risks} />
    </>
  );
}

function CrackResult({ r }) {
  return (
    <>
      <div className="metrics">
        <Metric label="Crack Type" icon={IconCrack}>{r.crack_type}</Metric>
        <Metric label="Est. Width">{r.estimated_width_mm} mm</Metric>
        <Metric label="Severity">
          <span className={sevClass(r.severity)}>{r.severity}</span>
        </Metric>
        <Metric label="Urgency">{r.urgency}</Metric>
      </div>
      <Bullets title="Probable Root Causes" items={r.probable_causes} />
      <Bullets title="Structural Risks & Hazards" items={r.potential_risks} />
      <Bullets title="Recommended Corrective Repairs" items={r.corrective_actions} />
      <Bullets title="Preventive Measures" items={r.preventive_measures} />
    </>
  );
}

function ImageAnalyzer({ endpoint, title, hint, Result }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [description, setDescription] = useState("");
  const [fileInfo, setFileInfo] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [localError, setLocalError] = useState("");
  const fileInputRef = useRef(null);
  const { data, error, loading, run } = useRequest(analyzeImage);

  const handleSelectedFile = async (f) => {
    if (preview) URL.revokeObjectURL(preview);
    setFileInfo("");
    if (!f) {
      setFile(null);
      setPreview(null);
      return;
    }
    setPreview(URL.createObjectURL(f));
    setFile(f);
    try {
      const optimized = await downsampleImage(f);
      setFile(optimized);
      if (optimized !== f && optimized.size < f.size) {
        setFileInfo(`Image compressed: ${(f.size / (1024 * 1024)).toFixed(2)} MB -> ${(optimized.size / 1024).toFixed(0)} KB`);
      } else {
        setFileInfo(`Size: ${(f.size / 1024).toFixed(0)} KB`);
      }
    } catch {
      setFile(f);
    }
  };

  const onFileChange = (e) => {
    const f = e.target.files?.[0] || null;
    handleSelectedFile(f);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    setDragActive(true);
  };

  const onDragLeave = () => {
    setDragActive(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0] || null;
    if (f) handleSelectedFile(f);
  };

  const clearFile = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setFileInfo("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submit = async () => {
    setLocalError("");
    if (!file && !description.trim()) {
      return setLocalError("Please upload an inspection image or write a text description.");
    }
    let uploadFile = file;
    if (file && !file._downsampled) {
      try {
        uploadFile = await downsampleImage(file);
      } catch {
        uploadFile = file;
      }
    }
    run(endpoint, uploadFile, description);
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{title}</h2>
        <p>{hint}</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        onChange={onFileChange}
      />

      {!preview ? (
        <div
          className={`dropzone ${dragActive ? "drag-active" : ""}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="dropzone-icon">
            <IconUpload size={32} />
          </div>
          <p className="dropzone-text">Click to upload or drag & drop inspection photo</p>
          <p className="dropzone-sub">Supported: JPG, PNG, WEBP &bull; Max 8 MB &bull; Client-side auto-downsampled</p>
        </div>
      ) : (
        <div className="preview-card">
          <img src={preview} alt="Inspection preview" />
          <div className="preview-card-overlay">
            <span className="file-pill">{fileInfo || "Ready for analysis"}</span>
            <button
              type="button"
              className="secondary"
              style={{ padding: "4px 10px", fontSize: "0.75rem", margin: 0, background: "rgba(255,255,255,0.9)" }}
              onClick={clearFile}
            >
              Change Photo
            </button>
          </div>
        </div>
      )}

      <label>
        Context & Observations (Optional)
        <textarea
          rows={3}
          placeholder="e.g. Scaffolding on 4th floor, slab casting in progress, outdoor exterior wall..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <button type="button" onClick={submit} disabled={loading}>
        {loading ? (
          <>
            <span className="pulse-dot" style={{ backgroundColor: "#ffffff" }} />
            <span>Analyzing Site Data...</span>
          </>
        ) : (
          "Run AI Inspection"
        )}
      </button>

      <ErrorMsg error={localError || error} />

      {data && (
        <div className="result">
          <Banner r={data} />
          <Result r={data} />
          {data.summary && <p className="summary-card">{data.summary}</p>}
          <DownloadJson data={data} name={endpoint} />
        </div>
      )}
    </section>
  );
}

export const SafetyTab = () => (
  <ImageAnalyzer
    endpoint="safety"
    title="Site Safety & PPE Audit"
    hint="Upload a jobsite photo to assess PPE compliance, detect hazards, and review OSHA/IS guidelines."
    Result={SafetyResult}
  />
);

export const CrackTab = () => (
  <ImageAnalyzer
    endpoint="cracks"
    title="Structural Crack Diagnostics"
    hint="Upload a concrete or masonry photo to classify crack geometry, gauge severity, and get repair remedies."
    Result={CrackResult}
  />
);
