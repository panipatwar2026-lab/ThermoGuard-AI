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
import logging
import os
from concurrent.futures import ThreadPoolExecutor

import requests

from .retry import retry_with_backoff

logger = logging.getLogger(__name__)

FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
DEFAULT_SOURCE = "VIIRS_SNPP_NRT"

# All near-real-time satellites. Each passes over India at different times
# and NASA publishes each on its own lag, so any single one can have no
# rows for "today" while the others already do. Merging gives the latest
# available detections.
NRT_SOURCES = ("VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "MODIS_NRT")

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


def _redact_key(text: str, map_key: str) -> str:
    """Strip the raw MAP_KEY out of a requests exception message — those
    messages often embed the full request URL, which for fetch_live_fires
    has the key in the path itself."""
    return text.replace(map_key, "***") if map_key else text


def fetch_live_fires(
    bbox: str = INDIA_BBOX,
    days: int = 1,
    source: str = DEFAULT_SOURCE,
) -> list[dict]:
    """Fetch the latest `days` of FIRMS hotspots for `bbox`, as a list of
    row dicts keyed by the CSV's own column names."""
    map_key = _map_key()
    url = f"{FIRMS_BASE}/{map_key}/{source}/{bbox}/{days}"

    logger.info("FIRMS request started source=%s bbox=%s days=%s", source, bbox, days)

    def _get() -> requests.Response:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        return resp

    try:
        resp = retry_with_backoff(_get, attempts=3, base_delay_s=1.0)
    except requests.RequestException as e:
        logger.error(
            "FIRMS request failed source=%s bbox=%s error_type=%s error=%s",
            source,
            bbox,
            type(e).__name__,
            _redact_key(str(e), map_key),
        )
        raise

    logger.info(
        "FIRMS request succeeded source=%s bbox=%s status=%s",
        source,
        bbox,
        resp.status_code,
    )

    reader = csv.DictReader(io.StringIO(resp.text))
    return list(reader)



def fetch_latest_fires(bbox: str = INDIA_BBOX, days: int = 1) -> list[dict]:
    """Fetch every NRT_SOURCES feed in parallel and merge the rows, each
    tagged with its `source`. One failing satellite is skipped; raises only
    if all of them fail."""
    _map_key()  # fail fast with MissingMapKeyError, not one per thread

    def _one(source: str):
        try:
            return source, fetch_live_fires(bbox=bbox, days=days, source=source)
        except requests.RequestException as e:
            return source, e

    with ThreadPoolExecutor(max_workers=len(NRT_SOURCES)) as pool:
        results = list(pool.map(_one, NRT_SOURCES))

    errors = [r for _, r in results if isinstance(r, Exception)]
    if len(errors) == len(results):
        raise errors[0]

    rows = []
    for source, result in results:
        if not isinstance(result, Exception):
            rows.extend({**row, "source": source} for row in result)
    # Newest first; acq_time is HHMM without zero padding.
    rows.sort(key=lambda r: (r.get("acq_date", ""), int(r.get("acq_time") or 0)), reverse=True)
    return rows
