# Multimodal Construction Intelligence Platform

AI-powered decision-support system for construction: site safety / PPE audit, crack diagnostics, planning & real-estate valuation, weather-aware daily advisory and a construction knowledge chatbot.

**Stack:** React 18 + Vite (frontend) | FastAPI + Pydantic (backend) | Google Gemini multimodal LLM | Pillow

## Features
| Tab | What it does |
|---|---|
| Site Safety & PPE | Upload a site photo and/or description. Returns safety score, PPE checklist (helmet, vest, boots, harness) and hazards with severity and remedies |
| Crack Analysis | Classifies crack type, estimated width, severity, urgency, probable causes and corrective actions |
| Planning & Valuation | Budget, spend, material estimate (cement, steel, sand, bricks), phase schedule, market valuation in INR (Lakh/Cr), AI architectural concept image |
| Site Assistant | Weather-aware safety alerts (wind / rain / heat) and a multi-turn construction chatbot |

**Strict JSON contracts:** every AI response is validated by a Pydantic schema (`SafetyReport`, `CrackReport`, ...). Invalid or failed AI output automatically falls back to a labelled demo response, so the UI never crashes.

## Run locally
Requirements: Python 3.9+, Node.js 18+, Git.

```bash
# 1. Backend
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # add GEMINI_API_KEY (free: https://aistudio.google.com/app/apikey)
uvicorn main:app --reload --port 8000

# 2. Frontend (new terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173
```
Without a `GEMINI_API_KEY` the app runs in **demo mode** (header badge shows "AI: demo").
The API key lives only in `backend/.env` (git-ignored) and is never sent to the browser.

## API
| Method | Endpoint | Input |
|---|---|---|
| GET | `/api/health` | - |
| POST | `/api/safety` | multipart: `image` (jpg/png/webp, <=8 MB), `description` |
| POST | `/api/cracks` | multipart: `image`, `description` |
| POST | `/api/planning` | JSON: `structure_type`, `built_up_sqft`, `location_tier` (1-3), `completion_pct` (0-100), `floors` |
| GET | `/api/weather-advisory?condition=` | Normal / High Wind / Heavy Rain / Extreme Heat |
| POST | `/api/chat` | JSON: `message`, `history` |

Interactive docs: http://localhost:8000/docs

## Testing
```bash
cd backend && python -m pytest -q      # 17 tests
cd frontend && npm run build           # production build check
```
Covered: functional endpoints, schema conformance, wrong file type (415), empty / truncated / tiny images (422), missing input, out-of-range numbers, unknown weather condition, empty chat message.

Manual UI checklist: upload each tab, upload a non-image, submit with nothing, set completion 0% and 100%, stop the backend (UI shows "Backend offline"), resize to phone width.

## Deployment
- **Backend (Render):** New Web Service, root `backend`, build `pip install -r requirements.txt`, start `uvicorn main:app --host 0.0.0.0 --port $PORT`. Env vars: `GEMINI_API_KEY`, `CORS_ORIGINS=https://<your-frontend>.vercel.app`.
- **Frontend (Vercel):** import repo, root `frontend`, framework Vite. Env var: `VITE_API_URL=https://<your-backend>.onrender.com`.
- Submit the Vercel URL as the **Demo Link** and the GitHub repo URL as the **GitHub Link** on Skill Wallet.

## Known limitations
- Planning costs and valuation use fixed rule-of-thumb rates (see assumptions in the UI); they are estimates, not a BOQ or a certified valuation.
- Crack width and PPE detection come from a general multimodal LLM, not a calibrated CV model; results are advisory.
- Render free tier sleeps after inactivity (first request can take ~50 s).
- Architectural image uses the public Pollinations service and may be slow or unavailable.
- No user accounts or database; nothing is stored.
