import React, { useEffect, useState } from "react";
import { getHealth } from "./api.js";
import { SafetyTab, CrackTab } from "./components/ImageAnalyzer.jsx";
import Planning from "./components/Planning.jsx";
import Valuation from "./components/Valuation.jsx";
import DailyPlan from "./components/DailyPlan.jsx";
import Weather from "./components/Weather.jsx";
import Chatbot from "./components/Assistant.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

const TABS = [
  ["safety", "Safety & PPE", SafetyTab],
  ["cracks", "Crack Analysis", CrackTab],
  ["planning", "Planning", Planning],
  ["valuation", "Valuation", Valuation],
  ["daily", "Daily Site Plan", DailyPlan],
  ["weather", "Weather Advisory", Weather],
  ["chat", "Chatbot", Chatbot],
];

export default function App() {
  const [tab, setTab] = useState("safety");
  const [health, setHealth] = useState(null);
  const [offline, setOffline] = useState(false);
  const [checking, setChecking] = useState(false);

  const checkHealth = () => {
    setChecking(true);
    getHealth()
      .then((data) => {
        setHealth(data);
        setOffline(false);
      })
      .catch(() => {
        setOffline(true);
      })
      .finally(() => {
        setChecking(false);
      });
  };

  useEffect(() => {
    checkHealth();
  }, []);

  // When offline, automatically poll every 8 seconds until the backend wakes up
  useEffect(() => {
    if (!offline) return;
    const interval = setInterval(checkHealth, 8000);
    return () => clearInterval(interval);
  }, [offline]);

  const Active = TABS.find((t) => t[0] === tab)[2];

  return (
    <div className="app">
      <header>
        <h1>Multimodal Construction Intelligence Platform</h1>
        <span className={`status ${offline ? "off" : health?.ai_mode === "live" ? "live" : "demo"}`}>
          {offline ? "Backend offline" : health ? `AI: ${health.ai_mode}` : "Connecting..."}
        </span>
      </header>
      {offline && (
        <div className="error" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
          <span>Cannot reach the backend (Render free tier may take ~50 s to wake up). Auto-retrying...</span>
          <button
            type="button"
            className="secondary"
            style={{ padding: "4px 12px", fontSize: "0.85rem", margin: 0 }}
            onClick={checkHealth}
            disabled={checking}
          >
            {checking ? "Checking..." : "Retry now"}
          </button>
        </div>
      )}
      <nav>
        {TABS.map(([id, label]) => (
          <button key={id} className={tab === id ? "tab active" : "tab"} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>
      <main><ErrorBoundary resetKey={tab}><Active /></ErrorBoundary></main>
      <footer>AI output is advisory. Confirm structural and safety decisions with a qualified engineer.</footer>
    </div>
  );
}
