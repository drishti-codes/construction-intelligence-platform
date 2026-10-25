import io
import json
import os
import sys

import pytest
from fastapi.testclient import TestClient
from PIL import Image

os.environ.pop("GEMINI_API_KEY", None)
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import main  # noqa: E402

client = TestClient(main.app)


def png_bytes(size=(200, 200)):
    buf = io.BytesIO()
    Image.new("RGB", size, (120, 120, 120)).save(buf, format="PNG")
    return buf.getvalue()


# ------------------------------------------------------------ fake Gemini client
class _Resp:
    def __init__(self, text):
        self.text = text


class _FakeModels:
    def __init__(self, behaviours):
        self.behaviours = list(behaviours)
        self.calls = []
        self.configs = []
        self.contents = []

    def generate_content(self, model, contents, config):
        self.calls.append(model)
        self.configs.append(config)
        self.contents.append(contents)
        b = self.behaviours.pop(0) if len(self.behaviours) > 1 else self.behaviours[0]
        if isinstance(b, Exception):
            raise b
        return _Resp(b if isinstance(b, str) else json.dumps(b))


class _FakeClient:
    def __init__(self, *behaviours):
        self.models = _FakeModels(behaviours)


@pytest.fixture
def live(monkeypatch):
    """Install a fake live AI client that returns whatever the test passes in."""
    monkeypatch.setattr(main.time, "sleep", lambda s: None)

    def install(*behaviours):
        c = _FakeClient(*behaviours)
        monkeypatch.setattr(main, "_get_client", lambda: c)
        return c

    return install


# ------------------------------------------------------------ health + no-key demo mode
def test_health_demo_mode():
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["ai_mode"] == "demo"


def test_safety_demo_has_all_fields():
    r = client.post("/api/safety", files={"image": ("a.png", png_bytes(), "image/png")}, data={"description": "scaffold work"})
    b = r.json()
    assert r.status_code == 200 and b["mode"] == "demo"
    assert 0 <= b["safety_score"] <= 100
    assert set(b["ppe"]) == {"helmet", "high_vis_vest", "safety_boots", "safety_harness"}
    assert b["recommended_ppe"] and b["safety_guidelines"] and b["environmental_risks"]


def test_crack_demo_has_all_fields():
    b = client.post("/api/cracks", files={"image": ("a.png", png_bytes(), "image/png")}).json()
    assert b["potential_risks"] and b["preventive_measures"] and b["corrective_actions"] and b["probable_causes"]


def test_planning_demo():
    r = client.post("/api/planning", json={"plot_size_sqft": 1000, "construction_type": "Residential", "city": "Jaipur", "floors": 2})
    b = r.json()
    assert r.status_code == 200 and b["mode"] == "demo"
    assert b["built_up_sqft"] == 2000
    assert b["total_cost_inr"] == 3_600_000  # 2000 * 1800 * 1.0
    assert abs(sum(i["amount_inr"] for i in b["cost_breakdown"]) - b["total_cost_inr"]) <= 5
    assert b["materials"]["aggregate_cft"] > 0 and b["materials"]["cement_bags"] == 800
    assert len(b["schedule"]) == 4 and b["visualization_url"].startswith("https://")


def test_planning_city_tier_changes_cost():
    base = {"plot_size_sqft": 1000, "construction_type": "Residential", "floors": 1}
    t1 = client.post("/api/planning", json={**base, "city": "Mumbai"}).json()["total_cost_inr"]
    t2 = client.post("/api/planning", json={**base, "city": "Jaipur"}).json()["total_cost_inr"]
    assert t1 > t2


def test_valuation_demo_consistent():
    r = client.post("/api/valuation", json={"location": "Bengaluru", "area_sqft": 1200, "property_type": "Apartment", "building_age_years": 5, "amenities": ["Lift", "Parking"]})
    b = r.json()
    assert r.status_code == 200 and b["mode"] == "demo"
    assert b["value_low_inr"] <= b["estimated_value_inr"] <= b["value_high_inr"]
    assert b["price_per_sqft_inr"] == round(b["estimated_value_inr"] / 1200)
    assert b["monthly_rent_inr"] > 0 and b["five_year_roi_pct"] > 0
    assert "Cr" in b["estimated_value_label"] or "Lakh" in b["estimated_value_label"]


def test_valuation_age_and_amenities_matter():
    base = {"location": "Pune", "area_sqft": 1000, "property_type": "Apartment"}
    new = client.post("/api/valuation", json={**base, "building_age_years": 0, "amenities": ["Lift", "Gym"]}).json()["estimated_value_inr"]
    old = client.post("/api/valuation", json={**base, "building_age_years": 30, "amenities": []}).json()["estimated_value_inr"]
    assert new > old


def test_daily_plan_demo():
    r = client.post("/api/daily-plan", json={"activities": "Slab concreting, brick masonry on 2nd floor", "workforce": 20, "site_conditions": "hot day, light wind"})
    b = r.json()
    assert r.status_code == 200 and b["mode"] == "demo"
    assert len(b["tasks"]) == 2 and b["tasks"][0]["crew"] == "10 workers"
    assert b["materials_equipment"] and b["safety_precautions"] and b["risk_alerts"]


@pytest.mark.parametrize("activity,condition,decision", [
    ("Crane lifting of steel beams", "High Wind", "NO-GO"),
    ("Brick masonry on ground floor", "High Wind", "GO"),
    ("Slab concrete pour", "Heavy Rain", "NO-GO"),
    ("Interior tile fixing", "Heavy Rain", "GO"),
    ("Excavation work", "Thunderstorm", "NO-GO"),
    ("Interior painting", "Thunderstorm", "GO"),
    ("Bitumen roofing", "Extreme Heat", "NO-GO"),
    ("Slab concrete pour", "Extreme Heat", "GO"),
    ("Excavator earthwork", "Dense Fog", "NO-GO"),
    ("Anything", "Normal", "GO"),
])
def test_weather_go_no_go_rules(activity, condition, decision):
    b = client.post("/api/weather-advisory", json={"activity": activity, "condition": condition}).json()
    assert b["decision"] == decision
    assert b["rationale"]


def test_chat_demo_and_clarification():
    assert "PPE" in client.post("/api/chat", json={"message": "what ppe is needed?"}).json()["reply"]
    assert "details" in client.post("/api/chat", json={"message": "help"}).json()["reply"]


# ------------------------------------------------------------ input validation / edge cases
def test_safety_requires_input():
    assert client.post("/api/safety", data={"description": "  "}).status_code == 422


def test_safety_text_only_ok():
    assert client.post("/api/safety", data={"description": "no helmets seen"}).status_code == 200


def test_rejects_wrong_file_type():
    assert client.post("/api/safety", files={"image": ("a.txt", b"hello", "text/plain")}).status_code == 415


def test_rejects_truncated_image():
    assert client.post("/api/cracks", files={"image": ("a.png", png_bytes()[:50], "image/png")}).status_code == 422


def test_rejects_tiny_image():
    assert client.post("/api/cracks", files={"image": ("a.png", png_bytes((10, 10)), "image/png")}).status_code == 422


def test_rejects_empty_file():
    assert client.post("/api/cracks", files={"image": ("a.png", b"", "image/png")}).status_code == 422


@pytest.mark.parametrize("path,payload", [
    ("/api/planning", {"plot_size_sqft": -5, "construction_type": "Residential", "city": "X"}),
    ("/api/planning", {"plot_size_sqft": 100, "construction_type": "Castle", "city": "X"}),
    ("/api/planning", {"plot_size_sqft": 100, "construction_type": "Residential", "city": ""}),
    ("/api/planning", {}),
    ("/api/valuation", {"location": "Pune", "area_sqft": 0}),
    ("/api/valuation", {"location": "", "area_sqft": 100}),
    ("/api/valuation", {"location": "Pune", "area_sqft": 100, "building_age_years": 500}),
    ("/api/daily-plan", {"activities": "", "workforce": 5}),
    ("/api/daily-plan", {"activities": "x", "workforce": 0}),
    ("/api/weather-advisory", {"activity": "x", "condition": "Snow"}),
    ("/api/weather-advisory", {"activity": "", "condition": "Normal"}),
    ("/api/chat", {"message": ""}),
])
def test_bad_input_rejected(path, payload):
    assert client.post(path, json=payload).status_code == 422


# ------------------------------------------------------------ live AI path (fake client)
def test_system_prompt_and_feature_id_sent(live):
    c = live({"summary": "ok", "hazards": []})
    client.post("/api/safety", data={"description": "workers on scaffold"})
    assert c.models.contents[0][0].startswith("FEATURE: safety_analysis")
    assert c.models.configs[0].system_instruction == main.SYSTEM_PROMPT
    assert "construction" in main.SYSTEM_PROMPT.lower()


def test_each_feature_sends_its_own_identifier(live):
    c = live({"anything": 1})  # invalid for every schema -> falls back, but we only check identifiers
    client.post("/api/cracks", data={"description": "diagonal crack"})
    client.post("/api/planning", json={"plot_size_sqft": 500, "construction_type": "Residential", "city": "Pune"})
    client.post("/api/valuation", json={"location": "Pune", "area_sqft": 500})
    client.post("/api/daily-plan", json={"activities": "slab", "workforce": 4})
    client.post("/api/weather-advisory", json={"activity": "pour", "condition": "Normal"})
    client.post("/api/chat", json={"message": "how long to cure concrete?"})
    ids = [x[0].split("\n")[0] for x in c.models.contents]
    assert ids == [
        "FEATURE: crack_analysis", "FEATURE: project_planning", "FEATURE: real_estate_valuation",
        "FEATURE: daily_site_assistant", "FEATURE: weather_advisory", "FEATURE: construction_chatbot",
    ]


def test_partial_ai_output_gets_safe_defaults(live):
    live({"safety_score": "85/100", "hazards": [{"name": "Open edge"}, "junk"], "ppe": {"helmet": "compliant"}, "summary": "Mostly fine"})
    b = client.post("/api/safety", data={"description": "x"}).json()
    assert b["mode"] == "live" and b["safety_score"] == 85
    assert b["hazards"] == [{"name": "Open edge", "severity": "Medium", "remedy": ""}]
    assert b["ppe"]["helmet"] == "Compliant" and b["ppe"]["safety_harness"] == "Not visible"
    assert b["recommended_ppe"] == [] and b["safety_guidelines"] == []


def test_wrong_types_from_ai_do_not_crash(live):
    live({"crack_type": "WEIRD", "estimated_width_mm": "about 2.5 mm", "severity": None, "probable_causes": "settlement", "summary": "x"})
    b = client.post("/api/cracks", data={"description": "x"}).json()
    assert b["mode"] == "live" and b["estimated_width_mm"] == 2.5
    assert b["probable_causes"] == ["settlement"] and b["severity"] == "Medium" and b["crack_type"] == "Hairline"


def test_empty_ai_object_falls_back_to_demo(live):
    live({})
    b = client.post("/api/cracks", data={"description": "x"}).json()
    assert b["mode"] == "demo" and "AI unavailable" in b["warning"]


def test_non_json_ai_output_falls_back(live):
    live("this is not json")
    assert client.post("/api/safety", data={"description": "x"}).json()["mode"] == "demo"


def test_planning_live_numbers_are_normalised(live):
    live({"total_cost_inr": 1, "cost_breakdown": [{"item": "Materials", "amount_inr": 1_800_000}, {"item": "Labour", "amount_inr": 900_000}],
          "materials": {"cement_bags": "400", "aggregate_cft": 1400}, "schedule": [{"name": "Foundation", "weeks": 4}, {"name": "Structure", "weeks": 8}],
          "summary": "plan"})
    b = client.post("/api/planning", json={"plot_size_sqft": 1000, "construction_type": "Residential", "city": "Pune", "floors": 1}).json()
    assert b["mode"] == "live"
    assert b["total_cost_inr"] == 2_700_000  # recomputed from breakdown, not the AI's wrong total
    assert b["total_weeks"] == 12 and b["materials"]["cement_bags"] == 400
    assert b["total_cost_label"] == "Rs 27.00 Lakh" and b["visualization_url"].startswith("https://")


def test_planning_implausible_cost_falls_back(live):
    live({"cost_breakdown": [{"item": "x", "amount_inr": 5000}], "schedule": [{"name": "a", "weeks": 1}]})
    b = client.post("/api/planning", json={"plot_size_sqft": 1000, "construction_type": "Residential", "city": "Pune"}).json()
    assert b["mode"] == "demo" and "implausible" in b["warning"]


def test_valuation_live_derived_values_recomputed(live):
    live({"estimated_value_inr": 6_000_000, "value_low_inr": 5_500_000, "value_high_inr": 6_600_000, "monthly_rent_inr": 20000,
          "annual_appreciation_pct": 5, "price_per_sqft_inr": 999999, "rental_yield_pct": 99, "key_factors": ["metro nearby"], "outlook": "good"})
    b = client.post("/api/valuation", json={"location": "Pune", "area_sqft": 1000}).json()
    assert b["mode"] == "live"
    assert b["price_per_sqft_inr"] == 6000 and b["rental_yield_pct"] == 4.0
    assert b["five_year_roi_pct"] == round(((1.05) ** 5 - 1) * 100 + 4.0 * 5, 1)
    assert b["value_range_label"] == "Rs 55.00 Lakh - Rs 66.00 Lakh"


def test_valuation_range_is_fixed_when_inconsistent(live):
    live({"estimated_value_inr": 6_000_000, "value_low_inr": 7_000_000, "value_high_inr": 5_000_000, "monthly_rent_inr": 10000})
    b = client.post("/api/valuation", json={"location": "Pune", "area_sqft": 1000}).json()
    assert b["value_low_inr"] <= b["estimated_value_inr"] <= b["value_high_inr"]


def test_valuation_implausible_price_falls_back(live):
    live({"estimated_value_inr": 1000})
    assert client.post("/api/valuation", json={"location": "Pune", "area_sqft": 1000}).json()["mode"] == "demo"


def test_daily_plan_live(live):
    live({"tasks": [{"task": "Pour slab", "crew": "12", "priority": "high"}], "risk_alerts": [{"risk": "Heat", "severity": "medium"}], "summary": "ok"})
    b = client.post("/api/daily-plan", json={"activities": "slab", "workforce": 12}).json()
    assert b["mode"] == "live" and b["tasks"][0]["priority"] == "High" and b["risk_alerts"][0]["severity"] == "Medium"
    assert b["materials_equipment"] == []


def test_weather_live_decision_normalised(live):
    live({"decision": "No-Go", "risk_level": "high", "risks": ["lightning"], "rationale": "unsafe"})
    b = client.post("/api/weather-advisory", json={"activity": "crane", "condition": "Thunderstorm"}).json()
    assert b["mode"] == "live" and b["decision"] == "NO-GO" and b["risk_level"] == "High"


def test_chat_live(live):
    live({"reply": "Cure for 7 days."})
    b = client.post("/api/chat", json={"message": "how long to cure?"}).json()
    assert b["mode"] == "live" and b["reply"] == "Cure for 7 days."


def test_chat_ai_failure_uses_fallback(live):
    live(RuntimeError("400 bad"))
    b = client.post("/api/chat", json={"message": "what ppe is needed?"}).json()
    assert b["mode"] == "demo" and "PPE" in b["reply"]


# ------------------------------------------------------------ retry / backup model
def test_retries_transient_503_then_succeeds(live):
    c = live(RuntimeError("503 UNAVAILABLE high demand"), {"summary": "ok", "hazards": []})
    b = client.post("/api/safety", data={"description": "x"}).json()
    assert b["mode"] == "live" and len(c.models.calls) == 2


def test_falls_back_to_backup_model_on_permanent_error(live, monkeypatch):
    monkeypatch.setenv("GEMINI_MODEL", "model-a")
    monkeypatch.setenv("GEMINI_FALLBACK_MODEL", "model-b")
    c = live(RuntimeError("404 NOT_FOUND"), {"summary": "ok", "hazards": []})
    assert client.post("/api/safety", data={"description": "x"}).json()["mode"] == "live"
    assert c.models.calls == ["model-a", "model-b"]


def test_gives_up_after_all_attempts(live, monkeypatch):
    monkeypatch.setenv("GEMINI_MODEL", "model-a")
    monkeypatch.setenv("GEMINI_FALLBACK_MODEL", "model-b")
    c = live(RuntimeError("503 UNAVAILABLE"))
    b = client.post("/api/safety", data={"description": "x"}).json()
    assert b["mode"] == "demo" and "AI unavailable" in b["warning"] and len(c.models.calls) == 6


# ------------------------------------------------------------ repeated requests are stable
def test_repeated_calls_give_same_fallback_numbers():
    payload = {"plot_size_sqft": 1200, "construction_type": "Commercial", "city": "Delhi", "floors": 3}
    a = client.post("/api/planning", json=payload).json()
    b = client.post("/api/planning", json=payload).json()
    assert a["total_cost_inr"] == b["total_cost_inr"] and a["materials"] == b["materials"]
