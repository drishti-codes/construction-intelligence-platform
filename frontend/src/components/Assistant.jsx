import React, { useEffect, useRef, useState } from "react";
import { sendChat } from "../api.js";
import { IconBot } from "./ui.jsx";

const SUGGESTIONS = [
  "How long should I cure RCC slab concrete?",
  "What mandatory PPE is required for work at height above 1.8m?",
  "How much cement, sand and aggregate for 1000 sq ft RCC?",
  "What is the difference between settlement and shear cracks?",
  "What precautions are needed for concreting during monsoon?",
];

// Construction knowledge chatbot (Activity 5.1).
export default function Chatbot() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hello! I am your AI Construction Assistant. Ask me about Indian Standard codes (IS 456, IS 3764), concrete curing, crack diagnostics, thumb-rule material estimates, or jobsite safety procedures.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages, busy]);

  const send = async (override) => {
    const text = (override ?? input).trim();
    if (!text || busy) return;
    setInput("");
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: "user", content: text }]);
    setBusy(true);
    try {
      const r = await sendChat(text, history);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: r?.reply || "I could not generate an answer. Please rephrase your question with more specifics.",
        },
      ]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Error: ${e.message}` },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>AI Construction Knowledge Assistant</h2>
        <p>Expert conversational assistant for Indian civil engineering practices, IS codes, and daily site problems.</p>
      </div>

      <div>
        <span style={{ fontSize: "0.82rem", color: "var(--muted)", fontWeight: 600, display: "block", marginBottom: "6px" }}>
          Suggested Prompt Starters
        </span>
        <div className="chips">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="chip"
              onClick={() => send(s)}
              disabled={busy}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="chat-window">
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", marginBottom: "4px", opacity: 0.85 }}>
              {m.role === "user" ? "You" : "ConstructionAI"}
            </div>
            {m.content}
          </div>
        ))}
        {busy && (
          <div className="msg assistant thinking">
            <span className="pulse-dot" style={{ backgroundColor: "var(--brand)" }} />
            <span>Consulting engineering knowledge base...</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
        <input
          value={input}
          maxLength={2000}
          placeholder="Ask a technical question about materials, safety, or site operations..."
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
        />
        <button
          type="button"
          onClick={() => send()}
          disabled={busy || !input.trim()}
          style={{ alignSelf: "stretch", padding: "0 22px" }}
        >
          Send
        </button>
      </div>
    </section>
  );
}
