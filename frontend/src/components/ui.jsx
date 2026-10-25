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

export function Banner({ r }) {
  if (r?.mode !== "demo") return null;
  return <div className="banner">{r.warning || "Demo / rule-based output"}</div>;
}

export function ErrorMsg({ error }) {
  return error ? <div className="error" role="alert">{error}</div> : null;
}

export function Bullets({ title, items }) {
  const list = L(items);
  if (list.length === 0) return null;
  return (
    <>
      <h4>{title}</h4>
      <ul>{list.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </>
  );
}

export function Metric({ label, children }) {
  return <div className="metric"><span>{label}</span><b>{children}</b></div>;
}

export function DownloadJson({ data, name }) {
  const download = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}-report.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return <button className="secondary" onClick={download}>Download JSON report</button>;
}
