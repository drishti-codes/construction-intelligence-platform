import React, { useState } from "react";
import { planProject } from "../api.js";
import {
  Banner,
  BudgetBar,
  DownloadJson,
  ErrorMsg,
  IconBlueprint,
  IconCalendar,
  IconRupee,
  L,
  Metric,
  fmt,
  useRequest,
} from "./ui.jsx";

export default function Planning() {
  const [form, setForm] = useState({
    plot_size_sqft: 1000,
    construction_type: "Residential",
    city: "Pune",
    floors: 2,
  });
  const [localError, setLocalError] = useState("");
  const { data: plan, error, loading, run } = useRequest(planProject);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    setLocalError("");
    if (!(Number(form.plot_size_sqft) > 0)) {
      return setLocalError("Enter a plot size greater than 0.");
    }
    if (!form.city.trim()) {
      return setLocalError("Enter the project city / location.");
    }
    run({
      ...form,
      plot_size_sqft: Number(form.plot_size_sqft),
      floors: Number(form.floors) || 1,
      city: form.city.trim(),
    });
  };

  const total = plan?.total_cost_inr || 0;
  const m = plan?.materials || {};

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Project Planning & BOQ Estimator</h2>
        <p>Estimate thumb-rule construction budgets, raw material quantities, schedules, and AI renders.</p>
      </div>

      <div className="grid">
        <label>
          Plot Size (sq ft)
          <input
            type="number"
            min="100"
            max="1000000"
            value={form.plot_size_sqft}
            onChange={(e) => set("plot_size_sqft", e.target.value)}
          />
        </label>
        <label>
          Construction Type
          <select
            value={form.construction_type}
            onChange={(e) => set("construction_type", e.target.value)}
          >
            <option>Residential</option>
            <option>Commercial</option>
            <option>Industrial</option>
          </select>
        </label>
        <label>
          City / Location (India)
          <input
            value={form.city}
            maxLength={80}
            placeholder="e.g. Pune, Mumbai, Bengaluru"
            onChange={(e) => set("city", e.target.value)}
          />
        </label>
        <label>
          Total Floors (G+N)
          <input
            type="number"
            min="1"
            max="50"
            value={form.floors}
            onChange={(e) => set("floors", e.target.value)}
          />
        </label>
      </div>

      <button type="button" onClick={submit} disabled={loading}>
        {loading ? (
          <>
            <span className="pulse-dot" style={{ backgroundColor: "#ffffff" }} />
            <span>Calculating Estimates & Schedule...</span>
          </>
        ) : (
          "Generate Project Plan"
        )}
      </button>

      <ErrorMsg error={localError || error} />

      {plan && (
        <div className="result">
          <Banner r={plan} />

          <div className="metrics">
            <Metric label="Est. Total Cost" icon={IconRupee}>
              {plan.total_cost_label}
            </Metric>
            <Metric label="Built-Up Area" icon={IconBlueprint}>
              {fmt(plan.built_up_sqft)} sq ft
            </Metric>
            <Metric label="Project Duration" icon={IconCalendar}>
              {fmt(plan.total_weeks)} weeks
            </Metric>
          </div>

          <div style={{ marginTop: "12px" }}>
            <h4 style={{ margin: "0 0 6px", fontSize: "0.95rem" }}>Budget Breakdown Distribution</h4>
            <BudgetBar items={L(plan.cost_breakdown)} total={total} />
            <table>
              <thead>
                <tr>
                  <th>Cost Item</th>
                  <th>Amount (INR)</th>
                  <th>Share of Total</th>
                </tr>
              </thead>
              <tbody>
                {L(plan.cost_breakdown).map((c, i) => (
                  <tr key={i}>
                    <td><strong>{c.item}</strong></td>
                    <td>Rs {fmt(c.amount_inr)}</td>
                    <td>{total ? Math.round((c.amount_inr / total) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: "14px" }}>
            <h4 style={{ margin: "0 0 10px", fontSize: "0.95rem" }}>Core Material Take-off (Thumb-rule BOQ)</h4>
            <div className="metrics">
              <Metric label="Cement (50 kg)">{fmt(m.cement_bags)} bags</Metric>
              <Metric label="Sand">{fmt(m.sand_cft)} cft</Metric>
              <Metric label="Aggregate">{fmt(m.aggregate_cft)} cft</Metric>
              <Metric label="TMT Steel">{fmt(m.steel_kg)} kg</Metric>
              <Metric label="Bricks / Blocks">{fmt(m.bricks_nos)} nos</Metric>
            </div>
          </div>

          <div style={{ marginTop: "14px" }}>
            <h4 style={{ margin: "0 0 10px", fontSize: "0.95rem" }}>Execution Phase Schedule</h4>
            <table>
              <thead>
                <tr>
                  <th style={{ width: "25%" }}>Phase</th>
                  <th style={{ width: "15%" }}>Weeks</th>
                  <th>Scope of Work</th>
                </tr>
              </thead>
              <tbody>
                {L(plan.schedule).map((p, i) => (
                  <tr key={i}>
                    <td><strong>{p.name}</strong></td>
                    <td>
                      <span className="pill pill-low">{fmt(p.weeks)} wks</span>
                    </td>
                    <td>{p.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {plan.visualization_url && (
            <div style={{ marginTop: "14px" }}>
              <h4 style={{ margin: "0 0 8px", fontSize: "0.95rem" }}>Architectural Concept Visualization</h4>
              <div className="preview-card">
                <img
                  src={plan.visualization_url}
                  alt="AI generated architectural concept"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                    const fallback = e.currentTarget.nextElementSibling;
                    if (fallback) fallback.style.display = "block";
                  }}
                />
                <p className="muted" style={{ display: "none", padding: "16px", fontSize: "0.85rem", fontStyle: "italic", textAlign: "center" }}>
                  Architectural concept render service is taking longer than usual or offline.
                </p>
              </div>
            </div>
          )}

          {plan.summary && <p className="summary-card">{plan.summary}</p>}

          {L(plan.assumptions).length > 0 && (
            <details style={{ marginTop: "10px", color: "var(--muted)", fontSize: "0.88rem" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>Review Engineering Assumptions & Tier Factors</summary>
              <ul style={{ margin: "8px 0", paddingLeft: "20px" }}>
                {L(plan.assumptions).map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </details>
          )}

          <DownloadJson data={plan} name="planning" />
        </div>
      )}
    </section>
  );
}
