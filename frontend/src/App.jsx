import React, { useEffect, useState } from "react";
import { getHealth } from "./api.js";
import { SafetyTab, CrackTab } from "./components/ImageAnalyzer.jsx";
import Planning from "./components/Planning.jsx";
import Valuation from "./components/Valuation.jsx";
import DailyPlan from "./components/DailyPlan.jsx";
import Weather from "./components/Weather.jsx";
import Chatbot from "./components/Assistant.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import {
  IconShield,
  IconCrack,
  IconBlueprint,
  IconRupee,
  IconCalendar,
  IconWeather,
  IconBot,
} from "./components/ui.jsx";

const TABS = [
  ["safety", "Safety & PPE", SafetyTab, IconShield],
  ["cracks", "Crack Diagnostics", CrackTab, IconCrack],
  ["planning", "Project Planning", Planning, IconBlueprint],
  ["valuation", "Real Estate Valuation", Valuation, IconRupee],
  ["daily", "Daily Site Plan", DailyPlan, IconCalendar],
  ["weather", "Weather Advisory", Weather, IconWeather],
  ["chat", "Construction Chatbot", Chatbot, IconBot],
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

  const activeTabConfig = TABS.find((t) => t[0] === tab) || TABS[0];
  const Active = activeTabConfig[2];

  return (
    <div className="app-container">
      <header className="top-navbar">
        <div className="top-navbar-inner">
          <div className="brand-wrapper">
            <div className="brand-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="6" width="20" height="8" rx="1" />
                <path d="M17 14v7" />
                <path d="M7 14v7" />
                <path d="M17 3v3" />
                <path d="M7 3v3" />
                <line x1="10" y1="14" x2="14" y2="14" />
              </svg>
            </div>
            <div className="brand-text">
              <h1>ConstructionAI</h1>
              <span className="brand-tag">Multimodal Site Intelligence</span>
            </div>
          </div>

          <div className={`status-badge ${offline ? "off" : health?.ai_mode === "live" ? "live" : "demo"}`}>
            <span className="pulse-dot" />
            <span>
              {offline
                ? "Backend offline"
                : health?.ai_mode === "live"
                ? "AI Engine: Live (Gemini)"
                : health
                ? "AI Engine: Demo / Fallback"
                : "Connecting..."}
            </span>
          </div>
        </div>
      </header>

      <div className="main-content">
        {offline && (
          <div className="error" style={{ marginBottom: "18px", justifyContent: "space-between", flexWrap: "wrap" }}>
            <span>Cannot reach the backend (Render free tier may take ~50 s to wake up). Auto-retrying...</span>
            <button
              type="button"
              className="secondary"
              style={{ padding: "4px 12px", fontSize: "0.82rem", margin: 0 }}
              onClick={checkHealth}
              disabled={checking}
            >
              {checking ? "Checking..." : "Retry now"}
            </button>
          </div>
        )}

        <nav className="tab-navigation">
          {TABS.map(([id, label, , TabIcon]) => (
            <button
              key={id}
              className={`tab-btn ${tab === id ? "active" : ""}`}
              onClick={() => setTab(id)}
            >
              <TabIcon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <main>
          <ErrorBoundary resetKey={tab}>
            <Active />
          </ErrorBoundary>
        </main>
      </div>

      <footer>
        <p style={{ margin: 0 }}>
          <strong>Multimodal Construction Intelligence Platform</strong> &bull; Powered by Google Gemini AI &bull; AI outputs are advisory; verify safety and structural decisions with a certified civil engineer.
        </p>
      </footer>
    </div>
  );
}
