import React, { useState } from "react";
import { weatherAdvisory } from "../api.js";
import {
  Banner,
  Bullets,
  DownloadJson,
  ErrorMsg,
  IconAlertTriangle,
  IconCheckCircle,
  sevClass,
  useRequest,
} from "./ui.jsx";

const CONDITIONS = [
  "Normal",
  "High Wind",
  "Heavy Rain",
  "Extreme Heat",
  "Thunderstorm",
  "Dense Fog",
];

export default function Weather() {
  const [activity, setActivity] = useState("Slab concrete pour on 4th floor");
  const [condition, setCondition] = useState("Heavy Rain");
  const [localError, setLocalError] = useState("");
  const { data: a, error, loading, run } = useRequest(weatherAdvisory);

  const submit = () => {
    setLocalError("");
    if (!activity.trim()) {
      return setLocalError("Enter the planned construction activity.");
    }
    run({ activity: activity.trim(), condition });
  };

  const isGo = a?.decision === "GO";

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Weather Safety Advisory (GO / NO-GO)</h2>
        <p>Real-time engineering risk assessment to determine if weather conditions permit safe execution.</p>
      </div>

      <div className="grid">
        <label>
          Planned Field Activity
          <input
            value={activity}
            maxLength={300}
            placeholder="e.g. Crane lifting, roof sheeting, external plastering..."
            onChange={(e) => setActivity(e.target.value)}
          />
        </label>
        <label>
          Observed / Forecasted Weather Condition
          <select value={condition} onChange={(e) => setCondition(e.target.value)}>
            {CONDITIONS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>

      <button type="button" onClick={submit} disabled={loading}>
        {loading ? (
          <>
            <span className="pulse-dot" style={{ backgroundColor: "#ffffff" }} />
            <span>Evaluating Weather Hazards...</span>
          </>
        ) : (
          "Run Safety Advisory Check"
        )}
      </button>

      <ErrorMsg error={localError || error} />

      {a && (
        <div className="result">
          <Banner r={a} />

          <div className="weather-decision-card">
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div className={`weather-badge ${isGo ? "go" : "nogo"}`}>
                {a.decision}
              </div>
              <div>
                <span style={{ fontSize: "0.8rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.03em" }}>
                  Operational Directive
                </span>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: isGo ? "#15803d" : "#b91c1c", marginTop: "2px" }}>
                  {isGo ? "Proceed with Stated Precautions" : "Halt Work Immediately - Unsafe Conditions"}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "0.88rem", color: "var(--muted)", fontWeight: 600 }}>
                Risk Severity:
              </span>
              <span className={sevClass(a.risk_level)} style={{ fontSize: "0.85rem", padding: "4px 12px" }}>
                {a.risk_level} Risk
              </span>
            </div>
          </div>

          {a.rationale && (
            <div className="summary-card" style={{ borderLeftColor: isGo ? "#10b981" : "#ef4444", marginTop: "8px" }}>
              <strong>Engineering Rationale:</strong> {a.rationale}
            </div>
          )}

          <Bullets title="Environmental & Activity Risks" items={a.risks} />
          <Bullets title="Required Mitigation & Precautionary Measures" items={a.precautions} />

          <DownloadJson data={a} name="weather-advisory" />
        </div>
      )}
    </section>
  );
}
