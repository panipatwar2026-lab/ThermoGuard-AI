# ThermoGuard AI

AI-based wildfire risk prediction and fire source analysis, built on NASA satellite hotspot telemetry (brightness, FRP, scan/track geometry, day/night, confidence).

The project has three active parts:

- **`backend/`** — a FastAPI service that loads the trained XGBoost models and exposes prediction, fire-source classification, PDF-report, live NASA FIRMS hotspot, and OSM infrastructure-proximity endpoints.
- **`frontend/`** — a React + TypeScript + Tailwind CSS app with two routes: `/` is a live command-center dashboard (map of NASA FIRMS hotspots, heuristic risk gauge, forecast panel), and `/analyze` is the ML risk-prediction flow (live-slider simulator, fire location map, downloadable PDF report). Selecting a hotspot on the dashboard and running "AI Prediction" carries its fields into `/analyze` to prefill a real model prediction.
- **`data-pipeline/`** — builds real, sourced training data (real burned-area outcomes, real land-cover classes) and trains the models `backend/` serves. See `data-pipeline/README.md`.

Trained model artifacts live in `models/` (see `models/README.md` for which ones are actually active vs. retired). Superseded training scripts and old evaluation artifacts live in `legacy/`, kept for reference only.

## Quickest start: Docker

No Python, Node, or dependency installs needed on the machine — Docker reproduces the exact same environment every time, on any OS.

**1. Install Docker**
- Windows/Mac: install [Docker Desktop](https://www.docker.com/products/docker-desktop/), then open it once (accept any first-launch prompts — on Windows this enables the WSL2 backend).
- Linux: install `docker` + the `docker compose` plugin via your package manager, or Docker's official install script.

**2. Verify it's working**
```bash
docker --version
docker compose version
```
Both should print version numbers with no errors.

**3. Get the code**
```bash
git clone https://github.com/mithil98/THERMOGUARD-ML.git
cd THERMOGUARD-ML
```
(No git on this machine? Download the repo as a ZIP from GitHub and extract it instead.)

**4. Run it**
```bash
docker compose up --build
```
First run downloads base images and installs all dependencies inside the containers — a few minutes. Every run after that is fast (cached).

**5. Open it**
- Frontend: **http://localhost:3000**
- Backend API: **http://localhost:8000** (interactive docs at `/docs`)

The frontend container serves the built app and proxies `/api/*` to the backend container internally — nothing else to configure.

**6. Stop it**
```bash
docker compose down
```
(`Ctrl+C` in the same terminal also works if it's running in the foreground. Add `-v` to `down` to also remove any anonymous volumes.)

**7. Run it again later** (no rebuild needed unless the code changed)
```bash
docker compose up -d
```

Skip to [Manual setup](#manual-setup-without-docker) below if you'd rather run the backend/frontend directly instead of through Docker.

## Manual setup (without Docker)

### Prerequisites

| Tool | Version | Check |
|---|---|---|
| Python | 3.10+ | `python --version` |
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |

### 1. Clone the repo

```bash
git clone https://github.com/mithil98/THERMOGUARD-ML.git
cd THERMOGUARD-ML
```

### 2. Backend setup (FastAPI)

From the repo root:

```bash
python -m venv venv

# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

pip install -r backend/requirements.txt
```

The dashboard's live hotspot feed needs a free NASA FIRMS key — register at
https://firms.modaps.eosdis.nasa.gov/api/map_key/ (instant, no approval wait)
and set it as an environment variable before starting the server (never commit it):

```bash
# Windows
set NASA_FIRMS_MAP_KEY=your-key-here
# macOS / Linux
export NASA_FIRMS_MAP_KEY=your-key-here
```

Run the API server (from the repo root, so it can find the `.pkl` model files):

```bash
uvicorn backend.app.main:app --reload --port 8000
```

Verify it's up:

```bash
curl http://localhost:8000/api/health
# {"risk_model_ready":true,"fire_source_model_ready":true,"error":null}
```

Interactive API docs: http://localhost:8000/docs

### 3. Frontend setup (React + Vite)

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. The dev server proxies `/api/*` requests to the backend on port 8000 (see `frontend/vite.config.ts`), so both servers need to be running.

### 4. Using the app

1. Fill in the satellite hotspot parameters (location, brightness, FRP, acquisition time, etc.) — sensible defaults are pre-filled.
2. Drag the **Live Fire Risk Interaction** sliders to see the risk level and probabilities update in real time.
3. Click **Analyze Fire Risk** for the full report: risk level, fire source classification, intensity/thermal/temporal analysis, alert assessment, probability breakdown, and a location map.
4. Click **Download PDF Report** to save a formatted report of the current analysis.

### 5. Production build (manual)

```bash
cd frontend
npm run build      # outputs to frontend/dist
npm run preview    # serve the production build locally
```

Serve `frontend/dist` with any static host, and run the backend with a production ASGI server, e.g.:

```bash
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

Update the frontend's API base URL / proxy configuration if the backend isn't reachable at the same origin in production. (The Docker setup above already does this via the nginx `/api/` proxy in `frontend/nginx.conf`.)

## Project structure

```
THERMOGUARD-ML/
├── docker-compose.yml         # wires backend + frontend containers together
├── backend/
│   ├── Dockerfile
│   ├── app/
│   │   ├── main.py        # FastAPI app, route wiring
│   │   ├── ml.py           # model loading, feature engineering, prediction
│   │   ├── firms.py         # live NASA FIRMS hotspot feed (dashboard map)
│   │   ├── osm.py            # OSM Overpass infrastructure-proximity lookup
│   │   ├── report.py          # PDF report generation
│   │   └── schemas.py          # request/response models
│   └── requirements.txt
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf              # serves the built app + proxies /api to the backend
│   ├── src/
│   │   ├── pages/            # DashboardPage (landing) + AnalyzePage (ML prediction), routed via react-router
│   │   ├── components/     # UI sections (form, results, charts, map, ...)
│   │   ├── components/dashboard/ # live hotspot map, risk/forecast panels
│   │   ├── components/fx/   # animated UI primitives
│   │   ├── lib/               # API client, helpers, heuristic risk scorer
│   │   └── App.tsx
│   └── package.json
├── data-pipeline/              # real, sourced training data + the canonical train.py
│   ├── sources/                  # hotspots.py (FIRMS), burned_area.py, landcover.py
│   ├── build_dataset.py            # orchestrates sources/ into a labeled dataset
│   ├── train.py                     # trains + evaluates the risk/fire-source models
│   └── README.md                     # data sourcing details, scope decisions, known limits
├── models/                      # every trained .pkl — see models/README.md for active vs. retired
├── legacy/                      # superseded training scripts, kept for reference — see legacy/README.md
├── docs/                        # Dashboard_Design.md (frontend style reference), old sample PDF report
├── .gitignore / .dockerignore
└── README.md
```

## Important limitations

- **Risk model (v3, currently live)** is trained on real, sourced outcome labels — did the hotspot correspond to an actual MODIS-mapped burn (`data-pipeline/`) — instead of the original FRP-threshold-derived label. Retrained on a 248,308-row pull (Jan 2025-Sep 2026, all India), fit with sqrt-dampened class-balanced sample weights so the small Medium-risk class doesn't get ignored by the 84%-majority Low class. Honestly evaluated at **86.68% 70/30 holdout test accuracy** (86.79% 5-fold CV mean): strong on Low (F1 0.94), moderate on High (F1 0.68), Medium improved to F1 0.27 but remains the weakest, genuinely ambiguous middle class. See `data-pipeline/output/models_2025_2026_softened/metrics.json` for the full report.
- **Fire Detection** is a preliminary rule-based thermal screening (FRP ≥ 2.40 and brightness difference ≥ 15), not a separately trained binary Fire/No-Fire classifier.
- **Fire Source model (v3, currently live)** is a 6-class classifier (Wildfire, Agricultural Fire, Industrial/Urban Fire, Offshore, Other, Unknown) trained on real ESA WorldCover land-cover classes via `data-pipeline/sources/landcover.py`, on the same 248,308-row, Jan 2025-Sep 2026, all-India pull. **82.17% 70/30 holdout test accuracy** (82.51% 5-fold CV mean). Strong on Wildfire (F1 0.86) and Agricultural Fire (F1 0.81), moderate on Industrial/Urban Fire (F1 0.53) and Other (F1 0.59), weakest on Offshore (F1 0.18) and Unknown (F1 0.64) — both several times larger in absolute row count than the previous pull but still the rarest classes. Land cover at the hotspot's location is a correlate of likely fire source, **not a confirmed cause** — see `data-pipeline/output/models_2025_2026_softened/metrics.json` for the full per-class report and `data-pipeline/README.md` for how the pull and class-weighting were tuned.
