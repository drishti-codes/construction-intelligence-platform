import React, { useEffect, useRef, useState } from "react";
import { getWeather, sendChat } from "../api.js";

const CONDITIONS = ["Normal", "High Wind", "Heavy Rain", "Extreme Heat"];

export default function Assistant() {
  const [condition, setCondition] = useState("Normal");
  const [advisory, setAdvisory] = useState(null);
  const [wxError, setWxError] = useState("");
  const [messages, setMessages] = useState([{ role: "assistant", content: "Hi! Ask me about curing, cracks, PPE or material quantities." }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    setWxError("");
    getWeather(condition).then(setAdvisory).catch((e) => { setAdvisory(null); setWxError(e.message); });
  }, [condition]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: "user", content: text }]);
    setBusy(true);
    try {
      const r = await sendChat(text, history);
      setMessages((m) => [...m, { role: "assistant", content: r.reply }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>Daily Site Assistant</h2>
      <label>Today's weather condition
        <select value={condition} onChange={(e) => setCondition(e.target.value)}>
          {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      {wxError && <div className="error" role="alert">{wxError}</div>}
      {advisory && (
        <div className="card-sm">
          <b>Risk level: {advisory.risk_level}</b>
          <ul>{advisory.alerts.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
      )}

      <h4>Construction knowledge assistant</h4>
      <div className="chat">
        {messages.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.content}</div>)}
        {busy && <div className="msg assistant">Thinking...</div>}
        <div ref={endRef} />
      </div>
      <div className="row">
        <input value={input} maxLength={2000} placeholder="Ask a site engineering question" onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
        <button onClick={send} disabled={busy}>Send</button>
      </div>
    </section>
  );
}
