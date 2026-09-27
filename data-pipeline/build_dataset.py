"""
Build a real, sourced training dataset for ThermoGuard AI.

Pipeline:
    1. Raw hotspot detections            -> sources/hotspots.py   (NEEDS FIRMS_MAP_KEY)
    2. Real risk label (burned outcome)  -> sources/burned_area.py (no credential needed)
    3. Real fire-source label (land use) -> sources/landcover.py   (no credential needed)
    4. Same feature engineering backend/app/ml.py expects at inference,
       so the model trained on this file matches what actually gets served.

Usage:
    python build_dataset.py --start 2023-01-01 --end 2025-12-31 --out output/data_cleaned.csv

Requires FIRMS_MAP_KEY in the environment (see sources/hotspots.py). Steps
2-3 are rate-limited by the upstream APIs, so this can take a while for a
large date range/hotspot count — progress is logged per row via tqdm.
"""

import argparse
import sys
from datetime import date, datetime
from pathlib import Path

import numpy as np
import pandas as pd
from tqdm import tqdm

from sources.burned_area import label_burned_batch
from sources.hotspots import INDIA_BBOX, fetch_hotspots
from sources.landcover import label_landcover_batch

# Mirrors backend/app/ml.py's build_input_data() feature set exactly, so a
# model trained here needs zero translation to be served as-is.
CONFIDENCE_MAPPING = {"h": 0, "l": 1, "n": 2}
DAYNIGHT_MAPPING = {"D": 0, "N": 1}
SEASON_MAPPING = {"autumn": 0, "spring": 1, "summer": 2, "winter": 3}


def _season(month: int) -> str:
    if month in (12, 1, 2):
        return "winter"
    if month in (3, 4, 5):
        return "spring"
    if month in (6, 7, 8, 9):
        return "summer"
    return "autumn"


def engineer_features(row: pd.Series) -> dict:
    acq_date = datetime.strptime(str(row["acq_date"]), "%Y-%m-%d")
    acq_time = int(row["acq_time"])
    hour, minute = divmod(acq_time, 100)

    obs_datetime = acq_date.replace(hour=hour, minute=minute)

    day_of_year = obs_datetime.timetuple().tm_yday
    day_of_week = obs_datetime.weekday()
    week_of_year = int(obs_datetime.strftime("%V"))
    is_weekend = 1 if day_of_week >= 5 else 0
    season = _season(obs_datetime.month)

    month_sin = np.sin(2 * np.pi * obs_datetime.month / 12)
    month_cos = np.cos(2 * np.pi * obs_datetime.month / 12)
    hour_sin = np.sin(2 * np.pi * hour / 24)
    hour_cos = np.cos(2 * np.pi * hour / 24)
    day_of_year_sin = np.sin(2 * np.pi * day_of_year / 365)
    day_of_year_cos = np.cos(2 * np.pi * day_of_year / 365)

    # MODIS rows: brightness / bright_t31. VIIRS rows: bright_ti4 / bright_ti5
    # (the I4 ~3.7um and I5 ~11um bands, the VIIRS counterparts). The backend
    # serves both through the same two inputs.
    brightness = float(row["brightness"] if "brightness" in row else row["bright_ti4"])
    bright_t31 = float(row["bright_t31"] if "bright_t31" in row else row["bright_ti5"])
    scan = float(row["scan"])
    track = float(row["track"])

    return {
        "latitude": float(row["latitude"]),
        "longitude": float(row["longitude"]),
        "brightness": brightness,
        "scan": scan,
        "track": track,
        "acq_time": acq_time,
        "confidence": CONFIDENCE_MAPPING.get(str(row["confidence"]).lower(), 2),
        "version": 0,
        "bright_t31": bright_t31,
        "daynight": DAYNIGHT_MAPPING.get(str(row["daynight"]), 0),
        "type": int(row.get("type", -1)),
        "year": obs_datetime.year,
        "month": obs_datetime.month,
        "day": obs_datetime.day,
        "day_of_year": day_of_year,
        "day_of_week": day_of_week,
        "week_of_year": week_of_year,
        "hour": hour,
        "minute": minute,
        "is_weekend": is_weekend,
        "season": SEASON_MAPPING[season],
        "month_sin": month_sin,
        "month_cos": month_cos,
        "hour_sin": hour_sin,
        "hour_cos": hour_cos,
        "day_of_year_sin": day_of_year_sin,
        "day_of_year_cos": day_of_year_cos,
        "brightness_diff": brightness - bright_t31,
        "brightness_ratio": brightness / (bright_t31 + 1),
        "scan_track_mean": (scan + track) / 2,
        "scan_track_diff": abs(scan - track),
        "hour_sin2": hour_sin,
        "hour_cos2": hour_cos,
        "month_sin2": month_sin,
        "month_cos2": month_cos,
        "acq_date": row["acq_date"],
    }


def label_risk(neighborhood_burned_pixels: int) -> str:
    """
    Real-outcome risk label: did this hotspot correspond to an actual
    mapped burn, and roughly how large (by nearby burned-pixel count as a
    proxy — see sources/burned_area.py's docstring for the honest caveat
    about this not being true fire-perimeter size).

    Thresholds are a first-pass modeling choice, not a physical law —
    revisit once real label distributions are visible (Phase 2).
    """
    if neighborhood_burned_pixels == 0:
        return "Low"
    if neighborhood_burned_pixels < 5:
        return "Medium"
    return "High"


def build(hotspots: pd.DataFrame, bbox: list, window_days: int = 30) -> pd.DataFrame:
    print(f"Engineering features for {len(hotspots)} rows...")
    feature_rows = [engineer_features(row) for _, row in tqdm(hotspots.iterrows(), total=len(hotspots), desc="Features")]
    dataset = pd.DataFrame(feature_rows)

    print("Labeling risk against real burned-area outcomes (batched by tile+month)...")
    burn_result = label_burned_batch(hotspots, bbox, window_days=window_days)
    dataset["risk_level"] = burn_result["neighborhood_burned_pixels"].apply(label_risk).values

    # Months MCD64A1 hasn't published yet have no outcome at all. Labelling
    # them "Low" (the old behaviour) taught v3 that recent == Low.
    checked = burn_result["checked"].to_numpy()
    if (~checked).any():
        print(f"Dropping {(~checked).sum()} rows with no published burned-area data for their month")
    dataset = dataset[checked].reset_index(drop=True)
    hotspots = hotspots[checked].reset_index(drop=True)

    print("Labeling fire source against real land-cover data (batched by tile)...")
    dataset["fire_source"] = label_landcover_batch(dataset).values

    dataset["frp"] = hotspots["frp"].astype(float).values if "frp" in hotspots.columns else 0.0

    return dataset


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", type=str, required=True, help="YYYY-MM-DD")
    parser.add_argument("--end", type=str, required=True, help="YYYY-MM-DD")
    parser.add_argument("--out", type=str, default="output/data_cleaned.csv")
    parser.add_argument("--window-days", type=int, default=30)
    parser.add_argument("--source", default="VIIRS_SNPP_SP", help="FIRMS archive source, e.g. VIIRS_SNPP_SP or MODIS_SP")
    args = parser.parse_args()

    start = date.fromisoformat(args.start)
    end = date.fromisoformat(args.end)

    print(f"Fetching FIRMS hotspots {start} .. {end} ...")
    try:
        hotspots = fetch_hotspots(start, end, source=args.source)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"Fetched {len(hotspots)} hotspot detections. Labeling against real ground truth ...")
    bbox = [float(x) for x in INDIA_BBOX.split(",")]
    dataset = build(hotspots, bbox, window_days=args.window_days)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    dataset.to_csv(out_path, index=False)

    print(f"Wrote {len(dataset)} labeled rows to {out_path}")
    print(dataset["risk_level"].value_counts())
    print(dataset["fire_source"].value_counts())


if __name__ == "__main__":
    main()
