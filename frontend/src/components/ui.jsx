import React, { useState } from "react";

// Safe array: AI/back-end data is never trusted to be an array.
export const L = (a) => (Array.isArray(a) ? a : []);
export const fmt = (n) => Number(n || 0).toLocaleString("en-IN");
export const sevClass = (s) => `pill pill-${String(s).toLowerCase().replace(/\s+/g, "-")}`;

// Runs an async API call and tracks loading / error / data.
export function useRequest(fn) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const run = async (...args) => {
    setError("");
    setData(null);
    setLoading(true);
    try {
      setData(await fn(...args));
    } catch (e) {
      setError(e?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  return { data, error, loading, run };
}

// Inline SVGs for crisp, lightweight iconography without dependencies
export function IconShield({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

export function IconCrack({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v6l3 3-5 5 4 4" />
      <path d="M3 3h18v18H3z" />
    </svg>
  );
}

export function IconBlueprint({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </svg>
  );
}

export function IconRupee({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12" />
      <path d="M6 8h12" />
      <path d="M6 13l8.5 8" />
      <path d="M6 13h3a4 4 0 0 0 0-8" />
    </svg>
  );
}

export function IconCalendar({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export function IconWeather({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
    </svg>
  );
}

export function IconBot({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" y1="16" x2="8.01" y2="16" strokeWidth="3" />
      <line x1="16" y1="16" x2="16.01" y2="16" strokeWidth="3" />
    </svg>
  );
}

export function IconUpload({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

export function IconDownload({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export function IconCheckCircle({ size = 16, color = "#10b981" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

export function IconAlertTriangle({ size = 16, color = "#f59e0b" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="3" />
    </svg>
  );
}

export function CircularGauge({ score = 50, size = 120, label = "Safety Score" }) {
  const strokeWidth = 9;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const boundedScore = Math.max(0, Math.min(100, Number(score) || 0));
  const offset = circumference - (boundedScore / 100) * circumference;

  let strokeColor = "#10b981"; // Safe Green
  if (boundedScore < 50) strokeColor = "#ef4444"; // Unsafe Red
  else if (boundedScore < 75) strokeColor = "#f59e0b"; // Warning Amber

  return (
    <div className="gauge-container">
      <svg width={size} height={size} className="gauge-svg">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#e2e8f0"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
        />
        <text
          x="50%"
          y="46%"
          dominantBaseline="central"
          textAnchor="middle"
          className="gauge-val"
          fill="#0f172a"
        >
          {boundedScore}
        </text>
        <text
          x="50%"
          y="66%"
          dominantBaseline="central"
          textAnchor="middle"
          className="gauge-max"
          fill="#64748b"
        >
          / 100
        </text>
      </svg>
      <span className="gauge-label">{label}</span>
    </div>
  );
}

export function BudgetBar({ items = [], total = 1 }) {
  if (!items.length) return null;
  const colors = ["#d97706", "#2563eb", "#059669", "#7c3aed", "#64748b"];
  const safeTotal = total > 0 ? total : 1;

  return (
    <div className="budget-bar-wrap">
      <div className="budget-bar">
        {items.map((item, idx) => {
          const pct = Math.round((item.amount_inr / safeTotal) * 100);
          if (pct <= 0) return null;
          return (
            <div
              key={idx}
              className="budget-slice"
              style={{
                width: `${pct}%`,
                backgroundColor: colors[idx % colors.length],
              }}
              title={`${item.item}: ${pct}%`}
            />
          );
        })}
      </div>
      <div className="budget-legend">
        {items.map((item, idx) => {
          const pct = Math.round((item.amount_inr / safeTotal) * 100);
          return (
            <div key={idx} className="legend-item">
              <span
                className="legend-dot"
                style={{ backgroundColor: colors[idx % colors.length] }}
              />
              <span className="legend-name">{item.item}</span>
              <span className="legend-pct">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Banner({ r }) {
  if (r?.mode !== "demo") return null;
  return (
    <div className="banner">
      <IconAlertTriangle size={17} />
      <span>{r.warning || "Rule-based fallback output (Demo mode active)"}</span>
    </div>
  );
}

export function ErrorMsg({ error }) {
  return error ? (
    <div className="error" role="alert">
      <IconAlertTriangle size={18} color="#991b1b" />
      <span>{error}</span>
    </div>
  ) : null;
}

export function Bullets({ title, items }) {
  const list = L(items);
  if (list.length === 0) return null;
  return (
    <div className="bullets-block">
      <h4>{title}</h4>
      <ul className="bullet-list">
        {list.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

export function Metric({ label, children, icon: Icon }) {
  return (
    <div className="metric">
      <div className="metric-header">
        {Icon && <Icon size={16} />}
        <span>{label}</span>
      </div>
      <b>{children}</b>
    </div>
  );
}

export function DownloadJson({ data, name }) {
  const download = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}-intelligence-report.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <button type="button" className="secondary download-btn" onClick={download}>
      <IconDownload size={15} />
      <span>Export JSON Report</span>
    </button>
  );
}
