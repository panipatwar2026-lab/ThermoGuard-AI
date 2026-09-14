# Models

All trained model artifacts, in one place. `backend/app/ml.py` is the
source of truth for which ones the running app actually loads.

## Active (loaded by `backend/app/ml.py`)

- `thermoguard_risk_v3.pkl`, `label_encoder_risk_v3.pkl`, `feature_columns_risk_v3.pkl` — the risk model, retrained on a 248,308-row pull (Jan 2025-Sep 2026, all India) via `../data-pipeline/`, replacing v2's 1,472-row/10-day/1-region first pass. Fit with sqrt-dampened class-balanced sample weights (`train.py`'s `softened_sample_weight`) so the small Medium-risk class stays learnable instead of getting swamped by the 84%-majority Low class. 86.68% 70/30 holdout test accuracy (86.79% 5-fold CV mean). Low F1 0.94, High F1 0.68, Medium F1 0.27 (up from v2's 0.21, still the weakest class). See `../data-pipeline/output/models_2025_2026_softened/metrics.json` for the full evaluation.
- `thermoguard_fire_source_v3.pkl`, `fire_source_label_encoder_v3.pkl`, `fire_source_features_v3.pkl` — fire-source classifier, same 248,308-row pull and sqrt-dampened weighting, 6 classes (Wildfire, Agricultural Fire, Industrial/Urban Fire, Offshore, Other, Unknown). 82.17% 70/30 holdout test accuracy (82.51% 5-fold CV mean). Wildfire F1 0.86 (up sharply from v2's 0.51-0.66), Agricultural Fire F1 0.81, Industrial/Urban Fire F1 0.53, Other F1 0.59, Offshore F1 0.18, Unknown F1 0.64. Land cover is a correlate of likely fire source, not a confirmed-cause label. See `../data-pipeline/output/models_2025_2026_softened/metrics.json` for the full per-class report and how the weighting was tuned (plain fitting on this distribution let minority classes get ignored; full inverse-frequency balancing overcorrected — precision collapsed on the rarest classes even though recall rose, net macro-F1 down; sqrt damping was the best of the three tried).

## Retired (not loaded by anything)

Kept for reference/rollback, not used by the app:

- `thermoguard_risk_v2.pkl` + its encoder/feature-columns — the risk model `thermoguard_risk_v3.pkl` replaced, trained on a deliberately small 1,472-row/10-day/1-region first pull. 81.6% CV accuracy; superseded because Medium-risk recall was too weak (F1 0.21) and the pull too narrow to generalize.
- `thermoguard_fire_source_v2.pkl`, `fire_source_label_encoder_v2.pkl`, `fire_source_features_v2.pkl` — the fire-source model `thermoguard_fire_source_v3.pkl` replaced, trained on a 30,196-row pull (Oct 2023-Jan 2024) heavily skewed toward Agricultural Fire (76% of rows), leaving Wildfire (F1 0.51-0.66) and the rarer classes weak.
- `thermoguard_best.pkl` + its encoder/feature-columns — the original (FRP-threshold-labeled) risk model, superseded by v2 then v3.
- `thermoguard_fire_source_model.pkl`, `fire_source_label_encoder.pkl`, `fire_source_features.pkl` — the original fire-source model, trained on FIRMS's own `type` field, superseded by v2 then v3.
- `thermoguard_model.pkl`, `thermoguard_lightgbm.pkl`, `thermoguard_xgboost.pkl`, `thermoguard_xgboost_strong.pkl`, `thermoguard_frp_model.pkl` + their encoders/feature-columns — alternate model variants from `../legacy/`'s training scripts, never the one actually served.
- `feature_columns.pkl`, `label_encoder.pkl` — outputs of `../legacy/train_model.py`.
