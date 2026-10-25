"""Automated test suite for Multimodal Construction Intelligence Platform backend.

Tests cover:
- Endpoint health and mode detection
- All 7 API features (Safety, Cracks, Planning, Valuation, Daily Plan, Weather, Chat)
- Input validation (missing fields, out-of-range values, invalid enum choices)
- File upload constraints (supported MIME types, empty files, corrupt data, dimensions, size limits)
- Rule-based demo fallback calculations and mathematical consistency
- Mocked live Gemini AI integration (happy path and resilient fallback on AI error)
- Lenient schema helpers and data coercion
"""

import io
import os
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from PIL import Image

# Import FastAPI app and helpers directly from main
from main import (
    app,
    city_tier,
    inr_label,
    _coerce_enum,
    _num,
    _obj_list,
    _score,
)

client = TestClient(app)


# =========================================================== Test Fixtures & Helpers

def create_test_image(width: int = 100, height: int = 100, fmt: str = "JPEG") -> bytes:
    """Generate in-memory image bytes for testing upload validation."""
    buf = io.BytesIO()
    img = Image.new("RGB", (width, height), color=(200, 100, 50))
    img.save(buf, format=fmt)
    return buf.getvalue()


@pytest.fixture(autouse=True)
def ensure_clean_env():
    """Ensure tests run in demo mode by default unless explicitly mocked."""
    old_key = os.environ.get("GEMINI_API_KEY")
    if "GEMINI_API_KEY" in os.environ:
        del os.environ["GEMINI_API_KEY"]
    yield
    if old_key is not None:
        os.environ["GEMINI_API_KEY"] = old_key


# =========================================================== 1. Health Endpoint

def test_health_demo_mode():
    """Health endpoint reports demo mode when GEMINI_API_KEY is unset."""
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["ai_mode"] == "demo"


def test_health_live_mode():
    """Health endpoint reports live mode when GEMINI_API_KEY is configured."""
    with patch.dict(os.environ, {"GEMINI_API_KEY": "fake_test_key"}):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["ai_mode"] == "live"


# =========================================================== 2. Safety Analysis (/api/safety)

def test_safety_demo_mode_text_only():
    """POST /api/safety with text description only returns structured demo report."""
    resp = client.post("/api/safety", data={"description": "Workers on scaffolding without visible safety harness."})
    assert resp.status_code == 200
    data = resp.json()
    assert data["mode"] == "demo"
    assert "warning" in data
    assert 0 <= data["safety_score"] <= 100
    assert data["overall_status"] in ["Safe", "Needs Attention", "Unsafe"]
    assert "ppe" in data
    assert "helmet" in data["ppe"]
    assert "safety_harness" in data["ppe"]
    assert isinstance(data["hazards"], list)
    assert len(data["hazards"]) > 0
    assert "recommended_ppe" in data
    assert "summary" in data


def test_safety_demo_mode_with_image():
    """POST /api/safety with valid JPEG image returns structured demo report."""
    img_bytes = create_test_image(120, 120, "JPEG")
    files = {"image": ("site.jpg", img_bytes, "image/jpeg")}
    resp = client.post("/api/safety", files=files, data={"description": "Active slab casting"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["mode"] == "demo"
    assert len(data["hazards"]) > 0


def test_safety_missing_both_image_and_description():
    """POST /api/safety without image and without text returns 422 Unprocessable Entity."""
    resp = client.post("/api/safety", data={"description": "   "})
    assert resp.status_code == 422
    assert "Provide a site image or a text description" in resp.json()["detail"]


def test_safety_unsupported_file_type():
    """POST /api/safety with unsupported MIME type (e.g. text/plain) returns 415."""
    files = {"image": ("notes.txt", b"worker list", "text/plain")}
    resp = client.post("/api/safety", files=files, data={"description": "test"})
    assert resp.status_code == 415
    assert "Unsupported file type" in resp.json()["detail"]


def test_safety_empty_image_file():
    """POST /api/safety with an empty file (0 bytes) returns 422."""
    files = {"image": ("empty.jpg", b"", "image/jpeg")}
    resp = client.post("/api/safety", files=files, data={"description": "test"})
    assert resp.status_code == 422
    assert "empty" in resp.json()["detail"].lower()


def test_safety_corrupt_image_file():
    """POST /api/safety with corrupted image bytes returns 422."""
    files = {"image": ("corrupt.jpg", b"not-a-real-jpeg-header", "image/jpeg")}
    resp = client.post("/api/safety", files=files, data={"description": "test"})
    assert resp.status_code == 422
    assert "corrupt or incomplete" in resp.json()["detail"]


def test_safety_tiny_image_rejected():
    """POST /api/safety with image smaller than 64x64 px returns 422."""
    tiny_bytes = create_test_image(32, 32, "PNG")
    files = {"image": ("tiny.png", tiny_bytes, "image/png")}
    resp = client.post("/api/safety", files=files, data={"description": "test"})
    assert resp.status_code == 422
    assert "minimum 64x64" in resp.json()["detail"]


def test_safety_mocked_live_ai_success():
    """POST /api/safety with valid GEMINI_API_KEY and mocked successful AI response."""
    mock_ai_output = {
        "safety_score": 85,
        "overall_status": "Safe",
        "ppe": {
            "helmet": "Compliant",
            "high_vis_vest": "Compliant",
            "safety_boots": "Compliant",
            "safety_harness": "Not visible",
        },
        "hazards": [
            {"name": "Tripping wire", "severity": "Low", "remedy": "Tape wire down"}
        ],
        "recommended_ppe": ["Gloves"],
        "safety_guidelines": ["Maintain clean paths"],
        "environmental_risks": [],
        "summary": "High compliance observed on site.",
    }
    with patch.dict(os.environ, {"GEMINI_API_KEY": "fake_test_key"}), \
         patch("main._generate_json", return_value=mock_ai_output):
        resp = client.post("/api/safety", data={"description": "Site audit check"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["mode"] == "live"
        assert data["safety_score"] == 85
        assert data["overall_status"] == "Safe"
        assert data["hazards"][0]["name"] == "Tripping wire"


def test_safety_mocked_ai_failure_falls_back():
    """POST /api/safety when AI call raises an exception falls back to demo mode."""
    with patch.dict(os.environ, {"GEMINI_API_KEY": "fake_test_key"}), \
         patch("main._generate_json", side_effect=RuntimeError("Google 503 Service Unavailable")):
        resp = client.post("/api/safety", data={"description": "Site audit check"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["mode"] == "demo"
        assert "AI unavailable" in data["warning"]
        assert data["safety_score"] == 62  # Demo fallback score


# =========================================================== 3. Crack Diagnostics (/api/cracks)

def test_cracks_demo_mode_text_only():
    """POST /api/cracks with description returns demo crack diagnostic report."""
    resp = client.post("/api/cracks", data={"description": "Diagonal stair-step crack across brick wall near window."})
    assert resp.status_code == 200
    data = resp.json()
    assert data["mode"] == "demo"
    assert data["crack_type"] == "Settlement"
    assert data["estimated_width_mm"] == 3.5
    assert data["severity"] in ["Low", "Medium", "High", "Critical"]
    assert "Monitor" in data["urgency"] or "Repair" in data["urgency"]
    assert len(data["probable_causes"]) > 0
    assert len(data["corrective_actions"]) > 0


def test_cracks_missing_both_image_and_description():
    """POST /api/cracks without image and text returns 422."""
    resp = client.post("/api/cracks", data={"description": ""})
    assert resp.status_code == 422
    assert "Provide a wall/concrete image or a text description" in resp.json()["detail"]


def test_cracks_mocked_live_ai_success():
    """POST /api/cracks with mocked AI response normalizes width and severity."""
    mock_ai_output = {
        "crack_type": "Structural Shear",
        "estimated_width_mm": 5.4,
        "severity": "High",
        "urgency": "Immediate action",
        "probable_causes": ["Foundation shifting"],
        "potential_risks": ["Wall collapse"],
        "corrective_actions": ["Underpinning foundation"],
        "preventive_measures": ["Improve site drainage"],
        "summary": "Severe shear crack detected.",
    }
    with patch.dict(os.environ, {"GEMINI_API_KEY": "fake_test_key"}), \
         patch("main._generate_json", return_value=mock_ai_output):
        resp = client.post("/api/cracks", data={"description": "Large shear crack"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["mode"] == "live"
        assert data["crack_type"] == "Structural Shear"
        assert data["estimated_width_mm"] == 5.4
        assert data["severity"] == "High"


# =========================================================== 4. Project Planning (/api/planning)

def test_planning_demo_mode_valid_request():
    """POST /api/planning calculates thumb-rule costs, materials, schedule and visualization."""
    payload = {
        "plot_size_sqft": 1000,
        "construction_type": "Residential",
        "city": "Pune",
        "floors": 2,
    }
    resp = client.post("/api/planning", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["mode"] == "demo"
    assert data["built_up_sqft"] == 2000  # 1000 sq ft * 2 floors
    assert data["total_cost_inr"] > 0
    assert "Rs " in data["total_cost_label"]
    assert len(data["cost_breakdown"]) == 5
    # Material checks
    materials = data["materials"]
    assert materials["cement_bags"] == round(2000 * 0.4)
    assert materials["steel_kg"] == round(2000 * 4.0)
    assert materials["bricks_nos"] == round(2000 * 8)
    # Schedule checks
    assert len(data["schedule"]) == 4
    assert data["total_weeks"] > 0
    assert "image.pollinations.ai" in data["visualization_url"]


def test_planning_validation_invalid_plot_size():
    """POST /api/planning rejects zero or negative plot size with 422."""
    payload = {"plot_size_sqft": 0, "construction_type": "Residential", "city": "Pune", "floors": 1}
    resp = client.post("/api/planning", json=payload)
    assert resp.status_code == 422


def test_planning_validation_invalid_construction_type():
    """POST /api/planning rejects unknown construction type with 422."""
    payload = {"plot_size_sqft": 1000, "construction_type": "Agricultural", "city": "Pune", "floors": 1}
    resp = client.post("/api/planning", json=payload)
    assert resp.status_code == 422


def test_planning_validation_invalid_floors():
    """POST /api/planning rejects out-of-range floors (< 1 or > 50) with 422."""
    resp_zero = client.post("/api/planning", json={"plot_size_sqft": 1000, "construction_type": "Residential", "city": "Pune", "floors": 0})
    assert resp_zero.status_code == 422
    resp_high = client.post("/api/planning", json={"plot_size_sqft": 1000, "construction_type": "Residential", "city": "Pune", "floors": 51})
    assert resp_high.status_code == 422


def test_planning_tier_cost_scaling():
    """Planning fallback scales cost by city tier (Tier 1 > Tier 2 > Tier 3)."""
    base = {"plot_size_sqft": 1000, "construction_type": "Residential", "floors": 1}
    cost_t1 = client.post("/api/planning", json={**base, "city": "Mumbai"}).json()["total_cost_inr"]
    cost_t2 = client.post("/api/planning", json={**base, "city": "Pune"}).json()["total_cost_inr"]
    cost_t3 = client.post("/api/planning", json={**base, "city": "Deoghar"}).json()["total_cost_inr"]
    assert cost_t1 > cost_t2 > cost_t3


def test_planning_mocked_live_ai_recomputes_totals():
    """Planning post-processor recomputes total_cost_inr from cost items and validates per_sqft."""
    mock_ai_output = {
        "built_up_sqft": 1000,
        "total_cost_inr": 2000000,
        "cost_breakdown": [
            {"item": "Materials", "amount_inr": 1200000},
            {"item": "Labour", "amount_inr": 800000},
        ],
        "materials": {"cement_bags": 400, "sand_cft": 1200, "aggregate_cft": 1400, "steel_kg": 4000, "bricks_nos": 8000},
        "schedule": [{"name": "Structure", "weeks": 16, "description": "Core frame"}],
        "total_weeks": 16,
        "assumptions": ["Standard soil"],
        "summary": "AI plan generated",
    }
    with patch.dict(os.environ, {"GEMINI_API_KEY": "fake_test_key"}), \
         patch("main._generate_json", return_value=mock_ai_output):
        resp = client.post("/api/planning", json={"plot_size_sqft": 1000, "construction_type": "Residential", "city": "Pune", "floors": 1})
        assert resp.status_code == 200
        data = resp.json()
        assert data["mode"] == "live"
        assert data["total_cost_inr"] == 2000000
        assert data["built_up_sqft"] == 1000


def test_planning_mocked_implausible_cost_triggers_fallback():
    """When AI returns implausible cost (< Rs 500/sqft), system falls back safely."""
    mock_ai_output = {
        "built_up_sqft": 1000,
        "total_cost_inr": 10000,  # Rs 10 / sq ft -> implausible
        "cost_breakdown": [{"item": "Total", "amount_inr": 10000}],
        "materials": {"cement_bags": 1, "sand_cft": 1, "aggregate_cft": 1, "steel_kg": 1, "bricks_nos": 1},
        "schedule": [{"name": "Work", "weeks": 2, "description": "Quick"}],
        "total_weeks": 2,
        "assumptions": [],
        "summary": "Cheap build",
    }
    with patch.dict(os.environ, {"GEMINI_API_KEY": "fake_test_key"}), \
         patch("main._generate_json", return_value=mock_ai_output):
        resp = client.post("/api/planning", json={"plot_size_sqft": 1000, "construction_type": "Residential", "city": "Pune", "floors": 1})
        assert resp.status_code == 200
        data = resp.json()
        assert data["mode"] == "demo"  # Fallback triggered by ValueError
        assert "implausible cost" in data["warning"]


# =========================================================== 5. Property Valuation (/api/valuation)

def test_valuation_demo_mode_math_consistency():
    """POST /api/valuation computes consistent values, yield, appreciation, and ROI."""
    payload = {
        "location": "Whitefield, Bengaluru",
        "area_sqft": 1200,
        "property_type": "Apartment",
        "building_age_years": 5,
        "amenities": ["Lift", "Parking", "Gym"],
    }
    resp = client.post("/api/valuation", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["mode"] == "demo"
    assert data["estimated_value_inr"] > 0
    assert data["value_low_inr"] <= data["estimated_value_inr"] <= data["value_high_inr"]
    # Recomputed price per sq ft check
    assert data["price_per_sqft_inr"] == round(data["estimated_value_inr"] / 1200)
    # Rental yield check
    expected_yield = round(data["monthly_rent_inr"] * 12 / data["estimated_value_inr"] * 100, 2)
    assert abs(data["rental_yield_pct"] - expected_yield) < 0.05
    assert "Rs " in data["estimated_value_label"]
    assert " - " in data["value_range_label"]


def test_valuation_validation_errors():
    """POST /api/valuation validates location, area bounds and age bounds."""
    # Empty location
    r1 = client.post("/api/valuation", json={"location": "", "area_sqft": 1000})
    assert r1.status_code == 422
    # Area <= 0
    r2 = client.post("/api/valuation", json={"location": "Pune", "area_sqft": 0})
    assert r2.status_code == 422
    # Building age > 100
    r3 = client.post("/api/valuation", json={"location": "Pune", "area_sqft": 1000, "building_age_years": 105})
    assert r3.status_code == 422


def test_valuation_mocked_live_ai_recalibration():
    """Valuation server finalize_valuation recalculates yield and ROI from AI raw values."""
    mock_ai_output = {
        "estimated_value_inr": 10000000,
        "value_low_inr": 9000000,
        "value_high_inr": 11000000,
        "monthly_rent_inr": 35000,
        "annual_appreciation_pct": 7.0,
        "key_factors": ["IT corridor proximity"],
        "outlook": "Strong capital appreciation expected",
        "assumptions": ["Ready to move"],
    }
    with patch.dict(os.environ, {"GEMINI_API_KEY": "fake_test_key"}), \
         patch("main._generate_json", return_value=mock_ai_output):
        resp = client.post("/api/valuation", json={"location": "Whitefield, Bengaluru", "area_sqft": 1000})
        assert resp.status_code == 200
        data = resp.json()
        assert data["mode"] == "live"
        assert data["estimated_value_inr"] == 10000000
        assert data["price_per_sqft_inr"] == 10000
        assert data["rental_yield_pct"] == 4.2  # 35,000 * 12 / 10,000,000 * 100 = 4.2%


# =========================================================== 6. Daily Site Plan (/api/daily-plan)

def test_daily_plan_demo_mode_valid_request():
    """POST /api/daily-plan breaks activities into tasks with crew allocations and risks."""
    payload = {
        "activities": "Column casting on 3rd floor, brick masonry along grid C, excavation for drainage",
        "workforce": 24,
        "site_conditions": "Sunny, 34C, light wind",
    }
    resp = client.post("/api/daily-plan", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["mode"] == "demo"
    assert len(data["tasks"]) >= 3
    # Crew assignment check
    for task in data["tasks"]:
        assert "workers" in task["crew"]
        assert task["priority"] in ["Low", "Medium", "High"]
    # Keyword-triggered materials
    mat_text = " ".join(data["materials_equipment"]).lower()
    assert "cement" in mat_text or "mortar" in mat_text or "excavator" in mat_text
    # Keyword-triggered risk alerts (height/excavation)
    risks = [r["risk"].lower() for r in data["risk_alerts"]]
    assert any("height" in r or "trench" in r or "collapse" in r for r in risks)


def test_daily_plan_validation_errors():
    """POST /api/daily-plan validates non-empty activities and positive workforce integer."""
    r1 = client.post("/api/daily-plan", json={"activities": "", "workforce": 10})
    assert r1.status_code == 422
    r2 = client.post("/api/daily-plan", json={"activities": "Excavation", "workforce": 0})
    assert r2.status_code == 422


# =========================================================== 7. Weather Advisory (/api/weather-advisory)

def test_weather_advisory_demo_mode_rules():
    """Weather advisory fallback returns correct GO / NO-GO decisions based on conditions."""
    # Heavy rain during concrete pour -> NO-GO
    r_rain = client.post("/api/weather-advisory", json={"activity": "Slab concrete pour", "condition": "Heavy Rain"}).json()
    assert r_rain["decision"] == "NO-GO"
    assert r_rain["risk_level"] in ["High", "Critical"]

    # Normal weather -> GO
    r_normal = client.post("/api/weather-advisory", json={"activity": "Interior painting", "condition": "Normal"}).json()
    assert r_normal["decision"] == "GO"
    assert r_normal["risk_level"] == "Low"

    # Thunderstorm for outdoor work -> NO-GO Critical
    r_storm = client.post("/api/weather-advisory", json={"activity": "Roof truss erection", "condition": "Thunderstorm"}).json()
    assert r_storm["decision"] == "NO-GO"
    assert r_storm["risk_level"] == "Critical"


def test_weather_advisory_validation_invalid_condition():
    """Weather advisory rejects conditions outside the allowed enum with 422."""
    resp = client.post("/api/weather-advisory", json={"activity": "Roofing", "condition": "Tornado"})
    assert resp.status_code == 422


# =========================================================== 8. Construction Chatbot (/api/chat)

def test_chat_demo_mode_keyword_answers():
    """Chatbot in demo mode answers construction-specific questions concisely."""
    resp_curing = client.post("/api/chat", json={"message": "What is the proper curing time for concrete?"})
    assert resp_curing.status_code == 200
    assert "7 days" in resp_curing.json()["reply"]

    resp_ppe = client.post("/api/chat", json={"message": "What PPE is required at height?"})
    assert resp_ppe.status_code == 200
    assert "harness" in resp_ppe.json()["reply"].lower()


def test_chat_demo_mode_vague_query_clarification():
    """Chatbot asks for clarification when message is under 3 words."""
    resp = client.post("/api/chat", json={"message": "help"})
    assert resp.status_code == 200
    assert "more details" in resp.json()["reply"].lower()


def test_chat_validation_empty_message():
    """Chatbot rejects empty message with 422."""
    resp = client.post("/api/chat", json={"message": ""})
    assert resp.status_code == 422


def test_chat_mocked_live_ai_success():
    """Chatbot returns live AI response when client succeeds."""
    with patch("main._get_client", return_value=MagicMock()), \
         patch("main._generate_json", return_value={"reply": "Cure PPC concrete for at least 10 days."}):
        resp = client.post("/api/chat", json={
            "message": "How long to cure PPC concrete?",
            "history": [{"role": "user", "content": "Hello"}, {"role": "assistant", "content": "Hi!"}]
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["mode"] == "live"
        assert "10 days" in data["reply"]


def test_chat_history_validation():
    """Chatbot validates history array bounds and individual content length."""
    # Oversized single message content (> 2500 chars)
    resp = client.post("/api/chat", json={
        "message": "test",
        "history": [{"role": "user", "content": "x" * 3000}]
    })
    assert resp.status_code == 422

    # Oversized history list (> 30 items)
    too_many = [{"role": "user", "content": "msg"} for _ in range(35)]
    resp2 = client.post("/api/chat", json={"message": "test", "history": too_many})
    assert resp2.status_code == 422


# =========================================================== 9. Shared Helpers & Math Validation

def test_inr_label_crores_and_lakhs():
    """inr_label formats crores (>= 1e7) and lakhs (< 1e7) correctly."""
    assert inr_label(15000000) == "Rs 1.50 Cr"
    assert inr_label(20000000) == "Rs 2.00 Cr"
    assert inr_label(5000000) == "Rs 50.00 Lakh"
    assert inr_label(450000) == "Rs 4.50 Lakh"


def test_city_tier_mapping():
    """city_tier maps known Tier 1 and Tier 3 cities, defaulting others to Tier 2."""
    assert city_tier("Bengaluru Urban") == 1
    assert city_tier("Mumbai") == 1
    assert city_tier("South Delhi") == 1
    assert city_tier("Deoghar") == 3
    assert city_tier("Dhanbad") == 3
    assert city_tier("Jaipur") == 2
    assert city_tier("Indore") == 2


def test_lenient_schema_helpers():
    """Lenient schema helper functions sanitize unexpected AI types safely."""
    # Enum coercion
    fn = _coerce_enum(["Safe", "Unsafe"], "Unsafe")
    assert fn("safe") == "Safe"
    assert fn("SAFE") == "Safe"
    assert fn("unknown") == "Unsafe"
    assert fn(123) == "Unsafe"

    # Number extraction from text
    assert _num("1,250.50") == 1250.5
    assert _num("approx Rs 500") == 500.0
    assert _num(None) == 0.0

    # Score clamping
    assert _score(120) == 100
    assert _score(-10) == 0
    assert _score("75") == 75

    # Object list junk filter
    assert _obj_list([{"name": "hazard"}, "junk string", 123]) == [{"name": "hazard"}]
    assert _obj_list("not a list") == []
