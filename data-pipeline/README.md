# ThermoGuard AI — Data Pipeline

Builds a real, sourced, reproducible training dataset — replacing the
untraceable `data_cleaned.csv` the original models were trained on (not in
this repo, no documented origin, `risk_level` almost certainly an
FRP-threshold bucket rather than a real outcome).

## What this replaces

| Old | New |
|---|---|
| `risk_level` — undocumented column in a missing CSV, appears FRP-threshold-derived | Did the hotspot actually correspond to a mapped burn within 30 days, and how large (nearby burned-pixel count)? Sourced from MODIS MCD64A1 burned-area. |
| `fire_source` — trained on FIRMS's own `type` field, which nearly answers the question directly | Real land-cover class at the hotspot's location, sourced from ESA WorldCover 10m: **Wildfire** (tree/shrub/grass/wetland/mangrove), **Agricultural Fire** (cropland), **Industrial/Urban Fire** (built-up), **Offshore** (water), **Other** (bare/snow/moss). |

## Data sources

| Source | What | Access | Status |
|---|---|---|---|
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/area/) | Raw MODIS/VIIRS hotspot detections | **Needs a free MAP_KEY** — see below | Code written, **not yet run** |
| [MODIS MCD64A1 (v6.1)](https://planetarycomputer.microsoft.com/dataset/modis-64A1-061) via Microsoft Planetary Computer | Monthly 500m burned-area | Anonymous, no account — verified working | Verified working end-to-end |
| [ESA WorldCover 10m](https://esa-worldcover.org/) via public AWS S3 | Land cover classification | Anonymous (`--no-sign-request`) — verified working | Verified working end-to-end |

### Verified today (no credentials needed)

Both `sources/burned_area.py` and `sources/landcover.py` were tested against real coordinates:

- A real MCD64A1 burned pixel from the Feb 2021 Similipal (Odisha) fires was located directly in the raw raster, then round-tripped through `burned_outcome_for()` — it correctly reported `burned=True`, the exact matching day-of-year, and a non-zero neighborhood burned-pixel count.
- `fire_source_for()` correctly classified Sanjay Gandhi National Park (Mumbai) as `Wildfire` (tree cover) and central Mumbai as `Industrial/Urban Fire` (built-up).
- `build_dataset.py`'s full feature-engineering + labeling join was dry-run against two synthetic FIRMS-shaped rows (one at the verified burn location, one at a no-fire location) and produced correct `High` / `Low` labels with all 35 features matching `backend/app/ml.py`'s schema exactly.

### Blocked on you: NASA FIRMS MAP_KEY

I can't register this myself — creating accounts on your behalf is off the table. It's genuinely quick:

1. Go to <https://firms.modaps.eosdis.nasa.gov/api/map_key/>, sign up free (just an email, instant).
2. Set it as an environment variable — **never commit it to git**:
   ```bash
   export FIRMS_MAP_KEY=your_key_here      # macOS/Linux
   $env:FIRMS_MAP_KEY = "your_key_here"    # PowerShell
   ```
3. Run: `python build_dataset.py --start 2023-01-01 --end 2025-12-31 --out output/data_cleaned.csv`

## Scope decisions (defaults — revisit anytime)

- **Geography**: India (`sources/hotspots.py`'s `INDIA_BBOX`), matching the app's default coordinates and keeping data volume tractable on a local machine.
- **Time range**: last ~3 years (pass explicitly via `--start`/`--end`).
- **Compute**: this local machine — both real data sources use windowed/COG reads (only the needed pixels are fetched), not bulk downloads, so this stays feasible without cloud compute.

### Getting a balanced `fire_source` pull

The first pull (1 region, 10 days) landed 1449/1472 rows as `Wildfire` — only 15
`Industrial/Urban Fire`, 4 `Offshore`, 0 `Agricultural Fire` with enough
samples to train on. `INDIA_BBOX` already covers the whole country, so a
wider pull is mostly about **date range/season**, not geography — target the
Punjab/Haryana stubble-burning season (roughly Oct-Dec) to get real
`Agricultural Fire` representation:

```bash
python build_dataset.py --start 2023-10-01 --end 2024-01-15 --out output/data_cleaned.csv
```

`train.py`'s fire-source trainer silently drops any class with fewer than 5
examples (`counts >= 5` guard, needed for `StratifiedKFold`) — after a pull,
check `dataset["fire_source"].value_counts()` (printed at the end of
`build_dataset.py`) before assuming all 5 classes will actually train.

## Known limitations to refine in Phase 2

- **Burn size proxy**: `neighborhood_burned_pixels` (a small window around each hotspot) stands in for true fire-perimeter size, which would need connected-component analysis across burned pixels — a reasonable first pass, not physically precise. Risk thresholds in `label_risk()` are a first-pass modeling choice.
- **Offshore land cover**: ESA WorldCover doesn't publish tiles for open ocean far from any coastline, so genuinely offshore hotspots currently classify as `Unknown` rather than `Offshore` — needs a coastline/bathymetry fallback.
- **FRP is kept as a reference column, not a model feature** (matches `train_best.py`'s leakage exclusion), but is no longer needed for the risk label itself now that risk comes from real burn outcomes — worth re-evaluating whether it's useful as a feature at all once real labels are flowing.

## Files

- `sources/hotspots.py` — FIRMS ingestion (needs `FIRMS_MAP_KEY`)
- `sources/burned_area.py` — real risk ground truth (Planetary Computer, no credential)
- `sources/landcover.py` — real fire-source ground truth (AWS S3, no credential)
- `build_dataset.py` — orchestrates all three into a `data_cleaned.csv`-equivalent, feature-engineered identically to `backend/app/ml.py`
