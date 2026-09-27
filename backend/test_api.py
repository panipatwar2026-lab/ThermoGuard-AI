"""Smoke checks for request validation. Run: python -m backend.test_api"""

from datetime import date, time

from fastapi.testclient import TestClient

from backend.app import ml
from backend.app.main import app

client = TestClient(app)

BODY = {"observation_date": "2026-04-10", "observation_time": "08:00:00", "acq_time": 800}


def demo():
    ok = client.post("/api/predict", json=BODY)
    assert ok.status_code == 200, ok.text
    assert ok.json()["predicted_risk"] in ml.label_encoder.classes_

    # Bad enum values used to raise KeyError -> 500.
    for bad in ({"confidence": "nominal"}, {"daynight": "X"}, {"acq_time": 1275}, {"latitude": 200}):
        r = client.post("/api/predict", json={**BODY, **bad})
        assert r.status_code == 422, (bad, r.status_code)

    # Validation runs before any FIRMS/OSM call.
    assert client.get("/api/fires", params={"days": 99}).status_code == 422
    assert client.get("/api/fires", params={"bbox": "../../x"}).status_code == 422
    assert client.get("/api/infrastructure", params={"lat": 999, "lon": 0}).status_code == 422
    assert client.get("/api/debug/firms").status_code == 404

    # Hour feature comes from acq_time (as in training), not observation_time.
    df, _ = ml.build_input_data(
        20, 73, 330, 1, 1, 1745, "h", "2.0NRT", "D", 0, 310, 5, date(2026, 4, 10), time(3, 0)
    )
    assert (df["hour"][0], df["minute"][0]) == (17, 45)
    print("ok")


if __name__ == "__main__":
    demo()
