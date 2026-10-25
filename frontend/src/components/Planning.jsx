import React, { useState } from "react";
import { planProject } from "../api.js";
import { Banner, DownloadJson, ErrorMsg, L, Metric, fmt, useRequest } from "./ui.jsx";

export default function Planning() {
  const [form, setForm] = useState({ plot_size_sqft: 1000, construction_type: "Residential", city: "Pune", floors: 2 });
  const [localError, setLocalError] = useState("");
  const { data: plan, error, loading, run } = useRequest(planProject);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    setLocalError("");
    if (!(Number(form.plot_size_sqft) > 0)) return setLocalError("Enter a plot size greater than 0.");
    if (!form.city.trim()) return setLocalError("Enter the city / location.");
    run({ ...form, plot_size_sqft: Number(form.plot_size_sqft), floors: Number(form.floors) || 1, city: form.city.trim() });
  };

  const total = plan?.total_cost_inr || 0;
  const m = plan?.materials || {};

  return (
    <section className="panel">
      <h2>Project Planning</h2>
      <p className="muted">Material estimate, cost in INR, schedule and a concept visualization.</p>
      <div className="grid">
        <label>Plot size (sq ft)
          <input type="number" min="1" value={form.plot_size_sqft} onChange={(e) => set("plot_size_sqft", e.target.value)} />
        </label>
        <label>Construction type
          <select value={form.construction_type} onChange={(e) => set("construction_type", e.target.value)}>
            <option>Residential</option><option>Commercial</option><option>Industrial</option>
          </select>
        </label>
        <label>City / location
          <input value={form.city} maxLength={80} onChange={(e) => set("city", e.target.value)} />
        </label>
        <label>Floors
          <input type="number" min="1" max="50" value={form.floors} onChange={(e) => set("floors", e.target.value)} />
        </label>
      </div>
      <button onClick={submit} disabled={loading}>{loading ? "Planning..." : "Generate plan"}</button>
      <ErrorMsg error={localError || error} />

      {plan && (
        <div className="result">
          <Banner r={plan} />
          <div className="metrics">
            <Metric label="Total cost">{plan.total_cost_label}</Metric>
            <Metric label="Built-up area">{fmt(plan.built_up_sqft)} sq ft</Metric>
            <Metric label="Duration">{fmt(plan.total_weeks)} weeks</Metric>
          </div>

          <h4>Cost breakdown</h4>
          <table>
            <thead><tr><th>Item</th><th>Amount (INR)</th><th>Share</th></tr></thead>
            <tbody>
              {L(plan.cost_breakdown).map((c, i) => (
                <tr key={i}><td>{c.item}</td><td>{fmt(c.amount_inr)}</td><td>{total ? Math.round((c.amount_inr / total) * 100) : 0}%</td></tr>
              ))}
            </tbody>
          </table>

          <h4>Material estimate</h4>
          <ul className="plain">
            <li>Cement (50 kg bags): <b>{fmt(m.cement_bags)}</b></li>
            <li>Sand (cft): <b>{fmt(m.sand_cft)}</b></li>
            <li>Aggregate (cft): <b>{fmt(m.aggregate_cft)}</b></li>
            <li>Steel (kg): <b>{fmt(m.steel_kg)}</b></li>
            <li>Bricks (nos): <b>{fmt(m.bricks_nos)}</b></li>
          </ul>

          <h4>Schedule</h4>
          <table>
            <thead><tr><th>Phase</th><th>Weeks</th><th>Work</th></tr></thead>
            <tbody>{L(plan.schedule).map((p, i) => <tr key={i}><td>{p.name}</td><td>{fmt(p.weeks)}</td><td>{p.description}</td></tr>)}</tbody>
          </table>

          {plan.visualization_url && (
            <>
              <h4>Architectural visualization (concept)</h4>
              <img className="preview" src={plan.visualization_url} alt="AI generated architectural concept" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            </>
          )}
          {plan.summary && <p className="summary">{plan.summary}</p>}
          {L(plan.assumptions).length > 0 && <details><summary>Assumptions</summary><ul>{L(plan.assumptions).map((a, i) => <li key={i}>{a}</li>)}</ul></details>}
          <DownloadJson data={plan} name="planning" />
        </div>
      )}
    </section>
  );
}
