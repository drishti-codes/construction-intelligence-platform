import React, { useState } from "react";
import { planProject } from "../api.js";

const fmt = (n) => Number(n).toLocaleString("en-IN");

export default function Planning() {
  const [form, setForm] = useState({ structure_type: "Residential", built_up_sqft: 1500, location_tier: 2, completion_pct: 30, floors: 2 });
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      setPlan(await planProject({ ...form, built_up_sqft: Number(form.built_up_sqft), location_tier: Number(form.location_tier), completion_pct: Number(form.completion_pct), floors: Number(form.floors) }));
    } catch (e) {
      setError(e.message);
      setPlan(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel">
      <h2>Planning & Real Estate Valuation</h2>
      <div className="grid">
        <label>Structure type
          <select value={form.structure_type} onChange={(e) => set("structure_type", e.target.value)}>
            <option>Residential</option><option>Commercial</option><option>Industrial</option>
          </select>
        </label>
        <label>Built-up area (sqft)
          <input type="number" min="1" value={form.built_up_sqft} onChange={(e) => set("built_up_sqft", e.target.value)} />
        </label>
        <label>Location tier
          <select value={form.location_tier} onChange={(e) => set("location_tier", e.target.value)}>
            <option value={1}>Tier 1 (metro)</option><option value={2}>Tier 2</option><option value={3}>Tier 3</option>
          </select>
        </label>
        <label>Floors
          <input type="number" min="1" max="50" value={form.floors} onChange={(e) => set("floors", e.target.value)} />
        </label>
        <label>Completion: {form.completion_pct}%
          <input type="range" min="0" max="100" value={form.completion_pct} onChange={(e) => set("completion_pct", e.target.value)} />
        </label>
      </div>
      <button onClick={submit} disabled={loading}>{loading ? "Calculating..." : "Calculate"}</button>
      {error && <div className="error" role="alert">{error}</div>}

      {plan && (
        <div className="result">
          <div className="metrics">
            <div className="metric"><span>Total budget</span><b>{plan.total_budget_label}</b></div>
            <div className="metric"><span>Spent</span><b>{plan.spent_label}</b></div>
            <div className="metric"><span>Market valuation</span><b>{plan.market_valuation_label}</b></div>
          </div>
          <div className="bar"><div style={{ width: `${form.completion_pct}%` }} /></div>

          <h4>Material estimate</h4>
          <ul className="plain">
            {Object.entries(plan.materials).map(([k, v]) => <li key={k}>{k.replace(/_/g, " ")}: <b>{fmt(v)}</b></li>)}
          </ul>

          <h4>Schedule</h4>
          <table>
            <thead><tr><th>Phase</th><th>Weeks</th><th>Status</th></tr></thead>
            <tbody>{plan.schedule.map((p) => <tr key={p.name}><td>{p.name}</td><td>{p.weeks}</td><td>{p.status}</td></tr>)}</tbody>
          </table>

          <h4>Architectural visualization</h4>
          <img className="preview" src={plan.visualization_url} alt="AI generated architectural concept" onError={(e) => { e.currentTarget.style.display = "none"; }} />

          <details><summary>Assumptions</summary><ul>{plan.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></details>
        </div>
      )}
    </section>
  );
}
