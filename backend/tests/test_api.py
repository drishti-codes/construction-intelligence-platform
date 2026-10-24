import io
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


def test_health_demo_mode(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["ai_mode"] == "demo"


def test_safety_with_image_matches_schema():
    r = client.post("/api/safety", files={"image": ("a.png", png_bytes(), "image/png")}, data={"description": "scaffold work"})
    assert r.status_code == 200
    body = r.json()
    assert 0 <= body["safety_score"] <= 100
    assert body["mode"] == "demo"
    assert set(body["ppe"]) == {"helmet", "high_vis_vest", "safety_boots", "safety_harness"}


def test_safety_text_only_ok():
    assert client.post("/api/safety", data={"description": "no helmets seen"}).status_code == 200


def test_safety_requires_input():
    assert client.post("/api/safety", data={"description": "  "}).status_code == 422


def test_rejects_wrong_file_type():
    r = client.post("/api/safety", files={"image": ("a.txt", b"hello", "text/plain")})
    assert r.status_code == 415


def test_rejects_truncated_image():
    r = client.post("/api/cracks", files={"image": ("a.png", png_bytes()[:50], "image/png")})
    assert r.status_code == 422


def test_rejects_tiny_image():
    r = client.post("/api/cracks", files={"image": ("a.png", png_bytes((10, 10)), "image/png")})
    assert r.status_code == 422


def test_rejects_empty_file():
    r = client.post("/api/cracks", files={"image": ("a.png", b"", "image/png")})
    assert r.status_code == 422


def test_cracks_ok():
    r = client.post("/api/cracks", files={"image": ("a.png", png_bytes(), "image/png")})
    assert r.status_code == 200 and r.json()["severity"] in {"Low", "Medium", "High", "Critical"}


def test_planning_calculation():
    r = client.post("/api/planning", json={"structure_type": "Residential", "built_up_sqft": 1000, "location_tier": 2, "completion_pct": 50, "floors": 2})
    assert r.status_code == 200
    b = r.json()
    assert b["total_budget_inr"] == 1_800_000
    assert b["spent_inr"] == 900_000
    assert b["materials"]["cement_bags_50kg"] == 400
    assert b["visualization_url"].startswith("https://")


@pytest.mark.parametrize("payload", [
    {"structure_type": "Residential", "built_up_sqft": -5, "location_tier": 1, "completion_pct": 10},
    {"structure_type": "Residential", "built_up_sqft": 1000, "location_tier": 4, "completion_pct": 10},
    {"structure_type": "Residential", "built_up_sqft": 1000, "location_tier": 1, "completion_pct": 150},
    {"structure_type": "Castle", "built_up_sqft": 1000, "location_tier": 1, "completion_pct": 10},
    {},
])
def test_planning_rejects_bad_input(payload):
    assert client.post("/api/planning", json=payload).status_code == 422


def test_weather_and_unknown():
    assert client.get("/api/weather-advisory", params={"condition": "High Wind"}).json()["risk_level"] == "High"
    assert client.get("/api/weather-advisory", params={"condition": "Snow"}).status_code == 404


def test_chat():
    assert "PPE" in client.post("/api/chat", json={"message": "what ppe is needed?"}).json()["reply"]
    assert client.post("/api/chat", json={"message": ""}).status_code == 422


# ---- AI retry / fallback behaviour (uses a fake client, no network) ----
class _Resp:
    def __init__(self, text):
        self.text = text


class _FakeModels:
    def __init__(self, behaviours):
        self.behaviours = list(behaviours)
        self.calls = []

    def generate_content(self, model, contents, config):
        self.calls.append(model)
        b = self.behaviours.pop(0)
        if isinstance(b, Exception):
            raise b
        return _Resp(b)


class _FakeClient:
    def __init__(self, behaviours):
        self.models = _FakeModels(behaviours)


def test_retries_transient_503_then_succeeds(monkeypatch):
    monkeypatch.setattr(main.time, "sleep", lambda s: None)
    c = _FakeClient([RuntimeError("503 UNAVAILABLE high demand"), '{"ok": 1}'])
    assert main._generate_json(c, "x") == {"ok": 1}
    assert len(c.models.calls) == 2


def test_falls_back_to_backup_model_on_permanent_error(monkeypatch):
    monkeypatch.setattr(main.time, "sleep", lambda s: None)
    monkeypatch.setenv("GEMINI_MODEL", "model-a")
    monkeypatch.setenv("GEMINI_FALLBACK_MODEL", "model-b")
    c = _FakeClient([RuntimeError("404 NOT_FOUND"), '{"ok": 2}'])
    assert main._generate_json(c, "x") == {"ok": 2}
    assert c.models.calls == ["model-a", "model-b"]


def test_gives_up_after_all_attempts(monkeypatch):
    monkeypatch.setattr(main.time, "sleep", lambda s: None)
    monkeypatch.setenv("GEMINI_MODEL", "model-a")
    monkeypatch.setenv("GEMINI_FALLBACK_MODEL", "model-b")
    c = _FakeClient([RuntimeError("503 UNAVAILABLE")] * 6)
    with pytest.raises(RuntimeError):
        main._generate_json(c, "x")
    assert len(c.models.calls) == 6


def test_run_ai_falls_back_to_demo_when_ai_fails(monkeypatch):
    monkeypatch.setattr(main.time, "sleep", lambda s: None)
    monkeypatch.setattr(main, "_get_client", lambda: _FakeClient([RuntimeError("503 UNAVAILABLE")] * 6))
    out = main.run_ai("p", None, main.CrackReport, main.demo_crack)
    assert out["mode"] == "demo" and "AI unavailable" in out["warning"]
