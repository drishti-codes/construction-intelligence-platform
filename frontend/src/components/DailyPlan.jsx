import React, { useState } from "react";
import { dailyPlan } from "../api.js";
import { Banner, Bullets, DownloadJson, ErrorMsg, L, sevClass, useRequest } from "./ui.jsx";

export default function DailyPlan() {
  const [form, setForm] = useState({ activities: "Slab concreting on 2nd floor, brick masonry in block B", workforce: 20, site_conditions: "Hot day, light wind" });
  const [localError, setLocalError] = useState("");
  const { data: d, error, loading, run } = useRequest(dailyPlan);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    setLocalError("");
    if (!form.activities.trim()) return setLocalError("Describe today's planned activities.");
    const w = Number(form.workforce);
    if (!(Number.isInteger(w) && w >= 1)) return setLocalError("Workforce must be a whole number of 1 or more.");
    run({ activities: form.activities.trim(), workforce: w, site_conditions: form.site_conditions.trim() });
  };

  return (
    <section className="panel">
      <h2>Daily Site Assistant</h2>
      <p className="muted">Turn today's inputs into a task list, material list, safety checks and risk alerts.</p>
      <label>Today's activities (separate with commas or new lines)
        <textarea rows={3} maxLength={1500} value={form.activities} onChange={(e) => set("activities", e.target.value)} />
      </label>
      <div className="grid">
        <label>Workforce available
          <input type="number" min="1" value={form.workforce} onChange={(e) => set("workforce", e.target.value)} />
        </label>
        <label>Site conditions
          <input value={form.site_conditions} maxLength={500} onChange={(e) => set("site_conditions", e.target.value)} />
        </label>
      </div>
      <button onClick={submit} disabled={loading}>{loading ? "Planning..." : "Generate daily plan"}</button>
      <ErrorMsg error={localError || error} />

      {d && (
        <div className="result">
          <Banner r={d} />
          <h4>Daily task breakdown</h4>
          <table>
            <thead><tr><th>Task</th><th>Crew</th><th>Priority</th></tr></thead>
            <tbody>{L(d.tasks).map((t, i) => <tr key={i}><td>{t.task}</td><td>{t.crew}</td><td><span className={sevClass(t.priority)}>{t.priority}</span></td></tr>)}</tbody>
          </table>
          <Bullets title="Materials and equipment" items={d.materials_equipment} />
          <Bullets title="Safety precautions and checks" items={d.safety_precautions} />
          {L(d.risk_alerts).length > 0 && <h4>Risk alerts</h4>}
          {L(d.risk_alerts).map((r, i) => (
            <div className="card-sm" key={i}><b>{r.risk}</b> <span className={sevClass(r.severity)}>{r.severity}</span></div>
          ))}
          {d.summary && <p className="summary">{d.summary}</p>}
          <DownloadJson data={d} name="daily-plan" />
        </div>
      )}
    </section>
  );
}
