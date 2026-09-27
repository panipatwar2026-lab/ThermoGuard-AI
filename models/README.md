# Models

All trained model artifacts, in one place. `backend/app/ml.py` is the
source of truth for which ones the running app actually loads.

## Active (loaded by `backend/app/ml.py`)

- `thermoguard_risk_v4.pkl`, `label_encoder_risk_v4.pkl`, `feature_columns_risk_v4.pkl`: risk model trained on 1,740,549 VIIRS S-NPP detections (Jan 2024-Jun 2025, all India), only from months with a published MCD64A1 burned-area outcome, without the `year` feature. Time holdout (train before 2025-03-28, test after): 80.94% accuracy, macro-F1 0.43 (Low 0.90, High 0.31, Medium 0.07).
- `thermoguard_fire_source_v4.pkl`, `fire_source_label_encoder_v4.pkl`, `fire_source_features_v4.pkl`: fire-source model, same pull, ESA WorldCover classes. Time holdout 82.10%, macro-F1 0.56.
- `metrics_v4.json`: full evaluation (5-fold CV, 70/30 random holdout, time holdout, per-class reports).

## Retired (not loaded by anything)

Kept for reference/rollback, not used by the app:

- `thermoguard_risk_v3.pkl`, `thermoguard_fire_source_v3.pkl` + their encoders/feature-columns: trained on MODIS (Jan 2025-Sep 2026). Every hotspot from Jul 2025 on was labelled Low because MCD64A1 wasn't published for those months yet; with `year` as a feature, v3 answered Low at 100% for every live input. Its reported 86.68% came from a random split over that data.
- `thermoguard_risk_v2.pkl` + its encoder/feature-columns — the risk model `thermoguard_risk_v3.pkl` replaced, trained on a deliberately small 1,472-row/10-day/1-region first pull. 81.6% CV accuracy; superseded because Medium-risk recall was too weak (F1 0.21) and the pull too narrow to generalize.
- `thermoguard_fire_source_v2.pkl`, `fire_source_label_encoder_v2.pkl`, `fire_source_features_v2.pkl` — the fire-source model `thermoguard_fire_source_v3.pkl` replaced, trained on a 30,196-row pull (Oct 2023-Jan 2024) heavily skewed toward Agricultural Fire (76% of rows), leaving Wildfire (F1 0.51-0.66) and the rarer classes weak.
- `thermoguard_best.pkl` + its encoder/feature-columns — the original (FRP-threshold-labeled) risk model, superseded by v2 then v3.
- `thermoguard_fire_source_model.pkl`, `fire_source_label_encoder.pkl`, `fire_source_features.pkl` — the original fire-source model, trained on FIRMS's own `type` field, superseded by v2 then v3.
- `thermoguard_model.pkl`, `thermoguard_lightgbm.pkl`, `thermoguard_xgboost.pkl`, `thermoguard_xgboost_strong.pkl`, `thermoguard_frp_model.pkl` + their encoders/feature-columns — alternate model variants from `../legacy/`'s training scripts, never the one actually served.
- `feature_columns.pkl`, `label_encoder.pkl` — outputs of `../legacy/train_model.py`.
