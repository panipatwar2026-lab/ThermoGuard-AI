# Models

All trained model artifacts, in one place. `backend/app/ml.py` is the
source of truth for which ones the running app actually loads.

## Active (loaded by `backend/app/ml.py`)

- `thermoguard_risk_v2.pkl`, `label_encoder_risk_v2.pkl`, `feature_columns_risk_v2.pkl` — the risk model, retrained on real burned-area outcome labels via `../data-pipeline/`. See its `README.md` and `output/models/metrics.json` for the honest evaluation.
- `thermoguard_fire_source_v2.pkl`, `fire_source_label_encoder_v2.pkl`, `fire_source_features_v2.pkl` — fire-source classifier, retrained on real ESA WorldCover land-cover classes via `../data-pipeline/sources/landcover.py`: 6 classes (Wildfire, Agricultural Fire, Industrial/Urban Fire, Offshore, Other, Unknown), trained on a 30,196-row pull (Oct 2023-Jan 2024, all India, spanning the Punjab/Haryana stubble-burning season). 82.0% CV accuracy overall, but heavily skewed by the majority Agricultural Fire class (76% of rows) — Wildfire F1 0.51, Industrial/Urban Fire F1 0.13, Offshore F1 0.07. Land cover is a correlate of likely fire source, not a confirmed-cause label. See `../data-pipeline/output/models/metrics.json` for the full per-class report.

## Retired (not loaded by anything)

Kept for reference/rollback, not used by the app:

- `thermoguard_best.pkl` + its encoder/feature-columns — the original (FRP-threshold-labeled) risk model `thermoguard_risk_v2.pkl` replaced.
- `thermoguard_fire_source_model.pkl`, `fire_source_label_encoder.pkl`, `fire_source_features.pkl` — the original fire-source model, trained on FIRMS's own `type` field, replaced by `thermoguard_fire_source_v2.pkl`.
- `thermoguard_model.pkl`, `thermoguard_lightgbm.pkl`, `thermoguard_xgboost.pkl`, `thermoguard_xgboost_strong.pkl`, `thermoguard_frp_model.pkl` + their encoders/feature-columns — alternate model variants from `../legacy/`'s training scripts, never the one actually served.
- `feature_columns.pkl`, `label_encoder.pkl` — outputs of `../legacy/train_model.py`.
