
 // In development, Vite can proxy /api to FastAPI.
// In production, set VITE_API_URL to your deployed backend URL.
const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

// Parse JSON responses and show readable error messages.
async function parse(res) {
  let body = null;

  try {
    body = await res.json();
  } catch {
    // The response may not contain JSON.
  }

  if (!res.ok) {
    const detail = body?.detail;
    let message;

    if (Array.isArray(detail)) {
      message = detail
        .map((item) => item?.msg || item?.message || String(item))
        .join("; ");
    } else if (typeof detail === "string") {
      message = detail;
    } else if (detail != null) {
      message = JSON.stringify(detail);
    } else if (typeof body?.message === "string") {
      message = body.message;
    }

    throw new Error(message || `Request failed (${res.status})`);
  }

  return body;
}

// Send a request to the backend.
async function request(path, options = {}) {
  let res;

  try {
    res = await fetch(`${BASE}${path}`, options);
  } catch {
    throw new Error(
      "Cannot reach the server. Check your internet connection and backend URL. " +
      "The free Render server may need about 50 seconds to wake up."
    );
  }

  return parse(res);
}

// Send JSON data.
const postJson = (path, payload) =>
  request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

// Check backend health.
export const getHealth = () => request("/api/health");

// Upload an image with its description.
export const analyzeImage = (endpoint, file, description) => {
  const form = new FormData();

  if (file) {
    form.append("image", file);
  }

  form.append("description", description || "");

  // Do not set Content-Type manually for FormData.
  // The browser adds the required multipart boundary.
  return request(`/api/${endpoint}`, {
    method: "POST",
    body: form,
  });
};

// Project planning.
export const planProject = (payload) =>
  postJson("/api/planning", payload);

// Property valuation.
export const valueProperty = (payload) =>
  postJson("/api/valuation", payload);

// Daily construction site plan.
export const dailyPlan = (payload) =>
  postJson("/api/daily-plan", payload);

// Weather safety advisory.
export const weatherAdvisory = (payload) =>
  postJson("/api/weather-advisory", payload);

// Construction chatbot.
export const sendChat = (message, history) =>
  postJson("/api/chat", { message, history });
