import React, { useEffect, useRef, useState } from "react";
import { sendChat } from "../api.js";

const SUGGESTIONS = ["How long should I cure concrete?", "What PPE is needed at height?", "How much cement for 1000 sq ft?"];

// Construction knowledge chatbot (Activity 5.1).
export default function Chatbot() {
  const [messages, setMessages] = useState([{ role: "assistant", content: "Hi! Ask me about curing, cracks, PPE, material quantities or safety procedures." }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView?.({ behavior: "smooth" }); }, [messages]);

  const send = async (override) => {
    const text = (override ?? input).trim();
    if (!text || busy) return;
    setInput("");
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: "user", content: text }]);
    setBusy(true);
    try {
      const r = await sendChat(text, history);
      setMessages((m) => [...m, { role: "assistant", content: r?.reply || "I could not generate an answer. Please rephrase your question." }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>Construction Chatbot</h2>
      <p className="muted">Concise, practical answers. It assists engineers; it does not replace professional judgment.</p>
      <div className="chips">
        {SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => send(s)} disabled={busy}>{s}</button>)}
      </div>
      <div className="chat">
        {messages.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.content}</div>)}
        {busy && <div className="msg assistant">Thinking...</div>}
        <div ref={endRef} />
      </div>
      <div className="row">
        <input value={input} maxLength={2000} placeholder="Ask a construction question" onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
        <button onClick={() => send()} disabled={busy}>Send</button>
      </div>
    </section>
  );
}
