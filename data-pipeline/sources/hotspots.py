"""
Raw hotspot detections via the NASA FIRMS Area API.

Unlike burned_area.py and landcover.py, this ONE source needs a
credential: a free MAP_KEY from https://firms.modaps.eosdis.nasa.gov/api/map_key/
(instant, free, no approval wait — just an email). This script can't run
without one, and it must NOT be committed to git — pass it via the
FIRMS_MAP_KEY environment variable.

API shape (documented at https://firms.modaps.eosdis.nasa.gov/api/area/):
    https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{AREA}/{DAY_RANGE}/{DATE}

- SOURCE: "MODIS_SP" / "VIIRS_SNPP_SP" for historical (standard processing)
  data — NRT sources only cover the last ~2 months.
- AREA: "west,south,east,north" bounding box, or "world".
- DAY_RANGE: 1-10 days per request (API limit) — this module chunks a
  longer date range into <=10-day requests automatically.
"""

import os
import time
from datetime import date, timedelta

import pandas as pd
import requests

FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
MAX_DAY_RANGE = 5  # archive (MODIS_SP) sources cap at 5 days per request

# India bounding box (west, south, east, north) — matches the plan's
# default geographic scope (see data-pipeline/README.md).
INDIA_BBOX = "68.0,6.0,97.5,37.5"


class MissingMapKeyError(RuntimeError):
    pass


def _map_key() -> str:
    key = os.environ.get("FIRMS_MAP_KEY") or os.environ.get("NASA_FIRMS_MAP_KEY")
    if not key:
        raise MissingMapKeyError(
            "FIRMS_MAP_KEY environment variable is not set. Register a free "
            "key at https://firms.modaps.eosdis.nasa.gov/api/map_key/ and set "
            "it before running this script — it must never be committed to git."
        )
    return key


def fetch_hotspots(
    start: date,
    end: date,
    source: str = "MODIS_SP",
    bbox: str = INDIA_BBOX,
    sleep_between_requests: float = 1.0,
) -> pd.DataFrame:
    """Fetch raw FIRMS hotspot detections for [start, end], chunked into
    <=10-day requests per the API's limit, concatenated into one DataFrame."""
    map_key = _map_key()

    frames = []
    cursor = start
    while cursor <= end:
        chunk_end = min(cursor + timedelta(days=MAX_DAY_RANGE - 1), end)
        day_range = (chunk_end - cursor).days + 1

        url = f"{FIRMS_BASE}/{map_key}/{source}/{bbox}/{day_range}/{cursor.isoformat()}"
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()

        from io import StringIO

        chunk = pd.read_csv(StringIO(resp.text))
        frames.append(chunk)

        cursor = chunk_end + timedelta(days=1)
        if cursor <= end:
            time.sleep(sleep_between_requests)

    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
