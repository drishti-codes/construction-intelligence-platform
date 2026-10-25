import React, { useState } from "react";
import { valueProperty } from "../api.js";
import {
  Banner,
  Bullets,
  DownloadJson,
  ErrorMsg,
  IconCheckCircle,
  IconRupee,
  L,
  Metric,
  fmt,
  useRequest,
} from "./ui.jsx";

const AMENITIES = [
  "Lift",
  "Parking",
  "24x7 Security",
  "Power backup",
  "Gym",
  "Swimming pool",
  "Garden",
  "Clubhouse",
];

export default function Valuation() {
  const [form, setForm] = useState({
    location: "Whitefield, Bengaluru",
    area_sqft: 1200,
    property_type: "Apartment",
    building_age_years: 5,
    amenities: ["Lift", "Parking"],
  });
  const [localError, setLocalError] = useState("");
  const { data: v, error, loading, run } = useRequest(valueProperty);
  const set = (k, val) => setForm((f) => ({ ...f, [k]: val }));
  const toggle = (a) =>
    set(
      "amenities",
      form.amenities.includes(a)
        ? form.amenities.filter((x) => x !== a)
        : [...form.amenities, a]
    );

  const submit = () => {
    setLocalError("");
    if (!form.location.trim()) {
      return setLocalError("Enter the property location.");
    }
    if (!(Number(form.area_sqft) > 0)) {
      return setLocalError("Enter a property area greater than 0.");
    }
    const age = Number(form.building_age_years);
    if (!(age >= 0 && age <= 100)) {
      return setLocalError("Building age must be between 0 and 100 years.");
    }
    run({
      ...form,
      location: form.location.trim(),
      area_sqft: Number(form.area_sqft),
      building_age_years: age,
    });
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Real Estate Valuation & ROI Calculator</h2>
        <p>Indicative micro-market valuation, rental yields, capital appreciation, and 5-year ROI.</p>
      </div>

      <div className="grid">
        <label>
          Location / Micro-market
          <input
            value={form.location}
            maxLength={100}
            placeholder="e.g. Whitefield, Bengaluru"
            onChange={(e) => set("location", e.target.value)}
          />
        </label>
        <label>
          Super Built-up Area (sq ft)
          <input
            type="number"
            min="50"
            max="1000000"
            value={form.area_sqft}
            onChange={(e) => set("area_sqft", e.target.value)}
          />
        </label>
        <label>
          Property Type
          <select
            value={form.property_type}
            onChange={(e) => set("property_type", e.target.value)}
          >
            <option>Apartment</option>
            <option>House</option>
            <option>Villa</option>
            <option>Commercial</option>
          </select>
        </label>
        <label>
          Building Age (Years)
          <input
            type="number"
            min="0"
            max="100"
            value={form.building_age_years}
            onChange={(e) => set("building_age_years", e.target.value)}
          />
        </label>
      </div>

      <div>
        <span style={{ fontSize: "0.88rem", fontWeight: 600, color: "#334155", display: "block", marginBottom: "8px" }}>
          Included Amenities & Facilities
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {AMENITIES.map((a) => {
            const active = form.amenities.includes(a);
            return (
              <button
                key={a}
                type="button"
                className={`chip ${active ? "active" : ""}`}
                style={{
                  background: active ? "var(--brand)" : "#ffffff",
                  color: active ? "#ffffff" : "#334155",
                  borderColor: active ? "var(--brand)" : "var(--line)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 14px",
                }}
                onClick={() => toggle(a)}
              >
                {active && <IconCheckCircle size={13} color="#ffffff" />}
                <span>{a}</span>
              </button>
            );
          })}
        </div>
      </div>

      <button type="button" onClick={submit} disabled={loading}>
        {loading ? (
          <>
            <span className="pulse-dot" style={{ backgroundColor: "#ffffff" }} />
            <span>Appraising Market Value...</span>
          </>
        ) : (
          "Estimate Property Value"
        )}
      </button>

      <ErrorMsg error={localError || error} />

      {v && (
        <div className="result">
          <Banner r={v} />

          <div
            style={{
              background: "linear-gradient(135deg, #1e293b, #0f172a)",
              color: "#ffffff",
              padding: "22px 26px",
              borderRadius: "var(--radius)",
              boxShadow: "var(--shadow)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            <div>
              <span style={{ fontSize: "0.8rem", color: "#94a3b8", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.04em" }}>
                Estimated Market Valuation
              </span>
              <div style={{ fontSize: "2rem", fontWeight: 800, color: "#fef3c7", marginTop: "2px" }}>
                {v.estimated_value_label}
              </div>
              <div style={{ fontSize: "0.85rem", color: "#cbd5e1", marginTop: "4px" }}>
                Fair Value Range: <strong>{v.value_range_label}</strong>
              </div>
            </div>
            <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span className="pill pill-low" style={{ alignSelf: "flex-end", fontSize: "0.85rem", padding: "4px 12px" }}>
                5-Yr ROI: +{v.five_year_roi_pct}%
              </span>
              <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
                Rental Yield: <strong>{v.rental_yield_pct}% / yr</strong>
              </span>
            </div>
          </div>

          <div className="metrics" style={{ marginTop: "10px" }}>
            <Metric label="Price per sq ft" icon={IconRupee}>
              Rs {fmt(v.price_per_sqft_inr)}
            </Metric>
            <Metric label="Est. Monthly Rent" icon={IconRupee}>
              Rs {fmt(v.monthly_rent_inr)}
            </Metric>
            <Metric label="Annual Appreciation">
              +{v.annual_appreciation_pct}%
            </Metric>
            <Metric label="Gross Rental Yield">
              {v.rental_yield_pct}% / yr
            </Metric>
          </div>

          <Bullets title="Key Micro-Market Valuation Drivers" items={v.key_factors} />

          {v.outlook && (
            <div style={{ marginTop: "12px" }}>
              <h4 style={{ margin: "0 0 6px", fontSize: "0.95rem" }}>Investment Outlook</h4>
              <p style={{ margin: 0, fontSize: "0.9rem", color: "#334155" }}>{v.outlook}</p>
            </div>
          )}

          {L(v.assumptions).length > 0 && (
            <details style={{ marginTop: "10px", color: "var(--muted)", fontSize: "0.88rem" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>Review Valuation Assumptions & Rate Rules</summary>
              <ul style={{ margin: "8px 0", paddingLeft: "20px" }}>
                {L(v.assumptions).map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </details>
          )}

          <DownloadJson data={v} name="valuation" />
        </div>
      )}
    </section>
  );
}
