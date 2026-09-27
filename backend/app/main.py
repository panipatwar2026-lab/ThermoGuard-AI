import logging
import time
from pathlib import Path

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
logging.basicConfig(level=logging.INFO)

from . import firms, ml, osm
from .report import create_pdf_report
from .schemas import PredictRequest, PredictResponse, RiskProbability

app = FastAPI(title="ThermoGuard AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _run_prediction(req: PredictRequest) -> dict:
    if not ml.models_ready():
        raise HTTPException(status_code=503, detail=f"Risk model unavailable: {ml.load_error()}")

    result = ml.predict_fire(
        req.latitude,
        req.longitude,
        req.brightness,
        req.scan,
        req.track,
        req.acq_time,
        req.confidence,
        req.version,
        req.daynight,
        req.fire_type,
        req.bright_t31,
        req.frp,
        req.observation_date,
        req.observation_time,
    )

    fire_detected, brightness_difference = ml.detect_fire(req.brightness, req.bright_t31, req.frp)
    intensity, intensity_message = ml.classify_intensity(req.frp)
    thermal_status, thermal_message = ml.classify_thermal(brightness_difference)

    prediction_proba = [
        {"risk_level": str(level), "probability": round(float(p) * 100, 2)}
        for level, p in zip(ml.label_encoder.classes_, result["prediction_proba"])
    ]

    return {
        "predicted_risk": str(result["predicted_risk"]),
        "confidence_score": round(float(result["confidence_score"]), 2),
        "prediction_proba": prediction_proba,
        "fire_source": str(result["fire_source"]),
        "fire_source_confidence": round(float(result["fire_source_confidence"]), 2),
        "fire_detected": bool(fire_detected),
        "brightness_difference": round(float(brightness_difference), 2),
        "intensity": intensity,
        "intensity_message": intensity_message,
        "thermal_status": thermal_status,
        "thermal_message": thermal_message,
        "season": result["season"],
        "latitude": req.latitude,
        "longitude": req.longitude,
        "brightness": req.brightness,
        "frp": req.frp,
        "daynight": req.daynight,
    }


@app.get("/api/health")
def health():
    return {
        "risk_model_ready": ml.models_ready(),
        "fire_source_model_ready": ml.fire_source_model is not None,
        "error": ml.load_error(),
    }


@app.get("/api/meta")
def meta():
    if not ml.models_ready():
        raise HTTPException(status_code=503, detail=f"Risk model unavailable: {ml.load_error()}")

    importances = []
    if hasattr(ml.model, "feature_importances_"):
        pairs = sorted(
            zip(ml.feature_columns, ml.model.feature_importances_),
            key=lambda x: x[1],
            reverse=True,
        )
        importances = [{"feature": f, "importance": round(float(i), 6)} for f, i in pairs]

    return {
        "feature_columns": list(ml.feature_columns),
        "risk_classes": list(ml.label_encoder.classes_),
        "feature_importances": importances,
        "fire_source_available": ml.fire_source_model is not None,
        "performance": {
            # v4: time holdout (train on detections before 2025-03-28, test on
            # the 348,110 after), which keeps detections of the same fire off
            # both sides of the split. Stricter than the random splits
            # quoted for v3. See models/metrics_v4.json.
            "model": "XGBoost",
            "features": len(ml.feature_columns),
            "test_samples": 348110,
            "accuracy": 80.94,
            "verified": True,
            "caveat": (
                "Time-holdout accuracy 80.94% (macro-F1 0.43) on 1,740,549 VIIRS "
                "detections across India, Jan 2024-Jun 2025; tested on the most "
                "recent 20% by date. Labels are real outcomes: did a MODIS-mapped "
                "burn follow the hotspot. Reliable on Low (F1 0.90), weak on High "
                "(F1 0.31) and Medium (F1 0.07). About 77% of hotspots are Low, "
                "so treat High and Medium calls as hints, not verdicts."
            ),
        },
        "fire_source_performance": (
            {
                "model": "XGBoost",
                "classes": list(ml.fire_source_encoder.classes_),
                "dataset_rows": 1740549,
                "accuracy": 82.10,
                "verified": True,
                "caveat": (
                    "Time-holdout accuracy 82.10% (macro-F1 0.56) on ESA WorldCover "
                    "land-cover classes, a correlate of likely fire source rather "
                    "than a confirmed cause. Strong on Wildfire (F1 0.85) and "
                    "Agricultural Fire (F1 0.82); moderate on Other (0.54), "
                    "Industrial/Urban (0.51) and Unknown (0.51); weak on Offshore "
                    "(0.14, 8,372 rows)."
                ),
            }
            if ml.fire_source_model is not None
            else None
        ),
    }


@app.post("/api/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    return _run_prediction(req)


@app.post("/api/report")
def report(req: PredictRequest):
    ctx = _run_prediction(req)
    ctx.update(
        {
            "scan": req.scan,
            "track": req.track,
            "acq_time": req.acq_time,
            "confidence": req.confidence,
            "version": req.version,
            "fire_type": req.fire_type,
            "bright_t31": req.bright_t31,
            "observation_date": req.observation_date,
            "observation_time": req.observation_time,
        }
    )

    pdf_buffer = create_pdf_report(ctx)

    return Response(
        content=pdf_buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=ThermoGuard_AI_Report.pdf"},
    )


# ponytail: in-process TTL cache, per worker. Every open dashboard polls
# every 60s; without this each tab spends FIRMS MAP_KEY quota (5000 calls /
# 10 min). Move to a shared cache if running multiple workers.
FIRES_CACHE_TTL_S = 60
_fires_cache: dict[tuple[str, int, bool], tuple[float, dict]] = {}


def _parse_bbox(bbox: str) -> str:
    try:
        west, south, east, north = (float(x) for x in bbox.split(","))
    except ValueError:
        raise HTTPException(status_code=422, detail="bbox must be 'west,south,east,north'")
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise HTTPException(status_code=422, detail="bbox out of range")
    return f"{west},{south},{east},{north}"


@app.get("/api/fires")
def fires(
    bbox: str = firms.INDIA_BBOX,
    hours: int = Query(24, ge=1, le=216),
    india_only: bool = True,
):
    bbox = _parse_bbox(bbox)
    key = (bbox, hours, india_only)
    cached = _fires_cache.get(key)
    if cached and time.monotonic() - cached[0] < FIRES_CACHE_TTL_S:
        return cached[1]

    try:
        # Rolling window (default 24h), matching the FIRMS Fire Map default.
        rows = firms.fetch_recent_fires(bbox=bbox, hours=hours)
        stale = False
        # Nothing in the window (rare, e.g. a NASA processing gap): widen to
        # 48h rather than showing an empty map, and flag it.
        if not rows and hours == 24:
            rows = firms.fetch_recent_fires(bbox=bbox, hours=48)
            stale = True
        if india_only:
            rows = firms.within_india(rows)
    except firms.MissingMapKeyError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"NASA FIRMS request failed: {e}")

    body = {
        "success": True,
        "count": len(rows),
        "source": "NASA FIRMS",
        "satellite": ", ".join(firms.NRT_SOURCES),
        "window_hours": 48 if stale else hours,
        "india_only": india_only,
        # Newest detection, e.g. "2026-09-27 0550" (UTC); rows are sorted newest first.
        "latest": f"{rows[0]['acq_date']} {int(rows[0]['acq_time']):04d}" if rows else None,
        "stale": stale,
        "fires": rows,
    }
    _fires_cache[key] = (time.monotonic(), body)
    return body


@app.get("/api/infrastructure")
def infrastructure(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180)):
    try:
        # Rounded to ~100 m so repeat lookups of one hotspot hit osm's cache.
        return osm.fetch_infrastructure(round(lat, 3), round(lon, 3))
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"OpenStreetMap request failed: {e}")
