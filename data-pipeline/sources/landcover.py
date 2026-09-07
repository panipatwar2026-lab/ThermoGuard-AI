"""
Real fire-source ground truth via ESA WorldCover 10m land cover.

Public, anonymous S3 access (no account needed) — verified working:
    s3://esa-worldcover/v200/2021/map/ESA_WorldCover_10m_2021_v200_<TILE>_Map.tif

Tiles are named by the 3x3-degree cell they cover, e.g. "N18E072" for the
cell starting at 18N, 72E. WorldCover legend (v100/v200, ESA WorldCover
product user manual):

    10  Tree cover              50  Built-up
    20  Shrubland               60  Bare / sparse vegetation
    30  Grassland               70  Snow and ice
    40  Cropland                80  Permanent water bodies
    90  Herbaceous wetland      95  Mangroves
    100 Moss and lichen

Fire-source mapping: natural vegetation classes (10/20/30/90/95) -> Wildfire,
Cropland (40) -> Agricultural Fire, Built-up (50) -> Industrial/Urban Fire,
water (80) -> Offshore, bare/snow/moss (60/70/100) -> Other. This is a
land-cover correlate of likely fire source, not a confirmed-cause label.

Batched like sources/burned_area.py: each native tile is 36000x36000 (10m)
pixels — a per-row point read is a network round-trip per hotspot, ~1.5-4s
each once you account for query latency, so thousands of rows would take
tens of minutes. Instead this reads each unique tile ONCE at a decimated
resolution (COGs ship pre-built overview pyramids for exactly this), then
does all point lookups against the small in-memory array with numpy — for
a categorical fire-source label, 10m fidelity isn't needed anyway.
"""

import math

import numpy as np
import pandas as pd
import rasterio
from rasterio.enums import Resampling

WORLDCOVER_BUCKET = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map"

# Native tiles are 36000x36000; reading a decimated overview this size
# keeps each tile load to a few MB while preserving enough spatial detail
# (~90m/px at this decimation) to tell forest from cropland from urban.
OVERVIEW_SIZE = 1200

CLASS_TO_FIRE_SOURCE = {
    10: "Wildfire",              # Tree cover
    20: "Wildfire",              # Shrubland
    30: "Wildfire",              # Grassland
    40: "Agricultural Fire",     # Cropland
    50: "Industrial/Urban Fire",  # Built-up
    60: "Other",                 # Bare / sparse vegetation
    70: "Other",                 # Snow and ice
    80: "Offshore",              # Permanent water bodies
    90: "Wildfire",              # Herbaceous wetland
    95: "Wildfire",              # Mangroves
    100: "Other",                # Moss and lichen
}


def tile_name_for(lat: float, lon: float) -> str:
    """WorldCover tiles are 3x3 degrees, named by their lower-left corner."""
    lat0 = int(math.floor(lat / 3) * 3)
    lon0 = int(math.floor(lon / 3) * 3)
    ns = f"N{lat0:02d}" if lat0 >= 0 else f"S{abs(lat0):02d}"
    ew = f"E{lon0:03d}" if lon0 >= 0 else f"W{abs(lon0):03d}"
    return f"{ns}{ew}"


_tile_cache: dict[str, dict | None] = {}


def _load_tile(tile: str) -> dict | None:
    if tile in _tile_cache:
        return _tile_cache[tile]

    url = f"{WORLDCOVER_BUCKET}/ESA_WorldCover_10m_2021_v200_{tile}_Map.tif"
    try:
        with rasterio.Env(AWS_NO_SIGN_REQUEST="YES", AWS_REGION="eu-central-1"):
            with rasterio.open(url) as src:
                data = src.read(
                    1,
                    out_shape=(min(OVERVIEW_SIZE, src.height), min(OVERVIEW_SIZE, src.width)),
                    resampling=Resampling.nearest,
                )
                scale_x = src.width / data.shape[1]
                scale_y = src.height / data.shape[0]
                transform = src.transform * src.transform.scale(scale_x, scale_y)
                entry = {"data": data, "transform": transform}
    except rasterio.errors.RasterioIOError:
        entry = None

    _tile_cache[tile] = entry
    return entry


def fire_source_for(lat: float, lon: float) -> str:
    """Single-point lookup — convenience wrapper around the batched path."""
    tile = tile_name_for(lat, lon)
    entry = _load_tile(tile)
    if entry is None:
        return "Unknown"

    inv = ~entry["transform"]
    col, row = inv * (lon, lat)
    row, col = int(row), int(col)
    h, w = entry["data"].shape
    if not (0 <= row < h and 0 <= col < w):
        return "Unknown"

    value = int(entry["data"][row, col])
    return CLASS_TO_FIRE_SOURCE.get(value, "Unknown")


def label_landcover_batch(hotspots: pd.DataFrame) -> pd.Series:
    """hotspots: DataFrame with 'latitude', 'longitude'. Returns a Series
    of fire-source category strings, same index as `hotspots`."""
    tiles = [tile_name_for(lat, lon) for lat, lon in zip(hotspots["latitude"], hotspots["longitude"])]
    result = pd.Series("Unknown", index=hotspots.index, dtype=object)

    for tile in sorted(set(tiles)):
        entry = _load_tile(tile)
        if entry is None:
            continue

        row_mask = [t == tile for t in tiles]
        subset = hotspots.loc[row_mask]

        inv = ~entry["transform"]
        cols, rows = inv * (subset["longitude"].to_numpy(), subset["latitude"].to_numpy())
        rows = np.round(rows).astype(int)
        cols = np.round(cols).astype(int)

        h, w = entry["data"].shape
        in_bounds = (rows >= 0) & (rows < h) & (cols >= 0) & (cols < w)

        values = np.full(len(subset), -1, dtype=int)
        values[in_bounds] = entry["data"][rows[in_bounds], cols[in_bounds]]

        categories = [CLASS_TO_FIRE_SOURCE.get(int(v), "Unknown") for v in values]
        result.loc[subset.index] = categories

    return result
