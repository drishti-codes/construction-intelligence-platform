// In dev, Vite proxies /api to FastAPI. In production set VITE_API_URL to the deployed backend URL.
const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

// Thin API client. Every call returns parsed JSON or throws an Error with a readable message.
async function parse(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    const detail = body?.detail;
    const msg = Array.isArray(detail) ? detail.map((d) => d.msg).join("; ") : detail;
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return body;
}

export const getHealth = () => fetch(`${BASE}/api/health`).then(parse);

export const analyzeImage = (endpoint, file, description) => {
  const form = new FormData();
  if (file) form.append("image", file);
  form.append("description", description || "");
  return fetch(`${BASE}/api/${endpoint}`, { method: "POST", body: form }).then(parse);
};

export const planProject = (payload) =>
  fetch(`${BASE}/api/planning`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(parse);

export const getWeather = (condition) =>
  fetch(`${BASE}/api/weather-advisory?condition=${encodeURIComponent(condition)}`).then(parse);

export const sendChat = (message, history) =>
  fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  }).then(parse);
