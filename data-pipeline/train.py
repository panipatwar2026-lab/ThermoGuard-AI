"""
Canonical training script for ThermoGuard AI — replaces the six divergent
train_*.py scripts at the repo root, all of which trained on an
undocumented, unreproducible data_cleaned.csv with an FRP-threshold-
derived risk_level.

Trains on the output of build_dataset.py: real, sourced labels (burned-
area outcome for risk, land-cover class for fire source), with the exact
35-feature schema backend/app/ml.py already computes at inference — no
translation needed to serve what comes out of this script.

Usage:
    python train.py --data output/data_cleaned_small.csv --out-dir output/models

Writes:
    <out-dir>/thermoguard_risk.pkl, label_encoder_risk.pkl, feature_columns.pkl
    <out-dir>/thermoguard_fire_source.pkl, label_encoder_fire_source.pkl, fire_source_features.pkl
    <out-dir>/metrics.json, <out-dir>/confusion_matrix_risk.png
"""

import argparse
import json
from pathlib import Path

import joblib
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.metrics import ConfusionMatrixDisplay, accuracy_score, classification_report
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.preprocessing import LabelEncoder
from xgboost import XGBClassifier

# Matches backend/app/ml.py's feature_columns exactly.
RISK_FEATURE_COLUMNS = [
    "latitude", "longitude", "brightness", "scan", "track", "acq_time",
    "confidence", "version", "bright_t31", "daynight", "type",
    "year", "month", "day", "day_of_year", "day_of_week", "week_of_year",
    "hour", "minute", "is_weekend", "season",
    "month_sin", "month_cos", "hour_sin", "hour_cos",
    "day_of_year_sin", "day_of_year_cos",
    "brightness_diff", "brightness_ratio", "scan_track_mean", "scan_track_diff",
    "hour_sin2", "hour_cos2", "month_sin2", "month_cos2",
]

# Matches the fields backend/app/ml.py sends to the fire-source model
# (fire_source_features.pkl). Includes latitude/longitude: the fire_source
# label is derived FROM land cover at that exact point, so location is the
# causal signal, not leakage — dropping it left the model unable to predict
# anything but the time-of-year majority class regardless of where the
# hotspot actually is. `type` (FIRMS's own field) stays excluded since it
# nearly answers fire_source directly (see data-pipeline/README.md).
FIRE_SOURCE_FEATURE_COLUMNS = [
    "latitude", "longitude",
    "brightness", "scan", "track", "acq_time", "bright_t31",
    "year", "month", "day", "day_of_year", "day_of_week", "week_of_year",
    "hour", "minute", "is_weekend",
    "month_sin", "month_cos", "hour_sin", "hour_cos",
    "day_of_year_sin", "day_of_year_cos",
]


def cross_validated_report(model_cls, X, y, label_encoder, n_splits=5, **model_kwargs):
    """Small dataset (a first real-labels pass, deliberately kept small
    per the plan) means a single train/test holdout would be noisy —
    stratified k-fold gives a more robust accuracy estimate. A proper
    time-based holdout (train on earlier dates, test on later ones) is
    the right approach once more date range is pulled; see
    data-pipeline/README.md."""
    skf = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
    fold_accuracies = []
    all_true, all_pred = [], []

    for train_idx, test_idx in skf.split(X, y):
        model = model_cls(**model_kwargs)
        model.fit(X.iloc[train_idx], y[train_idx])
        pred = model.predict(X.iloc[test_idx])

        fold_accuracies.append(accuracy_score(y[test_idx], pred))
        all_true.extend(y[test_idx])
        all_pred.extend(pred)

    report = classification_report(
        all_true, all_pred, target_names=label_encoder.classes_, output_dict=True
    )

    return {
        "cv_fold_accuracies": fold_accuracies,
        "cv_mean_accuracy": float(np.mean(fold_accuracies)),
        "cv_std_accuracy": float(np.std(fold_accuracies)),
        "classification_report": report,
        "all_true": all_true,
        "all_pred": all_pred,
    }


def train_risk_model(df: pd.DataFrame, out_dir: Path) -> dict:
    X = df[RISK_FEATURE_COLUMNS].apply(pd.to_numeric, errors="coerce").fillna(0)
    label_encoder = LabelEncoder()
    y = label_encoder.fit_transform(df["risk_level"])

    cv = cross_validated_report(
        XGBClassifier,
        X, y, label_encoder,
        n_estimators=300, max_depth=6, learning_rate=0.05,
        subsample=0.9, colsample_bytree=0.9,
        objective="multi:softmax", num_class=len(label_encoder.classes_),
        eval_metric="mlogloss", tree_method="hist", n_jobs=-1, random_state=42,
    )

    # Final model trained on all data for serving (the CV above is purely
    # for an honest accuracy estimate, not the shipped artifact).
    final_model = XGBClassifier(
        n_estimators=300, max_depth=6, learning_rate=0.05,
        subsample=0.9, colsample_bytree=0.9,
        objective="multi:softmax", num_class=len(label_encoder.classes_),
        eval_metric="mlogloss", tree_method="hist", n_jobs=-1, random_state=42,
    )
    final_model.fit(X, y)

    joblib.dump(final_model, out_dir / "thermoguard_risk.pkl")
    joblib.dump(label_encoder, out_dir / "label_encoder_risk.pkl")
    joblib.dump(RISK_FEATURE_COLUMNS, out_dir / "feature_columns.pkl")

    cm = ConfusionMatrixDisplay.from_predictions(
        label_encoder.inverse_transform(cv["all_true"]),
        label_encoder.inverse_transform(cv["all_pred"]),
        labels=label_encoder.classes_,
    )
    cm.figure_.savefig(out_dir / "confusion_matrix_risk.png", dpi=150, bbox_inches="tight")
    plt.close(cm.figure_)

    return cv


def train_fire_source_model(df: pd.DataFrame, out_dir: Path) -> dict | None:
    counts = df["fire_source"].value_counts()
    usable_classes = counts[counts >= 5].index  # StratifiedKFold needs >= n_splits per class
    subset = df[df["fire_source"].isin(usable_classes)]

    if subset["fire_source"].nunique() < 2:
        return {
            "skipped": True,
            "reason": (
                f"Only {subset['fire_source'].nunique()} fire_source class(es) with "
                f">=5 examples in this dataset (counts: {counts.to_dict()}). "
                "Real class imbalance in this small/short-window pull — most "
                "hotspots in this region/season are genuine vegetation fires. "
                "Needs a larger or more geographically/seasonally diverse pull "
                "to train a meaningful multi-class fire-source model."
            ),
        }

    X = subset[FIRE_SOURCE_FEATURE_COLUMNS].apply(pd.to_numeric, errors="coerce").fillna(0)
    label_encoder = LabelEncoder()
    y = label_encoder.fit_transform(subset["fire_source"])

    n_splits = min(5, counts[usable_classes].min())
    cv = cross_validated_report(
        XGBClassifier,
        X, y, label_encoder,
        n_splits=n_splits,
        n_estimators=200, max_depth=5, learning_rate=0.05,
        objective="multi:softmax", num_class=len(label_encoder.classes_),
        eval_metric="mlogloss", tree_method="hist", n_jobs=-1, random_state=42,
    )
    cv["class_counts"] = counts.to_dict()
    cv["n_splits_used"] = n_splits

    final_model = XGBClassifier(
        n_estimators=200, max_depth=5, learning_rate=0.05,
        objective="multi:softmax", num_class=len(label_encoder.classes_),
        eval_metric="mlogloss", tree_method="hist", n_jobs=-1, random_state=42,
    )
    final_model.fit(X, y)

    joblib.dump(final_model, out_dir / "thermoguard_fire_source.pkl")
    joblib.dump(label_encoder, out_dir / "label_encoder_fire_source.pkl")
    joblib.dump(FIRE_SOURCE_FEATURE_COLUMNS, out_dir / "fire_source_features.pkl")

    return cv


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", required=True)
    parser.add_argument("--out-dir", default="output/models")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(args.data)
    print(f"Loaded {len(df)} rows from {args.data}")
    print("risk_level distribution:\n", df["risk_level"].value_counts())
    print("fire_source distribution:\n", df["fire_source"].value_counts())

    print("\nTraining risk model (5-fold stratified CV for an honest estimate)...")
    risk_cv = train_risk_model(df, out_dir)
    print(f"Risk model CV accuracy: {risk_cv['cv_mean_accuracy']:.4f} +/- {risk_cv['cv_std_accuracy']:.4f}")

    print("\nTraining fire-source model...")
    source_cv = train_fire_source_model(df, out_dir)
    if source_cv and source_cv.get("skipped"):
        print(f"SKIPPED: {source_cv['reason']}")
    elif source_cv:
        print(f"Fire-source model CV accuracy: {source_cv['cv_mean_accuracy']:.4f} +/- {source_cv['cv_std_accuracy']:.4f}")

    metrics = {
        "dataset_rows": len(df),
        "dataset_path": str(args.data),
        "risk_model": {k: v for k, v in risk_cv.items() if k not in ("all_true", "all_pred")},
        "fire_source_model": (
            {k: v for k, v in source_cv.items() if k not in ("all_true", "all_pred")}
            if source_cv
            else None
        ),
    }
    with open(out_dir / "metrics.json", "w") as f:
        json.dump(metrics, f, indent=2, default=str)

    print(f"\nWrote model artifacts + metrics.json to {out_dir}")


if __name__ == "__main__":
    main()
