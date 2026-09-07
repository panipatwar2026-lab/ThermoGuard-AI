"""
ML logic ported from app.py, unchanged, minus Streamlit calls.
Keeps prediction output byte-identical to the Streamlit app.
"""

import os
from datetime import datetime, date, time

import joblib
import numpy as np
import pandas as pd

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODELS_DIR = os.path.join(ROOT_DIR, "models")

# v2: trained on real, sourced labels (MODIS burned-area outcomes) via
# data-pipeline/, replacing the FRP-threshold-derived risk_level the
# original thermoguard_best.pkl was trained on. See data-pipeline/README.md
# and output/models/metrics.json for the honest evaluation (81.6% CV
# accuracy on a deliberately small, single-region/season first pull).
MODEL_FILE = os.path.join(MODELS_DIR, "thermoguard_risk_v2.pkl")
ENCODER_FILE = os.path.join(MODELS_DIR, "label_encoder_risk_v2.pkl")
FEATURE_FILE = os.path.join(MODELS_DIR, "feature_columns_risk_v2.pkl")

# v2: retrained on real ESA WorldCover land-cover classes (6-class: Wildfire,
# Agricultural Fire, Industrial/Urban Fire, Offshore, Other, Unknown) via
# data-pipeline/, replacing the original model trained on FIRMS's own `type`
# field. See data-pipeline/README.md and output/models/metrics.json.
FIRE_SOURCE_MODEL_FILE = os.path.join(MODELS_DIR, "thermoguard_fire_source_v2.pkl")
FIRE_SOURCE_ENCODER_FILE = os.path.join(MODELS_DIR, "fire_source_label_encoder_v2.pkl")
FIRE_SOURCE_FEATURE_FILE = os.path.join(MODELS_DIR, "fire_source_features_v2.pkl")


class ModelLoadError(Exception):
    pass


model = None
label_encoder = None
feature_columns = None

fire_source_model = None
fire_source_encoder = None
fire_source_features = None

_load_error = None

try:
    model = joblib.load(MODEL_FILE)
    label_encoder = joblib.load(ENCODER_FILE)
    feature_columns = joblib.load(FEATURE_FILE)
except Exception as e:
    _load_error = str(e)

try:
    fire_source_model = joblib.load(FIRE_SOURCE_MODEL_FILE)
    fire_source_encoder = joblib.load(FIRE_SOURCE_ENCODER_FILE)
    fire_source_features = joblib.load(FIRE_SOURCE_FEATURE_FILE)
except Exception:
    pass


def models_ready():
    return model is not None and label_encoder is not None and feature_columns is not None


def load_error():
    return _load_error


# ============================================================
# BUILD FEATURES
# ============================================================

def build_input_data(
    latitude,
    longitude,
    brightness,
    scan,
    track,
    acq_time,
    confidence,
    version,
    daynight,
    fire_type,
    bright_t31,
    frp,
    observation_date,
    observation_time,
):
    obs_datetime = datetime.combine(observation_date, observation_time)

    year = obs_datetime.year
    month = obs_datetime.month
    day = obs_datetime.day

    day_of_year = obs_datetime.timetuple().tm_yday
    day_of_week = obs_datetime.weekday()
    week_of_year = int(obs_datetime.strftime("%V"))

    hour = obs_datetime.hour
    minute = obs_datetime.minute

    is_weekend = 1 if day_of_week >= 5 else 0

    if month in [12, 1, 2]:
        season = "winter"
    elif month in [3, 4, 5]:
        season = "spring"
    elif month in [6, 7, 8, 9]:
        season = "summer"
    else:
        season = "autumn"

    confidence_mapping = {"h": 0, "l": 1, "n": 2}
    version_mapping = {"2.0NRT": 0}
    daynight_mapping = {"D": 0, "N": 1}
    season_mapping = {"autumn": 0, "spring": 1, "summer": 2, "winter": 3}

    month_sin = np.sin(2 * np.pi * month / 12)
    month_cos = np.cos(2 * np.pi * month / 12)

    hour_sin = np.sin(2 * np.pi * hour / 24)
    hour_cos = np.cos(2 * np.pi * hour / 24)

    day_of_year_sin = np.sin(2 * np.pi * day_of_year / 365)
    day_of_year_cos = np.cos(2 * np.pi * day_of_year / 365)

    # Engineered features train_best.py adds on top of the raw columns above.
    # thermoguard_best.pkl was trained expecting these — previously this
    # function didn't compute them, so they were silently zero-filled at
    # inference by the reindex(fill_value=0) call in predict_fire().
    brightness_diff = brightness - bright_t31
    brightness_ratio = brightness / (bright_t31 + 1)
    scan_track_mean = (scan + track) / 2
    scan_track_diff = abs(scan - track)

    # train_best.py computes a second, formula-identical sin/cos pair
    # (hour_sin2/month_sin2 etc.) alongside hour_sin/month_sin — kept as
    # separate columns because that's what the trained model expects.
    hour_sin2 = hour_sin
    hour_cos2 = hour_cos
    month_sin2 = month_sin
    month_cos2 = month_cos

    input_data = pd.DataFrame(
        [
            {
                "latitude": latitude,
                "longitude": longitude,
                "brightness": brightness,
                "scan": scan,
                "track": track,
                "acq_time": acq_time,
                "confidence": confidence_mapping[confidence],
                "version": version_mapping[version],
                "bright_t31": bright_t31,
                "frp": frp,
                "daynight": daynight_mapping[daynight],
                "type": fire_type,
                "year": year,
                "month": month,
                "day": day,
                "day_of_year": day_of_year,
                "day_of_week": day_of_week,
                "week_of_year": week_of_year,
                "hour": hour,
                "minute": minute,
                "is_weekend": is_weekend,
                "season": season_mapping[season],
                "month_sin": month_sin,
                "month_cos": month_cos,
                "hour_sin": hour_sin,
                "hour_cos": hour_cos,
                "day_of_year_sin": day_of_year_sin,
                "day_of_year_cos": day_of_year_cos,
                "brightness_diff": brightness_diff,
                "brightness_ratio": brightness_ratio,
                "scan_track_mean": scan_track_mean,
                "scan_track_diff": scan_track_diff,
                "hour_sin2": hour_sin2,
                "hour_cos2": hour_cos2,
                "month_sin2": month_sin2,
                "month_cos2": month_cos2,
            }
        ]
    )

    return input_data, season


# ============================================================
# PRELIMINARY FIRE DETECTION
# ============================================================

def detect_fire(brightness, bright_t31, frp):
    brightness_difference = brightness - bright_t31

    fire_detected = frp >= 2.40 and brightness_difference >= 15

    return fire_detected, brightness_difference


# ============================================================
# MODEL PREDICTION
# ============================================================

def predict_fire(
    latitude,
    longitude,
    brightness,
    scan,
    track,
    acq_time,
    confidence,
    version,
    daynight,
    fire_type,
    bright_t31,
    frp,
    observation_date,
    observation_time,
):
    input_data, season = build_input_data(
        latitude,
        longitude,
        brightness,
        scan,
        track,
        acq_time,
        confidence,
        version,
        daynight,
        fire_type,
        bright_t31,
        frp,
        observation_date,
        observation_time,
    )

    input_risk_data = input_data.reindex(columns=feature_columns, fill_value=0)
    input_risk_data = input_risk_data.apply(pd.to_numeric, errors="coerce").fillna(0)

    prediction = model.predict(input_risk_data)
    prediction_proba = model.predict_proba(input_risk_data)[0]

    predicted_class = prediction[0]
    predicted_risk = label_encoder.inverse_transform([predicted_class])[0]

    confidence_score = np.max(prediction_proba) * 100

    fire_source = "Not Available"
    fire_source_confidence = 0.0
    source_probability = None

    if (
        fire_source_model is not None
        and fire_source_encoder is not None
        and fire_source_features is not None
    ):
        try:
            source_input = input_data.reindex(columns=fire_source_features, fill_value=0)
            source_input = source_input.apply(pd.to_numeric, errors="coerce").fillna(0)

            source_prediction = fire_source_model.predict(source_input)
            fire_source = fire_source_encoder.inverse_transform(source_prediction)[0]

            if hasattr(fire_source_model, "predict_proba"):
                source_probability = fire_source_model.predict_proba(source_input)[0]
                fire_source_confidence = np.max(source_probability) * 100

        except Exception:
            fire_source = "Prediction Error"

    return {
        "input_data": input_data,
        "season": season,
        "predicted_risk": predicted_risk,
        "prediction_proba": prediction_proba,
        "confidence_score": confidence_score,
        "fire_source": fire_source,
        "fire_source_confidence": fire_source_confidence,
        "source_probability": source_probability,
    }


# ============================================================
# DERIVED ANALYSIS (intensity / thermal), same thresholds as app.py
# ============================================================

def classify_intensity(frp):
    if frp >= 10:
        return "Very High", (
            "Very high fire radiative power detected. "
            "The hotspot may represent a strong thermal event."
        )
    elif frp >= 4.97:
        return "High", (
            "High FRP detected. Increased fire activity should be monitored."
        )
    elif frp >= 2.40:
        return "Medium", (
            "Medium FRP detected. Continued monitoring is recommended."
        )
    else:
        return "Low", (
            "Low FRP detected. No strong thermal intensity is indicated by FRP alone."
        )


def classify_thermal(brightness_difference):
    if brightness_difference >= 30:
        return "Strong Thermal Anomaly", (
            "Brightness is substantially higher than Brightness T31, "
            "indicating a strong thermal anomaly."
        )
    elif brightness_difference >= 15:
        return "Moderate Thermal Anomaly", (
            "A moderate thermal difference is observed between "
            "brightness and Brightness T31."
        )
    else:
        return "Low Thermal Difference", (
            "The difference between brightness and Brightness T31 is relatively small."
        )
