"""
Real risk ground truth via MODIS MCD64A1 monthly burned-area (v6.1).

Public, anonymous access via Microsoft Planetary Computer's STAC API —
verified working: no account needed, `planetary_computer.sign_inplace`
issues an anonymous SAS token per request.

MCD64A1's "Burn Date" band (per the product user guide) is a 500m raster,
gridded into MODIS sinusoidal tiles (h/v), one monthly granule per tile:
    0        = not burned this month
    1-366    = day of year burned
    -1       = not processed / no data (commonly water or missing input)
    -2       = water mask

This module answers, for a batch of hotspots: did a burned-area pixel
appear at each location within `window_days` following detection? That
becomes the real basis for `risk_level` — replacing the FRP-threshold
bucket the original dataset used.

Batched by (year, month, tile) rather than per-row: at India-wide, multi-
year scale (~1.5M raw hotspots for a 3-year pull) a naive per-row STAC
search + raster open is a network round-trip per row — weeks of runtime.
Batching opens each monthly tile raster exactly once (a few hundred opens
total for 3 years x ~15 tiles covering India x 2 months per row's window),
then does all point lookups against the in-memory array with numpy.
"""

from collections import OrderedDict
from datetime import date

import numpy as np
import pandas as pd
import planetary_computer
import pystac_client
import rasterio
from rasterio.warp import transform as warp_transform

STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
COLLECTION = "modis-64A1-061"

_catalog = None
# item.id -> {"data": ndarray, "crs":..., "transform":...}. LRU-bounded: each
# tile is ~11 MB in memory and a multi-year pull touches hundreds of them.
_raster_cache: "OrderedDict[str, dict | None]" = OrderedDict()
_RASTER_CACHE_MAX = 48


def _get_catalog():
    global _catalog
    if _catalog is None:
        _catalog = pystac_client.Client.open(STAC_URL, modifier=planetary_computer.sign_inplace)
    return _catalog


def _month_items(bbox: list[float], year: int, month: int):
    """One STAC search per (bbox, year, month) — cached implicitly by the
    caller iterating unique months once."""
    start = date(year, month, 1)
    end_month = month + 1 if month < 12 else 1
    end_year = year if month < 12 else year + 1
    end = date(end_year, end_month, 1)

    catalog = _get_catalog()
    search = catalog.search(collections=[COLLECTION], bbox=bbox, datetime=f"{start.isoformat()}/{end.isoformat()}")
    return list(search.items())


def _cache_put(key: str, value: dict | None) -> None:
    _raster_cache[key] = value
    _raster_cache.move_to_end(key)
    while len(_raster_cache) > _RASTER_CACHE_MAX:
        _raster_cache.popitem(last=False)


def _load_tile(item) -> dict | None:
    if item.id in _raster_cache:
        _raster_cache.move_to_end(item.id)
        return _raster_cache[item.id]

    asset = item.assets.get("Burn_Date")
    if asset is None:
        _cache_put(item.id, None)
        return None

    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR"):
        with rasterio.open(asset.href) as src:
            data = src.read(1)
            entry = {"data": data, "crs": src.crs, "transform": src.transform, "bounds": src.bounds}

    _cache_put(item.id, entry)
    return entry


def _integral_image(mask: np.ndarray) -> np.ndarray:
    """Summed-area table for O(1) rectangle-sum neighborhood queries."""
    return mask.astype(np.int32).cumsum(axis=0).cumsum(axis=1)


def _rect_sum(integral: np.ndarray, r0: int, r1: int, c0: int, c1: int) -> int:
    """Sum of mask over rows [r0,r1), cols [c0,c1) using an integral image."""
    h, w = integral.shape
    r0, r1 = max(r0, 0), min(r1, h)
    c0, c1 = max(c0, 0), min(c1, w)
    if r1 <= r0 or c1 <= c0:
        return 0
    total = integral[r1 - 1, c1 - 1]
    if r0 > 0:
        total -= integral[r0 - 1, c1 - 1]
    if c0 > 0:
        total -= integral[r1 - 1, c0 - 1]
    if r0 > 0 and c0 > 0:
        total += integral[r0 - 1, c0 - 1]
    return int(total)


def label_burned_batch(
    hotspots: pd.DataFrame,
    bbox: list[float],
    window_days: int = 30,
    neighborhood_px: int = 5,
) -> pd.DataFrame:
    """
    hotspots: DataFrame with 'latitude', 'longitude', 'acq_date' (YYYY-MM-DD).

    Returns a DataFrame (same row order/index) with columns:
        burned (bool), burn_day_of_year (float, NaN if none),
        neighborhood_burned_pixels (int),
        checked (bool): False when MCD64A1 had no granule for the hotspot's
            month or the following one. Those rows have NO outcome, and must
            not be treated as "not burned" (MCD64A1 publishes months late).
    """
    dates = pd.to_datetime(hotspots["acq_date"])
    year_months = sorted({(d.year, d.month) for d in dates})

    result = pd.DataFrame(
        {
            "burned": False,
            "burn_day_of_year": np.nan,
            "neighborhood_burned_pixels": 0,
            "checked": False,
        },
        index=hotspots.index,
    )

    half = neighborhood_px // 2

    for year, month in year_months:
        # A hotspot's `window_days`-following window can spill into next
        # month; checking this month + next covers the common case without
        # tracking exact day-level spans per row.
        months_to_check = [(year, month)]
        next_month = month + 1 if month < 12 else 1
        next_year = year if month < 12 else year + 1
        if window_days > 0:
            months_to_check.append((next_year, next_month))

        row_mask = (dates.dt.year == year) & (dates.dt.month == month)
        subset = hotspots.loc[row_mask]
        if subset.empty:
            continue

        month_items = {ym: _month_items(bbox, *ym) for ym in months_to_check}
        # Only an outcome if every month the burn window spans is published.
        if all(month_items.values()):
            result.loc[subset.index, "checked"] = True

        for check_year, check_month in months_to_check:
            items = month_items[(check_year, check_month)]
            for item in items:
                tile = _load_tile(item)
                if tile is None:
                    continue

                lons = subset["longitude"].to_numpy()
                lats = subset["latitude"].to_numpy()
                xs, ys = warp_transform("EPSG:4326", tile["crs"], lons.tolist(), lats.tolist())

                inv = ~tile["transform"]
                cols, rows = inv * (np.array(xs), np.array(ys))
                rows = np.round(rows).astype(int)
                cols = np.round(cols).astype(int)

                h, w = tile["data"].shape
                in_bounds = (rows >= 0) & (rows < h) & (cols >= 0) & (cols < w)
                if not in_bounds.any():
                    continue

                burned_mask = tile["data"] > 0
                integral = _integral_image(burned_mask)

                for local_idx, (r, c, ok) in enumerate(zip(rows, cols, in_bounds)):
                    if not ok:
                        continue
                    idx = subset.index[local_idx]

                    neighbor_count = _rect_sum(integral, r - half, r + half + 1, c - half, c + half + 1)
                    if neighbor_count > result.at[idx, "neighborhood_burned_pixels"]:
                        result.at[idx, "neighborhood_burned_pixels"] = neighbor_count

                    center_value = int(tile["data"][r, c])
                    if center_value > 0 and not result.at[idx, "burned"]:
                        result.at[idx, "burned"] = True
                        result.at[idx, "burn_day_of_year"] = center_value

    return result
