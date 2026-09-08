import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

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
            # Real, reproducible 5-fold stratified CV on genuine outcome-based
            # labels (did the hotspot correspond to an actual MODIS-mapped
            # burn) — see data-pipeline/train.py and
            # data-pipeline/output/models/metrics.json. Replaces the old
            # unverifiable 99.92%/126,935-sample claim tied to an
            # FRP-threshold-derived label.
            "model": "XGBoost",
            "features": len(ml.feature_columns),
            "test_samples": 1472,
            "accuracy": 81.59,
            "verified": True,
            "caveat": (
                "Real 5-fold cross-validated accuracy on genuine burned-area "
                "outcome labels, but from a deliberately small first pull "
                "(10 days, one region) — strong on Low/High risk (F1 0.89/0.79), "
                "weak on Medium (F1 0.21, the genuinely ambiguous middle class). "
                "Expand data-pipeline's date range/geography for a more robust "
                "estimate, especially of the Medium class."
            ),
        },
        "fire_source_performance": (
            {
                # Real 5-fold stratified CV on real ESA WorldCover land-cover
                # classes (see data-pipeline/train.py and
                # data-pipeline/output/models/metrics.json).
                "model": "XGBoost",
                "classes": list(ml.fire_source_encoder.classes_),
                "dataset_rows": 30196,
                "accuracy": 87.79,
                "verified": True,
                "caveat": (
                    "Real 5-fold cross-validated accuracy on real ESA WorldCover "
                    "land-cover classes (a correlate of likely fire source, not a "
                    "confirmed cause). Strong on Agricultural Fire (F1 0.94, 23001 "
                    "rows) and Unknown (F1 0.88, 105 rows); moderate on Wildfire "
                    "(F1 0.66) and Other (F1 0.65); weaker on Industrial/Urban Fire "
                    "(F1 0.55, 1238 rows) and Offshore (F1 0.24, only 255 rows). "
                    "See data-pipeline/README.md for how to pull more balanced data."
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


@app.get("/api/fires")
def fires(bbox: str = firms.INDIA_BBOX, days: int = 1):
    try:
        rows = firms.fetch_live_fires(bbox=bbox, days=days)
    except firms.MissingMapKeyError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"NASA FIRMS request failed: {e}")

    return {
        "success": True,
        "count": len(rows),
        "source": "NASA FIRMS",
        "satellite": firms.DEFAULT_SOURCE,
        "fires": rows,
    }


@app.get("/api/infrastructure")
def infrastructure(lat: float, lon: float):
    try:
        return osm.fetch_infrastructure(lat, lon)
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"OpenStreetMap request failed: {e}")
