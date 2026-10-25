"""Multimodal Construction Intelligence Platform - FastAPI backend.


Architecture

------------

* ONE centralized AI layer (`run_ai` -> `_generate_json`) serves every feature.

  It sends a shared construction-domain system prompt, tags each request with a

  FEATURE identifier, retries temporary Google errors and tries a backup model.

* Every AI answer is validated by a lenient Pydantic schema: missing / malformed

  fields get safe defaults, so the frontend never receives undefined data.

* If there is no GEMINI_API_KEY, the AI fails, or the answer is empty / implausible,

  the API returns a clearly labelled rule-based fallback (mode = "demo").

"""

import io

import json

import math

import os

import re

import time

from typing import Annotated, Dict, List, Literal, Optional

from urllib.parse import quote


from dotenv import load_dotenv

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from fastapi.middleware.cors import CORSMiddleware

from PIL import Image

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, model_validator


load_dotenv()


app = FastAPI(title="Multimodal Construction Intelligence Platform", version="2.0.0")

app.add_middleware(

    CORSMiddleware,

    allow_origins=[origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if origin.strip()],

    allow_methods=["*"],

    allow_headers=["*"],

)


MAX_IMAGE_BYTES = 8 * 1024 * 1024

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}


# =========================================================== lenient schema helpers

def _coerce_enum(allowed, default):

    lookup = {a.lower(): a for a in allowed}


    def fn(v):

        return lookup.get(v.strip().lower(), default) if isinstance(v, str) else default


    return fn


def _txt(v):

    return "" if v is None else str(v).strip()


def _num(v):

    if isinstance(v, bool):

        return 0.0

    if isinstance(v, (int, float)):

        return float(v) if math.isfinite(v) else 0.0

    if isinstance(v, str):

        m = re.search(r"-?\d[\d,]*(?:\.\d+)?", v)

        if m:

            try:

                return float(m.group(0).replace(",", ""))

            except ValueError:

                pass

    return 0.0


def _str_list(v):

    if v is None:

        return []

    if isinstance(v, str):

        return [v.strip()] if v.strip() else []

    if isinstance(v, (list, tuple)):

        return [_txt(x) for x in v if _txt(x)]

    return []


def _obj_list(v):

    """Keep only dict items (from AI JSON) or already-built models; drop junk like strings."""

    return [x for x in v if isinstance(x, (dict, BaseModel))] if isinstance(v, list) else []


def _score(v):

    return int(max(0, min(100, _num(v))))


def Choice(allowed, default):

    return Annotated[Literal[tuple(allowed)], BeforeValidator(_coerce_enum(allowed, default))]


Txt = Annotated[str, BeforeValidator(_txt)]

Num = Annotated[float, BeforeValidator(_num)]

Score = Annotated[int, BeforeValidator(_score)]

StrList = Annotated[List[str], BeforeValidator(_str_list)]


SEVERITIES = ["Low", "Medium", "High", "Critical"]

Severity = Choice(SEVERITIES, "Medium")

Priority = Choice(["Low", "Medium", "High"], "Medium")

PpeState = Choice(["Compliant", "Missing", "Not visible"], "Not visible")

Mode = Literal["live", "demo"]


class Lenient(BaseModel):

    model_config = ConfigDict(extra="ignore")


# =========================================================== response schemas

class Hazard(Lenient):

    name: Txt = "Unspecified hazard"

    severity: Severity = "Medium"

    remedy: Txt = ""


class PpeChecklist(Lenient):

    helmet: PpeState = "Not visible"

    high_vis_vest: PpeState = "Not visible"

    safety_boots: PpeState = "Not visible"

    safety_harness: PpeState = "Not visible"


class SafetyReport(Lenient):

    safety_score: Score = 50

    overall_status: Choice(["Safe", "Needs Attention", "Unsafe"], "Needs Attention") = "Needs Attention"

    ppe: PpeChecklist = PpeChecklist()

    hazards: Annotated[List[Hazard], BeforeValidator(_obj_list)] = []

    recommended_ppe: StrList = []

    safety_guidelines: StrList = []

    environmental_risks: StrList = []

    summary: Txt = ""

    mode: Mode = "live"

    warning: Optional[str] = None


    @model_validator(mode="after")

    def _not_empty(self):

        if not self.summary and not self.hazards:

            raise ValueError("empty AI response")

        return self


class CrackReport(Lenient):

    crack_type: Choice(

        ["Hairline", "Vertical", "Diagonal", "Settlement", "Structural Shear", "Thermal Expansion", "Spalling", "No crack visible"],

        "Hairline",

    ) = "Hairline"

    estimated_width_mm: Num = 0

    severity: Severity = "Medium"

    urgency: Choice(["Monitor", "Repair within 3 months", "Repair within 2 weeks", "Immediate action"], "Monitor") = "Monitor"

    probable_causes: StrList = []

    potential_risks: StrList = []

    corrective_actions: StrList = []

    preventive_measures: StrList = []

    summary: Txt = ""

    mode: Mode = "live"

    warning: Optional[str] = None


    @model_validator(mode="after")

    def _clean(self):

        self.estimated_width_mm = round(max(0.0, min(100.0, self.estimated_width_mm)), 1)

        if not self.summary and not self.probable_causes and not self.corrective_actions:

            raise ValueError("empty AI response")

        return self


# ---- planning

class PlanningRequest(BaseModel):

    plot_size_sqft: float = Field(gt=0, le=1_000_000)

    construction_type: Literal["Residential", "Commercial", "Industrial"]

    city: str = Field(min_length=1, max_length=80)

    floors: int = Field(default=1, ge=1, le=50)


class CostItem(Lenient):

    item: Txt = ""

    amount_inr: Num = 0


class Materials(Lenient):

    cement_bags: Num = 0

    sand_cft: Num = 0

    aggregate_cft: Num = 0

    steel_kg: Num = 0

    bricks_nos: Num = 0


class Phase(Lenient):

    name: Txt = ""

    weeks: Num = 0

    description: Txt = ""


class PlanningReport(Lenient):

    built_up_sqft: Num = 0

    total_cost_inr: Num = 0

    total_cost_label: Txt = ""

    cost_breakdown: Annotated[List[CostItem], BeforeValidator(_obj_list)] = []

    materials: Materials = Materials()

    schedule: Annotated[List[Phase], BeforeValidator(_obj_list)] = []

    total_weeks: Num = 0

    visualization_url: Txt = ""

    assumptions: StrList = []

    summary: Txt = ""

    mode: Mode = "live"

    warning: Optional[str] = None


# ---- valuation

AMENITIES = ["Lift", "Parking", "24x7 Security", "Power backup", "Gym", "Swimming pool", "Garden", "Clubhouse"]


class ValuationRequest(BaseModel):

    location: str = Field(min_length=1, max_length=100)

    area_sqft: float = Field(gt=0, le=1_000_000)

    property_type: Literal["Apartment", "House", "Villa", "Commercial"] = "Apartment"

    building_age_years: float = Field(default=0, ge=0, le=100)

    amenities: List[str] = Field(default=[], max_length=15)


class ValuationReport(Lenient):

    estimated_value_inr: Num = 0

    value_low_inr: Num = 0

    value_high_inr: Num = 0

    estimated_value_label: Txt = ""

    value_range_label: Txt = ""

    price_per_sqft_inr: Num = 0

    monthly_rent_inr: Num = 0

    rental_yield_pct: Num = 0

    annual_appreciation_pct: Num = 0

    five_year_roi_pct: Num = 0

    key_factors: StrList = []

    outlook: Txt = ""

    assumptions: StrList = []

    mode: Mode = "live"

    warning: Optional[str] = None


# ---- daily site assistant

class DailyRequest(BaseModel):

    activities: str = Field(min_length=1, max_length=1500)

    workforce: int = Field(ge=1, le=5000)

    site_conditions: str = Field(default="", max_length=500)


class DailyTask(Lenient):

    task: Txt = ""

    crew: Txt = ""

    priority: Priority = "Medium"


class RiskAlert(Lenient):

    risk: Txt = ""

    severity: Severity = "Medium"


class DailyReport(Lenient):

    tasks: Annotated[List[DailyTask], BeforeValidator(_obj_list)] = []

    materials_equipment: StrList = []

    safety_precautions: StrList = []

    risk_alerts: Annotated[List[RiskAlert], BeforeValidator(_obj_list)] = []

    summary: Txt = ""

    mode: Mode = "live"

    warning: Optional[str] = None


    @model_validator(mode="after")

    def _not_empty(self):

        if not self.tasks:

            raise ValueError("empty AI response")

        return self


# ---- weather advisory

WEATHER_CONDITIONS = ["Normal", "High Wind", "Heavy Rain", "Extreme Heat", "Thunderstorm", "Dense Fog"]


class WeatherRequest(BaseModel):

    activity: str = Field(min_length=1, max_length=300)

    condition: Literal["Normal", "High Wind", "Heavy Rain", "Extreme Heat", "Thunderstorm", "Dense Fog"]


class WeatherAdvisory(Lenient):

    decision: Annotated[Literal["GO", "NO-GO"], BeforeValidator(lambda v: "NO-GO" if _txt(v).strip().upper() in {"NO", "NO-GO", "NOGO"} else "GO")] = "GO"

    risk_level: Severity = "Medium"

    risks: StrList = []

    precautions: StrList = []

    rationale: Txt = ""

    mode: Mode = "live"

    warning: Optional[str] = None


    @model_validator(mode="after")

    def _not_empty(self):

        if not self.rationale and not self.risks and not self.precautions:

            raise ValueError("empty AI response")

        return self


# ---- chatbot

class ChatRequest(BaseModel):

    message: str = Field(min_length=1, max_length=2000)

    history: List[Dict[str, str]] = []


class ChatReply(Lenient):

    reply: Txt = ""

    mode: Mode = "live"


    @model_validator(mode="after")

    def _not_empty(self):

        if not self.reply:

            raise ValueError("empty AI response")

        return self


# =========================================================== centralized AI layer

SYSTEM_PROMPT = """You are ConstructionAI, an expert assistant for construction sites and real estate in India.

RULES:

1. Stay in the construction / civil-engineering / real-estate domain. If asked something unrelated, politely say you only help with construction topics.

2. The user message starts with 'FEATURE: <name>' - apply the reasoning guidelines of that feature only.

3. Reply with ONLY one valid JSON object that matches the schema described in the user message. No markdown, no code fences, no extra text.

4. Never leave keys out. Use [] for empty lists, 0 for unknown numbers and "" for unknown text. Never invent facts: if the input is unclear or incomplete, say so in the summary.

5. Money is in Indian Rupees (INR) as plain numbers. Use metric units plus square feet. Follow Indian practice (IS codes, NBC) where relevant.

6. Be concise, specific and actionable. You assist engineers; you do not replace a qualified engineer's judgment."""


MODEL_NAME = lambda: os.getenv("GEMINI_MODEL", "gemini-flash-latest")


def _get_client():

    """Return a google-genai client, or None when no API key is configured."""

    key = os.getenv("GEMINI_API_KEY")

    if not key:

        return None

    from google import genai


    return genai.Client(api_key=key)


def _is_transient(exc: Exception) -> bool:

    msg = str(exc)

    return any(tok in msg for tok in ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED", "500", "DEADLINE"))


def _generate_json(client, contents, feature: str = "general") -> dict:

    """Single entry point for ALL model calls.


    Adds the shared system prompt and the FEATURE identifier, retries temporary

    errors (503/429) with back-off, then tries a backup model once.

    """

    from google.genai import types


    if isinstance(contents, str):

        contents = [contents]

    contents = [f"FEATURE: {feature}\n{contents[0]}"] + list(contents[1:])


    models = [MODEL_NAME()]

    backup = os.getenv("GEMINI_FALLBACK_MODEL", "gemini-2.5-flash")

    if backup and backup not in models:

        models.append(backup)


    last_exc: Optional[Exception] = None

    for model in models:

        for attempt in range(3):

            try:

                resp = client.models.generate_content(

                    model=model,

                    contents=contents,

                    config=types.GenerateContentConfig(

                        system_instruction=SYSTEM_PROMPT,

                        response_mime_type="application/json",

                        temperature=0.2,

                    ),

                )

                text = (resp.text or "").strip()

                if not text:

                    raise ValueError("Model returned an empty response")

                return json.loads(text)

            except Exception as exc:

                last_exc = exc

                if not _is_transient(exc):

                    break

                time.sleep(1.5 * (attempt + 1))

    raise last_exc  # type: ignore[misc]


def _err(exc: Exception) -> str:

    return f"{type(exc).__name__}: {str(exc)[:160]}"


def _fallback(fn, warning: str) -> dict:

    data = fn()

    data.update(mode="demo", warning=warning)

    return data


def run_ai(feature: str, prompt: str, image: Optional[Image.Image], schema, fallback_fn, post=None) -> dict:
    """Call the multimodal LLM, validate the response, or return a labelled fallback."""
    if not os.getenv("GEMINI_API_KEY"):
        return _fallback(fallback_fn, "No GEMINI_API_KEY set - showing rule-based / demo output.")

    try:
        client = _get_client()
        if client is None:
            return _fallback(fallback_fn, "No GEMINI_API_KEY set - showing rule-based / demo output.")
        contents = [prompt] + ([image] if image is not None else [])
        data = schema(**_generate_json(client, contents, feature)).model_dump()
        return post(data) if post else data
    except Exception as exc:  # network, quota, bad JSON, empty / implausible answer
        return _fallback(fallback_fn, f"AI unavailable ({_err(exc)}) - showing rule-based / demo output.")


async def load_image(file: Optional[UploadFile]) -> Optional[Image.Image]:

    if file is None or not file.filename:

        return None

    if file.content_type not in ALLOWED_TYPES:

        raise HTTPException(415, "Unsupported file type. Upload a JPG, PNG or WEBP image.")

    data = await file.read(MAX_IMAGE_BYTES + 1)

    if not data:

        raise HTTPException(422, "Uploaded file is empty.")

    if len(data) > MAX_IMAGE_BYTES:

        raise HTTPException(413, "Image too large (max 8 MB).")

    try:

        img = Image.open(io.BytesIO(data))

        img.load()

    except Exception:

        raise HTTPException(422, "Image is corrupt or incomplete. Please upload another photo.")

    if min(img.size) < 64:

        raise HTTPException(422, "Image is too small to analyse (minimum 64x64 px).")

    img = img.convert("RGB")

    img.thumbnail((1280, 1280))

    return img


# =========================================================== shared helpers

def inr_label(v: float) -> str:

    if v >= 1e7:

        return f"Rs {v / 1e7:.2f} Cr"

    return f"Rs {v / 1e5:.2f} Lakh"


TIER1 = {"mumbai", "delhi", "new delhi", "bengaluru", "bangalore", "chennai", "hyderabad", "kolkata", "pune", "gurgaon", "gurugram", "noida"}

TIER3 = {"deoghar", "giridih", "hazaribagh", "bokaro", "dhanbad", "darbhanga", "gaya"}


def city_tier(text: str) -> int:

    t = text.lower()

    if any(c in t for c in TIER1):

        return 1

    if any(c in t for c in TIER3):

        return 3

    return 2


# =========================================================== 1. SAFETY

SAFETY_PROMPT = """Task: audit a construction-site photo and/or description for safety (OSHA, IS 3764, IS 7969 aware).

Look at: worker positions and proximity to hazards, PPE presence/absence, scaffolding and work at height, open edges, debris,

poor lighting, electrical and housekeeping risks. If the image is unclear, say so in summary and use "Not visible".

Return JSON with exactly these keys:

{"safety_score": 0-100 integer,

 "overall_status": "Safe" | "Needs Attention" | "Unsafe",

 "ppe": {"helmet": "Compliant"|"Missing"|"Not visible", "high_vis_vest": "...", "safety_boots": "...", "safety_harness": "..."},

 "hazards": [{"name": str, "severity": "Low"|"Medium"|"High"|"Critical", "remedy": str}],

 "recommended_ppe": [str],

 "safety_guidelines": [str],

 "environmental_risks": [str],

 "summary": str}

User description: """


def demo_safety() -> dict:

    return SafetyReport(

        safety_score=62,

        overall_status="Needs Attention",

        ppe=PpeChecklist(helmet="Compliant", high_vis_vest="Compliant", safety_boots="Not visible", safety_harness="Missing"),

        hazards=[

            Hazard(name="Worker at height without harness", severity="High", remedy="Stop work at height until a full-body harness is anchored to a rated point."),

            Hazard(name="Loose materials near edge", severity="Medium", remedy="Stack materials away from edges and install toe boards."),

        ],

        recommended_ppe=["Hard hat (IS 2925)", "High-visibility vest", "Safety boots with steel toe", "Full-body harness above 1.8 m"],

        safety_guidelines=["Hold a daily toolbox talk.", "Inspect scaffolding before every shift.", "Keep walkways clear of debris."],

        environmental_risks=["Open edges", "Possible poor lighting in enclosed areas"],

        summary="Demo output: partial PPE compliance with a fall-protection gap.",

    ).model_dump()


@app.post("/api/safety", response_model=SafetyReport)

async def safety(image: Optional[UploadFile] = File(None), description: str = Form("")):

    img = await load_image(image)

    if img is None and not description.strip():

        raise HTTPException(422, "Provide a site image or a text description.")

    return run_ai("safety_analysis", SAFETY_PROMPT + description[:1500], img, SafetyReport, demo_safety)


# =========================================================== 2. CRACKS

CRACK_PROMPT = """Task: assess a wall / concrete crack from the photo and/or description as a structural engineer.

Judge crack geometry (hairline, vertical, diagonal, stair-step), orientation and context. Do not replace a site inspection.

Return JSON with exactly these keys:

{"crack_type": "Hairline"|"Vertical"|"Diagonal"|"Settlement"|"Structural Shear"|"Thermal Expansion"|"Spalling"|"No crack visible",

 "estimated_width_mm": number,

 "severity": "Low"|"Medium"|"High"|"Critical",

 "urgency": "Monitor"|"Repair within 3 months"|"Repair within 2 weeks"|"Immediate action",

 "probable_causes": [str],

 "potential_risks": [str],

 "corrective_actions": [str],

 "preventive_measures": [str],

 "summary": str}

User description: """


def demo_crack() -> dict:

    return CrackReport(

        crack_type="Settlement",

        estimated_width_mm=3.5,

        severity="Medium",

        urgency="Repair within 2 weeks",

        probable_causes=["Differential foundation settlement", "Poor soil compaction", "Water ingress near footing"],

        potential_risks=["Crack widening over time", "Water seepage and rebar corrosion"],

        corrective_actions=["Install crack monitors (tell-tales)", "Epoxy injection after movement stabilises"],

        preventive_measures=["Improve drainage around the foundation", "Inspect after every monsoon"],

        summary="Demo output: diagonal settlement crack; monitor and repair after stabilisation.",

    ).model_dump()


@app.post("/api/cracks", response_model=CrackReport)

async def cracks(image: Optional[UploadFile] = File(None), description: str = Form("")):

    img = await load_image(image)

    if img is None and not description.strip():

        raise HTTPException(422, "Provide a wall/concrete image or a text description.")

    return run_ai("crack_analysis", CRACK_PROMPT + description[:1500], img, CrackReport, demo_crack)


# =========================================================== 3. PLANNING

COST_PER_SQFT = {"Residential": 1800, "Commercial": 2400, "Industrial": 2000}

TIER_COST_FACTOR = {1: 1.25, 2: 1.0, 3: 0.85}

COST_SPLIT = [("Materials", 0.45), ("Labour", 0.25), ("MEP (electrical and plumbing)", 0.12), ("Finishing", 0.13), ("Contingency", 0.05)]

PHASE_SPLIT = [

    ("Foundation", 0.20, "Excavation, footing and plinth"),

    ("Structure", 0.35, "Columns, beams and slabs"),

    ("Masonry and MEP", 0.25, "Walls, plastering, wiring and plumbing"),

    ("Finishing", 0.20, "Flooring, paint, fixtures and handover"),

]


def visualization_url(req: PlanningRequest) -> str:

    prompt = f"architectural render of a {req.floors} storey {req.construction_type.lower()} building in {req.city}, India, modern, daylight, photorealistic"

    return "https://image.pollinations.ai/prompt/" + quote(prompt) + "?width=768&height=512"


def planning_fallback(req: PlanningRequest) -> dict:

    tier = city_tier(req.city)

    built_up = req.plot_size_sqft * req.floors

    total = built_up * COST_PER_SQFT[req.construction_type] * TIER_COST_FACTOR[tier]

    total_weeks = max(8, round(built_up / 100 + req.floors * 4))

    return PlanningReport(

        built_up_sqft=built_up,

        total_cost_inr=round(total),

        cost_breakdown=[CostItem(item=n, amount_inr=round(total * s)) for n, s in COST_SPLIT],

        materials=Materials(

            cement_bags=round(built_up * 0.4),

            sand_cft=round(built_up * 1.2),

            aggregate_cft=round(built_up * 1.4),

            steel_kg=round(built_up * 4.0),

            bricks_nos=round(built_up * 8),

        ),

        schedule=[Phase(name=n, weeks=max(1, round(total_weeks * s)), description=d) for n, s, d in PHASE_SPLIT],

        total_weeks=total_weeks,

        assumptions=[

            f"City '{req.city}' treated as Tier {tier}. Cost per sq ft: Residential 1800, Commercial 2400, Industrial 2000 (INR), scaled by tier.",

            "Built-up area = plot size x floors (full plot coverage assumed).",

            "Material quantities use rule-of-thumb values per sq ft; confirm with a BOQ.",

        ],

        summary="Rule-based estimate using standard thumb rules.",

    ).model_dump()


PLANNING_PROMPT = """Task: create a consolidated construction project plan using standard Indian thumb rules and city-based cost assumptions.

Inputs: plot size {plot} sq ft, {floors} floor(s) (built-up area = plot x floors = {built} sq ft), type {ctype}, city {city}.

Return JSON with exactly these keys:

{{"built_up_sqft": number,

 "total_cost_inr": number,

 "cost_breakdown": [{{"item": str, "amount_inr": number}}],

 "materials": {{"cement_bags": number, "sand_cft": number, "aggregate_cft": number, "steel_kg": number, "bricks_nos": number}},

 "schedule": [{{"name": str, "weeks": number, "description": str}}],

 "total_weeks": number,

 "assumptions": [str],

 "summary": str}}

The cost_breakdown amounts must add up to total_cost_inr. Cement is in 50 kg bags."""


@app.post("/api/planning", response_model=PlanningReport)

def planning(req: PlanningRequest):

    built = req.plot_size_sqft * req.floors


    def post(d: dict) -> dict:

        items = d["cost_breakdown"]

        if items:

            d["total_cost_inr"] = round(sum(i["amount_inr"] for i in items))

        d["built_up_sqft"] = built

        per_sqft = d["total_cost_inr"] / built

        if not 500 <= per_sqft <= 20000:

            raise ValueError(f"implausible cost of Rs {per_sqft:.0f}/sqft")

        if not d["schedule"]:

            raise ValueError("no schedule returned")

        d["total_weeks"] = d["total_weeks"] or sum(p["weeks"] for p in d["schedule"])

        d["total_cost_label"] = inr_label(d["total_cost_inr"])

        d["visualization_url"] = visualization_url(req)

        return d


    prompt = PLANNING_PROMPT.format(plot=req.plot_size_sqft, floors=req.floors, built=built, ctype=req.construction_type, city=req.city)


    def fb() -> dict:

        d = planning_fallback(req)

        d["total_cost_label"] = inr_label(d["total_cost_inr"])

        d["visualization_url"] = visualization_url(req)

        return d


    return run_ai("project_planning", prompt, None, PlanningReport, fb, post)


# =========================================================== 4. VALUATION

RATE_PER_SQFT = {1: 9000, 2: 5500, 3: 3200}

TYPE_FACTOR = {"Apartment": 1.0, "House": 1.1, "Villa": 1.35, "Commercial": 1.5}

YIELD_PCT = {1: 3.0, 2: 3.3, 3: 3.8}

APPRECIATION_PCT = {1: 6.0, 2: 5.0, 3: 4.0}


def finalize_valuation(d: dict, req: ValuationRequest) -> dict:

    """Recompute derived numbers so the output is always internally consistent."""

    est = d["estimated_value_inr"]

    if est <= 0 and d["value_low_inr"] > 0 and d["value_high_inr"] > 0:

        est = (d["value_low_inr"] + d["value_high_inr"]) / 2

    if est <= 0:

        raise ValueError("no valuation returned")

    low = d["value_low_inr"] or est * 0.9

    high = d["value_high_inr"] or est * 1.1

    low, high = min(low, est), max(high, est)

    per_sqft = est / req.area_sqft

    if not 500 <= per_sqft <= 150000:

        raise ValueError(f"implausible price of Rs {per_sqft:.0f}/sqft")

    rent = max(0.0, d["monthly_rent_inr"])

    appreciation = max(-20.0, min(30.0, d["annual_appreciation_pct"]))

    yield_pct = rent * 12 / est * 100

    d.update(

        estimated_value_inr=round(est),

        value_low_inr=round(low),

        value_high_inr=round(high),

        price_per_sqft_inr=round(per_sqft),

        monthly_rent_inr=round(rent),

        rental_yield_pct=round(yield_pct, 2),

        annual_appreciation_pct=round(appreciation, 2),

        five_year_roi_pct=round(((1 + appreciation / 100) ** 5 - 1) * 100 + yield_pct * 5, 1),

        estimated_value_label=inr_label(est),

        value_range_label=f"{inr_label(low)} - {inr_label(high)}",

    )

    return d


def valuation_fallback(req: ValuationRequest) -> dict:

    tier = city_tier(req.location)

    age_factor = max(0.5, 1 - min(req.building_age_years, 50) * 0.01)

    amenity_factor = 1 + min(len(req.amenities), 8) * 0.015

    est = req.area_sqft * RATE_PER_SQFT[tier] * TYPE_FACTOR[req.property_type] * age_factor * amenity_factor

    d = ValuationReport(

        estimated_value_inr=est,

        value_low_inr=est * 0.9,

        value_high_inr=est * 1.1,

        monthly_rent_inr=est * YIELD_PCT[tier] / 100 / 12,

        annual_appreciation_pct=APPRECIATION_PCT[tier],

        key_factors=[f"Location treated as Tier {tier}", f"Building age {req.building_age_years:g} years", f"{len(req.amenities)} amenities", f"Property type: {req.property_type}"],

        outlook="Indicative estimate from standard rate assumptions; get a registered valuer's report for transactions.",

        assumptions=[

            "Base rate/sq ft: Tier1 9000, Tier2 5500, Tier3 3200 (INR).",

            "Type factor: Apartment 1.0, House 1.1, Villa 1.35, Commercial 1.5. Age reduces value 1% per year (max 50%). Each amenity adds 1.5% (max 8).",

        ],

    ).model_dump()

    return finalize_valuation(d, req)


VALUATION_PROMPT = """Task: estimate the indicative market value of an Indian property using contextual reasoning about the micro-market.

Inputs: location {loc}; area {area} sq ft; type {ptype}; building age {age} years; amenities: {amen}.

Return JSON with exactly these keys (all money in INR as plain numbers):

{{"estimated_value_inr": number, "value_low_inr": number, "value_high_inr": number,

 "monthly_rent_inr": number, "annual_appreciation_pct": number,

 "key_factors": [str], "outlook": str, "assumptions": [str]}}

value_low_inr <= estimated_value_inr <= value_high_inr. Be realistic for the stated location."""


@app.post("/api/valuation", response_model=ValuationReport)

def valuation(req: ValuationRequest):

    prompt = VALUATION_PROMPT.format(loc=req.location, area=req.area_sqft, ptype=req.property_type, age=req.building_age_years, amen=", ".join(req.amenities) or "none")

    return run_ai("real_estate_valuation", prompt, None, ValuationReport, lambda: valuation_fallback(req), lambda d: finalize_valuation(d, req))


# =========================================================== 5. DAILY SITE ASSISTANT

MATERIAL_HINTS = [

    (("concrete", "slab", "pour", "footing", "column"), ["Cement, sand and aggregate", "Concrete mixer / transit mixer", "Needle vibrator", "Curing sheets / water"]),

    (("brick", "masonry", "block"), ["Bricks / blocks", "Mortar mix", "Trowels, plumb line and spirit level"]),

    (("plaster",), ["Plaster mix", "Straight edges and floats"]),

    (("steel", "rebar", "reinforcement"), ["Rebar", "Binding wire", "Bar cutter and bender"]),

    (("excavat", "trench", "earthwork"), ["Excavator / JCB", "Barricades and warning tape", "Dewatering pump"]),

    (("scaffold", "height", "roof", "shuttering", "formwork"), ["Inspected scaffolding", "Safety harnesses and lifelines", "Shuttering material"]),

    (("electric", "wiring"), ["Cables and conduits", "Insulated tools", "Lockout / tagout kit"]),

    (("paint",), ["Paint, primer and putty", "Brushes, rollers and ladders"]),

]


def daily_fallback(req: DailyRequest) -> dict:

    text = (req.activities + " " + req.site_conditions).lower()

    parts = [p.strip(" .-*\t") for p in re.split(r"[\n;,]+|\band\b", req.activities, flags=re.IGNORECASE) if p.strip(" .-*\t")][:8] or [req.activities.strip()]

    crew = max(1, req.workforce // len(parts))

    tasks = [DailyTask(task=p[:120][:1].upper() + p[:120][1:], crew=f"{crew} workers", priority="High" if i == 0 else "Medium") for i, p in enumerate(parts)]


    materials: List[str] = []

    for keys, items in MATERIAL_HINTS:

        if any(k in text for k in keys):

            materials += [i for i in items if i not in materials]

    materials += ["Hand tools and measuring tapes", "First-aid kit"]


    precautions = ["Hold a 10-minute toolbox talk before starting.", "Check PPE (helmet, vest, boots) for every worker.", "Keep access paths clear of debris.", "Inspect tools and equipment before use."]

    risks: List[RiskAlert] = []

    if any(k in text for k in ("height", "roof", "scaffold", "formwork", "shuttering")):

        risks.append(RiskAlert(risk="Fall from height", severity="High"))

        precautions.append("Use harnesses anchored to rated points above 1.8 m.")

    if any(k in text for k in ("excavat", "trench")):

        risks.append(RiskAlert(risk="Trench collapse or vehicle movement", severity="High"))

        precautions.append("Shore or slope excavation walls and keep spoil away from edges.")

    if any(k in text for k in ("rain", "wet", "slippery")):

        risks.append(RiskAlert(risk="Slips and electrical hazards in wet conditions", severity="Medium"))

    if any(k in text for k in ("heat", "hot", "summer")):

        risks.append(RiskAlert(risk="Heat stress", severity="Medium"))

        precautions.append("Provide water and shaded rest breaks every hour.")

    if any(k in text for k in ("wind", "storm")):

        risks.append(RiskAlert(risk="Wind-blown materials and unstable loads", severity="High"))

    if not risks:

        risks.append(RiskAlert(risk="General site hazards (housekeeping, material handling)", severity="Low"))

    return DailyReport(

        tasks=tasks,

        materials_equipment=materials,

        safety_precautions=precautions,

        risk_alerts=risks,

        summary=f"Rule-based plan for {req.workforce} workers across {len(tasks)} task(s).",

    ).model_dump()


DAILY_PROMPT = """Task: turn today's high-level site inputs into an actionable daily plan.

Activities planned: {acts}

Workforce available: {crew} workers

Site conditions: {cond}

Return JSON with exactly these keys:

{{"tasks": [{{"task": str, "crew": str, "priority": "Low"|"Medium"|"High"}}],

 "materials_equipment": [str],

 "safety_precautions": [str],

 "risk_alerts": [{{"risk": str, "severity": "Low"|"Medium"|"High"|"Critical"}}],

 "summary": str}}

Allocate the workforce across tasks sensibly and keep every item short and on-site readable."""


@app.post("/api/daily-plan", response_model=DailyReport)

def daily_plan(req: DailyRequest):

    prompt = DAILY_PROMPT.format(acts=req.activities, crew=req.workforce, cond=req.site_conditions or "not specified")

    return run_ai("daily_site_assistant", prompt, None, DailyReport, lambda: daily_fallback(req), None)


# =========================================================== 6. WEATHER ADVISORY (GO / NO-GO)

def weather_fallback(req: WeatherRequest) -> dict:

    a, c = req.activity.lower(), req.condition

    height = any(k in a for k in ("crane", "lift", "hoist", "scaffold", "height", "roof", "erect", "formwork", "shuttering"))

    wet_sensitive = any(k in a for k in ("concrete", "pour", "plaster", "excavat", "earthwork", "electric", "paint", "waterproof", "roof", "screed"))

    heat_sensitive = any(k in a for k in ("concrete", "pour", "roof", "bitumen", "asphalt", "weld"))

    indoor = any(k in a for k in ("indoor", "interior", "basement"))

    transport = any(k in a for k in ("crane", "lift", "excavat", "truck", "transport", "vehicle", "dumper"))


    decision, level, risks, prec, why = "GO", "Low", [], ["Proceed with the normal toolbox talk.", "Keep drinking water available."], "Conditions are suitable."

    if c == "High Wind":

        risks = ["Falling or wind-blown materials", "Loss of control of suspended loads"]

        prec = ["Secure scaffold sheets and loose materials.", "Stop crane and hoist work above 40 km/h wind."]

        decision, level, why = ("NO-GO", "High", "High wind makes lifting and work at height unsafe.") if height else ("GO", "Medium", "Work can continue with materials secured.")

    elif c == "Heavy Rain":

        risks = ["Slips and falls", "Washed-out concrete and trench collapse", "Electrical shock in wet areas"]

        prec = ["Cover fresh concrete and stored cement.", "De-energise temporary electrical panels in wet zones.", "Check excavation sides for collapse."]

        decision, level, why = ("NO-GO", "High", "Heavy rain damages the work and raises accident risk for this activity.") if (wet_sensitive or height) and not indoor else ("GO", "Medium", "Indoor or low-sensitivity work can continue with care.")

    elif c == "Thunderstorm":

        risks = ["Lightning strike", "Sudden wind gusts", "Flooding"]

        prec = ["Move workers to shelter away from cranes and metal structures.", "Resume only 30 minutes after the last thunder."]

        decision, level, why = ("GO", "Medium", "Indoor work may continue under shelter.") if indoor else ("NO-GO", "Critical", "Lightning makes outdoor work unsafe.")

    elif c == "Extreme Heat":

        risks = ["Heat stress and dehydration", "Rapid drying and cracking of fresh concrete"]

        prec = ["Shift heavy work to early morning.", "Give shaded breaks and water every hour.", "Wet-cure concrete more often."]

        decision, level, why = ("NO-GO", "High", "Hot bitumen / roofing work is unsafe in extreme heat.") if any(k in a for k in ("roof", "bitumen", "asphalt")) else ("GO", "Medium", "Work can proceed with strict heat precautions." if heat_sensitive else "Work can proceed with heat precautions.")

    elif c == "Dense Fog":

        risks = ["Poor visibility for vehicles and cranes", "Missed hazards on site"]

        prec = ["Use lights and spotters for vehicle movement.", "Restrict crane signalling work to clear visibility."]

        decision, level, why = ("NO-GO", "High", "Low visibility is unsafe for machinery and transport.") if transport else ("GO", "Medium", "Ground work can continue with extra lighting.")

    return WeatherAdvisory(decision=decision, risk_level=level, risks=risks, precautions=prec, rationale=why).model_dump()


WEATHER_PROMPT = """Task: give a GO / NO-GO decision for a weather-sensitive construction activity using contextual reasoning.

Planned activity: {act}

Weather condition: {cond}

Return JSON with exactly these keys:

{{"decision": "GO" | "NO-GO",

 "risk_level": "Low"|"Medium"|"High"|"Critical",

 "risks": [str],

 "precautions": [str],

 "rationale": str}}

Be decision-oriented: if the activity is unsafe or will be damaged in this weather, say NO-GO and explain briefly."""


@app.post("/api/weather-advisory", response_model=WeatherAdvisory)

def weather_advisory(req: WeatherRequest):

    prompt = WEATHER_PROMPT.format(act=req.activity, cond=req.condition)

    return run_ai("weather_advisory", prompt, None, WeatherAdvisory, lambda: weather_fallback(req), None)


# =========================================================== 7. CHATBOT

CHAT_FALLBACK = {

    ("curing", "cure"): "Keep concrete moist for at least 7 days (10+ for blended cements) and shade it from direct sun and wind.",

    ("crack",): "Hairline cracks under 0.3 mm are usually cosmetic; wider or growing cracks need an engineer's inspection.",

    ("ppe", "helmet", "harness"): "Minimum PPE: helmet, high-vis vest and safety boots; add a harness for work above 1.8 m.",

    ("cement", "bags"): "A rough guide is 0.4 bags of cement per sq ft of built-up area for RCC residential work.",

    ("steel", "rebar"): "Typical RCC residential work uses about 3.5-4 kg of steel per sq ft of built-up area.",

    ("scaffold",): "Inspect scaffolding before every shift, check base plates, bracing and guardrails, and tag it as safe to use.",

    ("monsoon", "rain"): "Cover fresh concrete and cement, check trench sides after rain and de-energise wet electrical panels.",

    ("foundation",): "Foundation type depends on soil bearing capacity; get a soil test and a structural engineer's design.",

}


def chat_fallback(message: str) -> str:

    text = message.lower()

    for keys, answer in CHAT_FALLBACK.items():

        if any(k in text for k in keys):

            return answer

    if len(text.split()) < 3:

        return "Could you add a few more details? For example the activity, material or problem you are dealing with."

    return "Demo mode: I can answer about curing, cracks, PPE, cement and steel quantity, scaffolding, monsoon work and foundations."


CHAT_PROMPT = """Task: answer a construction question concisely (max 120 words) with practical, actionable guidance for Indian sites.

If the question is ambiguous or incomplete, ask ONE short clarifying question in the reply instead of guessing.

Return JSON exactly: {{"reply": str}}

Conversation so far:

{ctx}

user: {msg}"""


@app.post("/api/chat", response_model=ChatReply)

def chat(req: ChatRequest):

    try:
        client = _get_client()
    except Exception:
        client = None

    if client is not None:

        try:

            ctx = "\n".join(f"{m.get('role', 'user')}: {m.get('content', '')}" for m in req.history[-6:])

            data = ChatReply(**_generate_json(client, CHAT_PROMPT.format(ctx=ctx, msg=req.message), "construction_chatbot"))

            return data

        except Exception:

            pass

    return ChatReply(reply=chat_fallback(req.message), mode="demo")


# =========================================================== health

@app.get("/api/health")

def health():

    return {"status": "ok", "ai_mode": "live" if os.getenv("GEMINI_API_KEY") else "demo"}
