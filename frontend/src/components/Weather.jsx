import React, { useState } from "react";
import { weatherAdvisory } from "../api.js";
import { Banner, Bullets, DownloadJson, ErrorMsg, sevClass, useRequest } from "./ui.jsx";

const CONDITIONS = ["Normal", "High Wind", "Heavy Rain", "Extreme Heat", "Thunderstorm", "Dense Fog"];

export default function Weather() {
  const [activity, setActivity] = useState("Slab concrete pour");
  const [condition, setCondition] = useState("Heavy Rain");
  const [localError, setLocalError] = useState("");
  const { data: a, error, loading, run } = useRequest(weatherAdvisory);

  const submit = () => {
    setLocalError("");
    if (!activity.trim()) return setLocalError("Enter the planned activity.");
    run({ activity: activity.trim(), condition });
  };

  return (
    <section className="panel">
      <h2>Weather-Aware Advisory</h2>
      <p className="muted">Get a GO / NO-GO decision for a weather-sensitive activity.</p>
      <div className="grid">
        <label>Planned activity
          <input value={activity} maxLength={300} onChange={(e) => setActivity(e.target.value)} />
        </label>
        <label>Weather condition
          <select value={condition} onChange={(e) => setCondition(e.target.value)}>
            {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <button onClick={submit} disabled={loading}>{loading ? "Checking..." : "Get advisory"}</button>
      <ErrorMsg error={localError || error} />

      {a && (
        <div className="result">
          <Banner r={a} />
          <div className="decision-row">
            <span className={a.decision === "GO" ? "decision go" : "decision nogo"}>{a.decision}</span>
            <span>Risk level: <span className={sevClass(a.risk_level)}>{a.risk_level}</span></span>
          </div>
          {a.rationale && <p>{a.rationale}</p>}
          <Bullets title="Identified risks" items={a.risks} />
          <Bullets title="Safety precautions and mitigation" items={a.precautions} />
          <DownloadJson data={a} name="weather-advisory" />
        </div>
      )}
    </section>
  );
}
