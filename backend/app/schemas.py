from datetime import date, time
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class PredictRequest(BaseModel):
    latitude: float = Field(20.0, ge=-90, le=90)
    longitude: float = Field(73.0, ge=-180, le=180)
    brightness: float = 330.0
    scan: float = 1.0
    track: float = 1.0
    acq_time: int = Field(1200, ge=0, le=2359)
    confidence: Literal["h", "l", "n"] = "h"
    version: Literal["2.0NRT"] = "2.0NRT"
    daynight: Literal["D", "N"] = "D"
    # FIRMS type: 0 vegetation, 2 other static land, 3 offshore. -1 kept
    # for old clients but never appears in training data.
    fire_type: Literal[-1, 0, 2, 3] = 0
    bright_t31: float = 310.0
    frp: float = Field(5.0, ge=0)
    observation_date: date
    observation_time: time

    @field_validator("acq_time")
    @classmethod
    def _hhmm(cls, v: int) -> int:
        if v % 100 >= 60:
            raise ValueError("acq_time must be HHMM with minutes < 60")
        return v


class RiskProbability(BaseModel):
    risk_level: str
    probability: float


class PredictResponse(BaseModel):
    predicted_risk: str
    confidence_score: float
    prediction_proba: list[RiskProbability]

    fire_source: str
    fire_source_confidence: float

    fire_detected: bool
    brightness_difference: float

    intensity: str
    intensity_message: str

    thermal_status: str
    thermal_message: str

    season: str

    latitude: float
    longitude: float
    brightness: float
    frp: float
    daynight: str
