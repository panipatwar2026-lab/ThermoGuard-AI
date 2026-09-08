"""
Live NASA FIRMS hotspot feed for the dashboard map.

Unlike data-pipeline/sources/hotspots.py (which pulls a multi-day archive
for training), this fetches one live single-day pull for the dashboard's
map. Needs a free MAP_KEY from
https://firms.modaps.eosdis.nasa.gov/api/map_key/ — pass it via the
NASA_FIRMS_MAP_KEY environment variable. Must never be committed to git.
"""

import csv
import io
import os

import requests

FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
DEFAULT_SOURCE = "VIIRS_SNPP_NRT"

# India bounding box (west, south, east, north) — dashboard's default scope,
# matches the map's INDIA_BOUNDS in HotspotMap.tsx.
INDIA_BBOX = "68.0,6.0,97.5,37.5"


class MissingMapKeyError(RuntimeError):
    pass


def _map_key() -> str:
    key = os.environ.get("NASA_FIRMS_MAP_KEY")
    if not key:
        raise MissingMapKeyError(
            "NASA_FIRMS_MAP_KEY environment variable is not set. Register a "
            "free key at https://firms.modaps.eosdis.nasa.gov/api/map_key/ "
            "and set it before running the server."
        )
    return key


def fetch_live_fires(
    bbox: str = INDIA_BBOX,
    days: int = 1,
    source: str = DEFAULT_SOURCE,
) -> list[dict]:
    """Fetch the latest `days` of FIRMS hotspots for `bbox`, as a list of
    row dicts keyed by the CSV's own column names."""
    map_key = _map_key()
    url = f"{FIRMS_BASE}/{map_key}/{source}/{bbox}/{days}"
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()

    reader = csv.DictReader(io.StringIO(resp.text))
    return list(reader)
