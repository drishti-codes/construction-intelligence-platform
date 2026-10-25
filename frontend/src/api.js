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

async function request(path, options) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, options);
  } catch {
    throw new Error("Cannot reach the server. Check your internet and try again (the free server may take ~50 s to wake up).");
  }
  return parse(res);
}

const postJson = (path, payload) =>
  request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

export const getHealth = () => request("/api/health");

export const analyzeImage = (endpoint, file, description) => {
  const form = new FormData();
  if (file) form.append("image", file);
  form.append("description", description || "");
  return request(`/api/${endpoint}`, { method: "POST", body: form });
};

export const planProject = (payload) => postJson("/api/planning", payload);
export const valueProperty = (payload) => postJson("/api/valuation", payload);
export const dailyPlan = (payload) => postJson("/api/daily-plan", payload);
export const weatherAdvisory = (payload) => postJson("/api/weather-advisory", payload);
export const sendChat = (message, history) => postJson("/api/chat", { message, history });
