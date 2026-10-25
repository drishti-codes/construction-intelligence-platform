import React, { useState } from "react";
import { valueProperty } from "../api.js";
import { Banner, Bullets, DownloadJson, ErrorMsg, L, Metric, fmt, useRequest } from "./ui.jsx";

const AMENITIES = ["Lift", "Parking", "24x7 Security", "Power backup", "Gym", "Swimming pool", "Garden", "Clubhouse"];

export default function Valuation() {
  const [form, setForm] = useState({ location: "Whitefield, Bengaluru", area_sqft: 1200, property_type: "Apartment", building_age_years: 5, amenities: ["Lift", "Parking"] });
  const [localError, setLocalError] = useState("");
  const { data: v, error, loading, run } = useRequest(valueProperty);
  const set = (k, val) => setForm((f) => ({ ...f, [k]: val }));
  const toggle = (a) => set("amenities", form.amenities.includes(a) ? form.amenities.filter((x) => x !== a) : [...form.amenities, a]);

  const submit = () => {
    setLocalError("");
    if (!form.location.trim()) return setLocalError("Enter the property location.");
    if (!(Number(form.area_sqft) > 0)) return setLocalError("Enter an area greater than 0.");
    const age = Number(form.building_age_years);
    if (!(age >= 0 && age <= 100)) return setLocalError("Building age must be between 0 and 100 years.");
    run({ ...form, location: form.location.trim(), area_sqft: Number(form.area_sqft), building_age_years: age });
  };

  return (
    <section className="panel">
      <h2>Real Estate Valuation</h2>
      <p className="muted">Indicative market value, rental income and ROI in INR. Not a registered valuer's report.</p>
      <div className="grid">
        <label>Location
          <input value={form.location} maxLength={100} onChange={(e) => set("location", e.target.value)} />
        </label>
        <label>Area (sq ft)
          <input type="number" min="1" value={form.area_sqft} onChange={(e) => set("area_sqft", e.target.value)} />
        </label>
        <label>Property type
          <select value={form.property_type} onChange={(e) => set("property_type", e.target.value)}>
            <option>Apartment</option><option>House</option><option>Villa</option><option>Commercial</option>
          </select>
        </label>
        <label>Building age (years)
          <input type="number" min="0" max="100" value={form.building_age_years} onChange={(e) => set("building_age_years", e.target.value)} />
        </label>
      </div>
      <div>
        <span className="muted">Amenities</span>
        <div className="checks">
          {AMENITIES.map((a) => (
            <label key={a} className="check"><input type="checkbox" checked={form.amenities.includes(a)} onChange={() => toggle(a)} />{a}</label>
          ))}
        </div>
      </div>
      <button onClick={submit} disabled={loading}>{loading ? "Valuing..." : "Estimate value"}</button>
      <ErrorMsg error={localError || error} />

      {v && (
        <div className="result">
          <Banner r={v} />
          <div className="metrics">
            <Metric label="Estimated value">{v.estimated_value_label}</Metric>
            <Metric label="Value range">{v.value_range_label}</Metric>
            <Metric label="Price per sq ft">Rs {fmt(v.price_per_sqft_inr)}</Metric>
            <Metric label="Monthly rent">Rs {fmt(v.monthly_rent_inr)}</Metric>
            <Metric label="Rental yield">{v.rental_yield_pct}% / yr</Metric>
            <Metric label="Appreciation">{v.annual_appreciation_pct}% / yr</Metric>
            <Metric label="5-year ROI">{v.five_year_roi_pct}%</Metric>
          </div>
          <Bullets title="Key factors" items={v.key_factors} />
          {v.outlook && <><h4>Outlook</h4><p>{v.outlook}</p></>}
          {L(v.assumptions).length > 0 && <details><summary>Assumptions</summary><ul>{L(v.assumptions).map((a, i) => <li key={i}>{a}</li>)}</ul></details>}
          <DownloadJson data={v} name="valuation" />
        </div>
      )}
    </section>
  );
}
