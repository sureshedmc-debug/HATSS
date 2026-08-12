"""ESP32 sensor data schemas."""

from datetime import datetime
from pydantic import BaseModel


class SensorReading(BaseModel):
    """Individual sensor reading."""
    fire: bool
    pir: bool
    gas: bool
    raw_gas: int = 0
    mq2_rating: int = 1
    water: int = 0
    raw_water: int = 0
    buzzer: bool = False
    muted: bool = False
    timestamp: datetime | None = None


class SensorStatus(BaseModel):
    """Current sensor status."""
    fire: bool
    pir: bool
    gas: bool
    raw_gas: int = 0
    mq2_rating: int = 1
    water: int = 0
    raw_water: int = 0
    buzzer: bool = False
    muted: bool = False
    last_update: str
    status: str = "connected"
