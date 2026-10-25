import React, { useState } from "react";
import { dailyPlan } from "../api.js";
import {
  Banner,
  Bullets,
  DownloadJson,
  ErrorMsg,
  IconAlertTriangle,
  L,
  sevClass,
  useRequest,
} from "./ui.jsx";

export default function DailyPlan() {
  const [form, setForm] = useState({
    activities: "Slab concreting on 2nd floor, brick masonry in block B, excavation for perimeter storm drain",
    workforce: 20,
    site_conditions: "Hot summer day (36°C), light wind, dry soil",
  });
  const [localError, setLocalError] = useState("");
  const { data: d, error, loading, run } = useRequest(dailyPlan);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    setLocalError("");
    if (!form.activities.trim()) {
      return setLocalError("Describe today's planned activities.");
    }
    const w = Number(form.workforce);
    if (!(Number.isInteger(w) && w >= 1)) {
      return setLocalError("Workforce must be a whole number of 1 or more.");
    }
    run({
      activities: form.activities.trim(),
      workforce: w,
      site_conditions: form.site_conditions.trim(),
    });
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Daily Site Assistant & Crew Dispatch</h2>
        <p>Translate daily construction logs into structured work breakdowns, crew allocations, and safety hazard alerts.</p>
      </div>

      <label>
        Today's Planned Activities (separate with commas or line breaks)
        <textarea
          rows={3}
          maxLength={1500}
          value={form.activities}
          onChange={(e) => set("activities", e.target.value)}
        />
      </label>

      <div className="grid">
        <label>
          Available Field Workforce (Labor Count)
          <input
            type="number"
            min="1"
            max="5000"
            value={form.workforce}
            onChange={(e) => set("workforce", e.target.value)}
          />
        </label>
        <label>
          Site Ambient Conditions
          <input
            value={form.site_conditions}
            maxLength={500}
            placeholder="e.g. Rainy morning, wet soil, high heat..."
            onChange={(e) => set("site_conditions", e.target.value)}
          />
        </label>
      </div>

      <button type="button" onClick={submit} disabled={loading}>
        {loading ? (
          <>
            <span className="pulse-dot" style={{ backgroundColor: "#ffffff" }} />
            <span>Generating Daily Schedule...</span>
          </>
        ) : (
          "Generate Daily Site Plan"
        )}
      </button>

      <ErrorMsg error={localError || error} />

      {d && (
        <div className="result">
          <Banner r={d} />

          <div style={{ marginTop: "6px" }}>
            <h4 style={{ margin: "0 0 10px", fontSize: "0.95rem" }}>Daily Task & Crew Allocation</h4>
            <table>
              <thead>
                <tr>
                  <th>Task Description</th>
                  <th style={{ width: "25%" }}>Assigned Crew</th>
                  <th style={{ width: "18%" }}>Priority</th>
                </tr>
              </thead>
              <tbody>
                {L(d.tasks).map((t, i) => (
                  <tr key={i}>
                    <td><strong>{t.task}</strong></td>
                    <td>
                      <span className="pill pill-low">{t.crew}</span>
                    </td>
                    <td>
                      <span className={sevClass(t.priority)}>{t.priority}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Bullets title="Required Materials, Consumables & Equipment" items={d.materials_equipment} />
          <Bullets title="Mandatory Safety Precautions & Toolbox Checks" items={d.safety_precautions} />

          {L(d.risk_alerts).length > 0 && (
            <div style={{ marginTop: "14px" }}>
              <h4 style={{ margin: "0 0 10px", fontSize: "0.95rem" }}>Site Hazards & Risk Alerts</h4>
              {L(d.risk_alerts).map((r, i) => (
                <div
                  key={i}
                  className="hazard-card"
                  style={{
                    borderLeftColor: r.severity === "High" || r.severity === "Critical" ? "#ef4444" : "#f59e0b",
                  }}
                >
                  <div className="hazard-header">
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontWeight: 700 }}>
                      <IconAlertTriangle size={16} color={r.severity === "High" || r.severity === "Critical" ? "#ef4444" : "#f59e0b"} />
                      <span>{r.risk}</span>
                    </span>
                    <span className={sevClass(r.severity)}>{r.severity} Severity</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {d.summary && <p className="summary-card">{d.summary}</p>}
          <DownloadJson data={d} name="daily-plan" />
        </div>
      )}
    </section>
  );
}
