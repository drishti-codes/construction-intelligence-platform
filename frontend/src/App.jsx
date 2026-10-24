import React, { useEffect, useState } from "react";
import { getHealth } from "./api.js";
import { SafetyTab, CrackTab } from "./components/ImageAnalyzer.jsx";
import Planning from "./components/Planning.jsx";
import Assistant from "./components/Assistant.jsx";

const TABS = [
  ["safety", "Site Safety & PPE", SafetyTab],
  ["cracks", "Crack Analysis", CrackTab],
  ["planning", "Planning & Valuation", Planning],
  ["assistant", "Site Assistant", Assistant],
];

export default function App() {
  const [tab, setTab] = useState("safety");
  const [health, setHealth] = useState(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    getHealth().then(setHealth).catch(() => setOffline(true));
  }, []);

  const Active = TABS.find((t) => t[0] === tab)[2];

  return (
    <div className="app">
      <header>
        <h1>Multimodal Construction Intelligence Platform</h1>
        <span className={`status ${offline ? "off" : health?.ai_mode === "live" ? "live" : "demo"}`}>
          {offline ? "Backend offline" : health ? `AI: ${health.ai_mode}` : "Connecting..."}
        </span>
      </header>
      {offline && <div className="error">Cannot reach the backend. Start it with: uvicorn main:app --port 8000</div>}
      <nav>
        {TABS.map(([id, label]) => (
          <button key={id} className={tab === id ? "tab active" : "tab"} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>
      <main><Active /></main>
      <footer>AI output is advisory. Confirm structural and safety decisions with a qualified engineer.</footer>
    </div>
  );
}
