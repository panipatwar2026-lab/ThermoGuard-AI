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

import requests

from .retry import retry_with_backoff

logger = logging.getLogger(__name__)

FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
MAPKEY_STATUS_URL = "https://firms.modaps.eosdis.nasa.gov/mapserver/mapkey_status/"
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


def check_map_key_status(map_key: str) -> dict:
    """Diagnostic-only: hits FIRMS's lightweight key-status endpoint (not
    fetch_live_fires's real area/csv endpoint) to isolate whether the
    server's egress can reach the FIRMS host at all. Never returns the raw
    key or a full URL — safe to return straight from an API response."""
    try:
        resp = requests.get(MAPKEY_STATUS_URL, params={"MAP_KEY": map_key}, timeout=15)
    except requests.RequestException as e:
        return {
            "dns_reachable": False,
            "error_type": type(e).__name__,
            "error": _redact_key(str(e), map_key),
        }

    try:
        body = resp.json()
    except ValueError:
        body = resp.text[:500]

    return {
        "dns_reachable": True,
        "firms_status": resp.status_code,
        "firms_response": body,
    }
