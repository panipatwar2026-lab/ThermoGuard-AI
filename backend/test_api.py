"""Smoke checks for request validation. Run: python -m backend.test_api"""

from datetime import date, datetime, time, timedelta, timezone
from unittest import mock

from fastapi.testclient import TestClient

from backend.app import firms, ml
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
    assert client.get("/api/fires", params={"hours": 999}).status_code == 422
    assert client.get("/api/fires", params={"bbox": "../../x"}).status_code == 422
    assert client.get("/api/infrastructure", params={"lat": 999, "lon": 0}).status_code == 422
    assert client.get("/api/debug/firms").status_code == 404

    # Rolling window trims by acquisition time, not calendar day.
    now = datetime.now(timezone.utc)
    rows = [
        {"acq_date": t.strftime("%Y-%m-%d"), "acq_time": str(int(t.strftime("%H%M")))}
        for t in (now - timedelta(hours=2), now - timedelta(hours=23), now - timedelta(hours=30))
    ]
    with mock.patch.object(firms, "fetch_latest_fires", return_value=rows) as fetch:
        assert len(firms.fetch_recent_fires(hours=24)) == 2
        assert fetch.call_args.kwargs["days"] == 2

    # India filter: Delhi and a point just off Mumbai's coast kept; Lahore, Kathmandu, Dhaka, Yangon dropped.
    pts = {"delhi": (28.61, 77.21), "off_mumbai": (18.90, 72.79), "lahore": (31.55, 74.34),
           "kathmandu": (27.72, 85.32), "dhaka": (23.81, 90.41), "yangon": (16.84, 96.17)}
    kept = firms.within_india([{"name": n, "latitude": la, "longitude": lo} for n, (la, lo) in pts.items()])
    assert {r["name"] for r in kept} == {"delhi", "off_mumbai"}, kept

    # Hour feature comes from acq_time (as in training), not observation_time.
    df, _ = ml.build_input_data(
        20, 73, 330, 1, 1, 1745, "h", "2.0NRT", "D", 0, 310, 5, date(2026, 4, 10), time(3, 0)
    )
    assert (df["hour"][0], df["minute"][0]) == (17, 45)
    print("ok")


if __name__ == "__main__":
    demo()
