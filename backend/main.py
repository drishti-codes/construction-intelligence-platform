"""Multimodal Construction Intelligence Platform - FastAPI backend.

All AI responses are validated against strict Pydantic schemas. If no
GEMINI_API_KEY is configured (or the AI call fails / returns invalid JSON),
the API falls back to a clearly labelled demo response so the UI never breaks.
"""
import io
import json
import os
from typing import Dict, List, Literal, Optional
from urllib.parse import quote

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel, Field

load_dotenv()

app = FastAPI(title="Multimodal Construction Intelligence Platform", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

Severity = Literal["Low", "Medium", "High", "Critical"]
PpeState = Literal["Compliant", "Missing", "Not visible"]
MAX_IMAGE_BYTES = 8 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}


# ----------------------------------------------------------------- schemas
class Hazard(BaseModel):
    name: str
    severity: Severity
    remedy: str


class PpeChecklist(BaseModel):
    helmet: PpeState
    high_vis_vest: PpeState
    safety_boots: PpeState
    safety_harness: PpeState


class SafetyReport(BaseModel):
    safety_score: int = Field(ge=0, le=100)
    overall_status: Literal["Safe", "Needs Attention", "Unsafe"]
    ppe: PpeChecklist
    hazards: List[Hazard]
    summary: str
    mode: Literal["live", "demo"] = "live"
    warning: Optional[str] = None


class CrackReport(BaseModel):
    crack_type: Literal["Hairline", "Settlement", "Structural Shear", "Thermal Expansion", "Spalling", "No crack visible"]
    estimated_width_mm: float = Field(ge=0, le=100)
    severity: Severity
    urgency: Literal["Monitor", "Repair within 3 months", "Repair within 2 weeks", "Immediate action"]
    probable_causes: List[str]
    corrective_actions: List[str]
    summary: str
    mode: Literal["live", "demo"] = "live"
    warning: Optional[str] = None


class PlanningRequest(BaseModel):
    structure_type: Literal["Residential", "Commercial", "Industrial"]
    built_up_sqft: float = Field(gt=0, le=1_000_000)
    location_tier: Literal[1, 2, 3]
    completion_pct: float = Field(ge=0, le=100)
    floors: int = Field(default=1, ge=1, le=50)


class Phase(BaseModel):
    name: str
    weeks: int
    status: Literal["Done", "In progress", "Pending"]


class PlanningReport(BaseModel):
    total_budget_inr: float
    spent_inr: float
    remaining_inr: float
    market_valuation_inr: float
    total_budget_label: str
    spent_label: str
    market_valuation_label: str
    materials: Dict[str, float]
    schedule: List[Phase]
    visualization_url: str
    assumptions: List[str]


class WeatherAdvisory(BaseModel):
    condition: str
    risk_level: Severity
    alerts: List[str]


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: List[Dict[str, str]] = []


class ChatReply(BaseModel):
    reply: str
    mode: Literal["live", "demo"] = "live"


# ----------------------------------------------------------------- AI layer
MODEL_NAME = lambda: os.getenv("GEMINI_MODEL", "gemini-flash-latest")


def _get_client():
    """Return a google-genai client, or None when no API key is configured."""
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        return None
    from google import genai

    return genai.Client(api_key=key)


def _generate_json(client, contents) -> dict:
    """Ask the model for JSON and parse it. Raises on any failure."""
    from google.genai import types

    resp = client.models.generate_content(
        model=MODEL_NAME(),
        contents=contents,
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )
    text = (resp.text or "").strip()
    if not text:
        raise ValueError("Model returned an empty response")
    return json.loads(text)


def _err(exc: Exception) -> str:
    return f"{type(exc).__name__}: {str(exc)[:160]}"


def run_ai(prompt: str, image: Optional[Image.Image], schema, demo_fn):
    """Call the multimodal LLM, validate against `schema`, else fall back to demo."""
    client = _get_client()
    if client is None:
        data = demo_fn()
        data.update(mode="demo", warning="No GEMINI_API_KEY set - showing demo output.")
        return data
    try:
        contents = [prompt] + ([image] if image is not None else [])
        return schema(**_generate_json(client, contents)).model_dump()
    except Exception as exc:  # network, quota, invalid JSON, schema mismatch
        data = demo_fn()
        data.update(mode="demo", warning=f"AI unavailable ({_err(exc)}) - showing demo output.")
        return data


async def load_image(file: Optional[UploadFile]) -> Optional[Image.Image]:
    if file is None or not file.filename:
        return None
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(415, "Unsupported file type. Upload a JPG, PNG or WEBP image.")
    data = await file.read()
    if not data:
        raise HTTPException(422, "Uploaded file is empty.")
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Image too large (max 8 MB).")
    try:
        img = Image.open(io.BytesIO(data))
        img.load()  # raises on truncated / incomplete images
    except Exception:
        raise HTTPException(422, "Image is corrupt or incomplete. Please upload another photo.")
    if min(img.size) < 64:
        raise HTTPException(422, "Image is too small to analyse (minimum 64x64 px).")
    img = img.convert("RGB")
    img.thumbnail((1280, 1280))
    return img


# ----------------------------------------------------------------- demo data
def demo_safety() -> dict:
    return SafetyReport(
        safety_score=62,
        overall_status="Needs Attention",
        ppe=PpeChecklist(helmet="Compliant", high_vis_vest="Compliant", safety_boots="Not visible", safety_harness="Missing"),
        hazards=[
            Hazard(name="Worker at height without harness", severity="High", remedy="Stop work at height until full-body harness is anchored to a rated point."),
            Hazard(name="Loose materials near edge", severity="Medium", remedy="Stack materials away from edges and install toe boards."),
        ],
        summary="Demo output: partial PPE compliance with a fall-protection gap.",
    ).model_dump()


def demo_crack() -> dict:
    return CrackReport(
        crack_type="Settlement",
        estimated_width_mm=3.5,
        severity="Medium",
        urgency="Repair within 2 weeks",
        probable_causes=["Differential foundation settlement", "Poor soil compaction", "Water ingress near footing"],
        corrective_actions=["Install crack monitors (tell-tales)", "Epoxy injection after movement stabilises", "Improve drainage around foundation"],
        summary="Demo output: diagonal settlement crack; monitor and repair after stabilisation.",
    ).model_dump()


SAFETY_PROMPT = """You are a construction safety inspector (OSHA / IS 456 / IS 3764 aware).
Analyse the site image and description. Return ONLY JSON matching exactly:
{"safety_score":0-100 int,"overall_status":"Safe|Needs Attention|Unsafe",
"ppe":{"helmet":"Compliant|Missing|Not visible","high_vis_vest":"...","safety_boots":"...","safety_harness":"..."},
"hazards":[{"name":str,"severity":"Low|Medium|High|Critical","remedy":str}],"summary":str}
If the image is unclear, say so in summary and use "Not visible". Description: """

CRACK_PROMPT = """You are a structural engineer. Analyse the surface image and description.
Return ONLY JSON matching exactly:
{"crack_type":"Hairline|Settlement|Structural Shear|Thermal Expansion|Spalling|No crack visible",
"estimated_width_mm":number,"severity":"Low|Medium|High|Critical",
"urgency":"Monitor|Repair within 3 months|Repair within 2 weeks|Immediate action",
"probable_causes":[str],"corrective_actions":[str],"summary":str}
Description: """


# ----------------------------------------------------------------- routes
@app.get("/api/health")
def health():
    return {"status": "ok", "ai_mode": "live" if os.getenv("GEMINI_API_KEY") else "demo"}


@app.post("/api/safety", response_model=SafetyReport)
async def safety(image: Optional[UploadFile] = File(None), description: str = Form("")):
    img = await load_image(image)
    if img is None and not description.strip():
        raise HTTPException(422, "Provide a site image or a text description.")
    return run_ai(SAFETY_PROMPT + description[:1500], img, SafetyReport, demo_safety)


@app.post("/api/cracks", response_model=CrackReport)
async def cracks(image: Optional[UploadFile] = File(None), description: str = Form("")):
    img = await load_image(image)
    if img is None and not description.strip():
        raise HTTPException(422, "Provide a wall/concrete image or a text description.")
    return run_ai(CRACK_PROMPT + description[:1500], img, CrackReport, demo_crack)


# Planning & valuation (deterministic, transparent assumptions)
COST_PER_SQFT = {"Residential": 1800, "Commercial": 2400, "Industrial": 2000}
TIER_COST_FACTOR = {1: 1.25, 2: 1.0, 3: 0.85}
MARKET_RATE_PER_SQFT = {1: 9000, 2: 5500, 3: 3200}


def inr_label(v: float) -> str:
    if v >= 1e7:
        return f"Rs {v / 1e7:.2f} Cr"
    return f"Rs {v / 1e5:.2f} Lakh"


@app.post("/api/planning", response_model=PlanningReport)
def planning(req: PlanningRequest):
    area = req.built_up_sqft
    budget = area * COST_PER_SQFT[req.structure_type] * TIER_COST_FACTOR[req.location_tier]
    spent = budget * req.completion_pct / 100
    # Value grows from land-only (40%) to full built value (100%) with completion.
    valuation = area * MARKET_RATE_PER_SQFT[req.location_tier] * (0.4 + 0.6 * req.completion_pct / 100)
    materials = {
        "cement_bags_50kg": round(area * 0.4),
        "steel_kg": round(area * 4.0),
        "sand_cft": round(area * 1.2),
        "bricks_nos": round(area * 8),
    }
    total_weeks = max(8, round(area / 100 + req.floors * 4))
    split = [("Foundation", 0.2), ("Structure", 0.35), ("Masonry & MEP", 0.25), ("Finishing", 0.2)]
    schedule, cum = [], 0.0
    for name, share in split:
        start, end = cum, cum + share * 100
        cum = end
        status = "Done" if req.completion_pct >= end else "In progress" if req.completion_pct > start else "Pending"
        schedule.append(Phase(name=name, weeks=max(1, round(total_weeks * share)), status=status))
    prompt = f"architectural render of a {req.floors} storey {req.structure_type.lower()} building, modern, daylight, photorealistic"
    return PlanningReport(
        total_budget_inr=round(budget),
        spent_inr=round(spent),
        remaining_inr=round(budget - spent),
        market_valuation_inr=round(valuation),
        total_budget_label=inr_label(budget),
        spent_label=inr_label(spent),
        market_valuation_label=inr_label(valuation),
        materials=materials,
        schedule=schedule,
        visualization_url="https://image.pollinations.ai/prompt/" + quote(prompt) + "?width=768&height=512",
        assumptions=[
            "Cost/sqft: Residential 1800, Commercial 2400, Industrial 2000 (INR), scaled by tier (T1 x1.25, T2 x1.0, T3 x0.85).",
            "Market rate/sqft: Tier1 9000, Tier2 5500, Tier3 3200 (INR). Valuation = rate x area x (0.4 + 0.6 x completion).",
            "Material quantities are rule-of-thumb estimates; confirm with a structural engineer / BOQ.",
        ],
    )


WEATHER: Dict[str, WeatherAdvisory] = {
    "Normal": WeatherAdvisory(condition="Normal", risk_level="Low", alerts=["Proceed with standard daily toolbox talk.", "Keep hydration points stocked."]),
    "High Wind": WeatherAdvisory(condition="High Wind", risk_level="High", alerts=["Suspend crane and hoist operations above 40 km/h.", "Secure scaffolding sheets and loose materials.", "Restrict work at height."]),
    "Heavy Rain": WeatherAdvisory(condition="Heavy Rain", risk_level="High", alerts=["Cover fresh concrete and protect curing work.", "De-energise temporary electrical panels in wet areas.", "Check excavation sides for collapse risk."]),
    "Extreme Heat": WeatherAdvisory(condition="Extreme Heat", risk_level="Medium", alerts=["Shift heavy work to early morning.", "Increase water and rest breaks to prevent heat stress.", "Wet-cure concrete more frequently."]),
}


@app.get("/api/weather-advisory", response_model=WeatherAdvisory)
def weather_advisory(condition: str = "Normal"):
    if condition not in WEATHER:
        raise HTTPException(404, f"Unknown condition. Choose one of: {', '.join(WEATHER)}")
    return WEATHER[condition]


DEMO_REPLIES = {
    "curing": "Keep concrete moist for at least 7 days (10+ for blended cements) and shade it from direct sun and wind.",
    "crack": "Hairline cracks under 0.3 mm are usually cosmetic; wider or growing cracks need an engineer's inspection.",
    "ppe": "Minimum PPE: helmet, high-vis vest, safety boots; add harness for work above 1.8 m.",
    "cement": "A rough guide is 0.4 bags of cement per sqft of built-up area for RCC residential work.",
}


@app.post("/api/chat", response_model=ChatReply)
def chat(req: ChatRequest):
    client = _get_client()
    if client is not None:
        try:
            ctx = "\n".join(f"{m.get('role', 'user')}: {m.get('content', '')}" for m in req.history[-6:])
            prompt = ('You are a concise construction engineering assistant for Indian sites. '
                      'Return ONLY JSON {"reply": str}.\n' + ctx + "\nuser: " + req.message)
            return ChatReply(**_generate_json(client, prompt), mode="live")
        except Exception:
            pass
    text = req.message.lower()
    for key, answer in DEMO_REPLIES.items():
        if key in text:
            return ChatReply(reply=answer, mode="demo")
    return ChatReply(reply="Demo mode: ask about curing, cracks, PPE or cement quantity. Add a GEMINI_API_KEY for full answers.", mode="demo")
