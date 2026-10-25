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

function ImageAnalyzer({ endpoint, title, hint, Result }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [description, setDescription] = useState("");
  const [fileInfo, setFileInfo] = useState("");
  const [localError, setLocalError] = useState("");
  const { data, error, loading, run } = useRequest(analyzeImage);

  const onFile = async (e) => {
    const f = e.target.files?.[0] || null;
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
        setFileInfo(`Image optimized: ${(f.size / (1024 * 1024)).toFixed(2)} MB -> ${(optimized.size / 1024).toFixed(0)} KB`);
      } else {
        setFileInfo(`Size: ${(f.size / 1024).toFixed(0)} KB`);
      }
    } catch {
      setFile(f);
    }
  };

  const submit = async () => {
    setLocalError("");
    if (!file && !description.trim()) return setLocalError("Upload an image or write a description first.");
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
      <h2>{title}</h2>
      <p className="muted">{hint}</p>
      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} />
      {preview && <img className="preview" src={preview} alt="Selected upload preview" />}
      {fileInfo && <p className="muted" style={{ fontSize: "0.8rem", marginTop: "-4px" }}>{fileInfo}</p>}
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
