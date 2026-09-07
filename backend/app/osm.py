"""
Infrastructure proximity lookup via OpenStreetMap's Overpass API.

Given a lat/lon, counts nearby industrial land, roads, and settlements
within a 5km radius and reports the distance to the nearest of each —
used by the dashboard's risk panel to contextualize a hotspot.
"""

import math

import requests

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
SEARCH_RADIUS_M = 5000


def _overpass_query(lat: float, lon: float) -> str:
    return f"""
    [out:json][timeout:25];
    (
      nwr(around:{SEARCH_RADIUS_M},{lat},{lon})["landuse"="industrial"];
      nwr(around:{SEARCH_RADIUS_M},{lat},{lon})["industrial"];
      way(around:{SEARCH_RADIUS_M},{lat},{lon})["highway"];
      nwr(around:{SEARCH_RADIUS_M},{lat},{lon})["place"~"city|town|village|suburb"];
    );
    out center;
    """


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius_km = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    return earth_radius_km * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _format_distance(km: float | None) -> str | None:
    if km is None:
        return None
    if km < 1:
        return f"{round(km * 1000)} m"
    return f"{km:.2f} km"


def fetch_infrastructure(lat: float, lon: float) -> dict:
    resp = requests.post(
        OVERPASS_URL,
        data=_overpass_query(lat, lon),
        headers={
            "Content-Type": "text/plain",
            "User-Agent": "ThermoGuard-AI/1.0 (wildfire risk dashboard)",
        },
        timeout=30,
    )
    resp.raise_for_status()
    elements = resp.json().get("elements", [])

    counts = {"industrial": 0, "roads": 0, "settlements": 0}
    nearest: dict[str, float | None] = {"industrial": None, "roads": None, "settlements": None}

    for el in elements:
        tags = el.get("tags", {})
        el_lat = el.get("lat")
        el_lon = el.get("lon")
        if el_lat is None or el_lon is None:
            center = el.get("center") or {}
            el_lat, el_lon = center.get("lat"), center.get("lon")
        if el_lat is None or el_lon is None:
            continue

        dist = _haversine_km(lat, lon, el_lat, el_lon)

        if tags.get("landuse") == "industrial" or tags.get("industrial"):
            counts["industrial"] += 1
            nearest["industrial"] = dist if nearest["industrial"] is None else min(nearest["industrial"], dist)
        if tags.get("highway"):
            counts["roads"] += 1
            nearest["roads"] = dist if nearest["roads"] is None else min(nearest["roads"], dist)
        if tags.get("place") in ("city", "town", "village", "suburb"):
            counts["settlements"] += 1
            nearest["settlements"] = dist if nearest["settlements"] is None else min(nearest["settlements"], dist)

    return {
        "success": True,
        "source": "OpenStreetMap",
        "searchRadius": "5 km",
        "location": {"latitude": lat, "longitude": lon},
        "industrial": {"count": counts["industrial"], "nearest": _format_distance(nearest["industrial"])},
        "roads": {"count": counts["roads"], "nearest": _format_distance(nearest["roads"])},
        "settlements": {"count": counts["settlements"], "nearest": _format_distance(nearest["settlements"])},
    }
