"""ESP32 sensor endpoints."""

import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from app.schemas.sensors import SensorStatus
from app.services.esp32_sensors import update_sensors, get_sensor_status, get_alert_status
from app.services.intrusion_detector import get_intrusion_count
from datetime import datetime

router = APIRouter(prefix="/sensors", tags=["sensors"])


class SensorDataInput(BaseModel):
    """Input for sensor data from ESP32."""
    fire: bool = False
    pir: bool = False
    gas: bool = False
    raw_gas: int = Field(default=400, alias="raw_mq2")
    mq2_rating: int = 1
    water: int = 50
    raw_water: int = 2400
    buzzer: bool = False
    muted: bool = False

    class Config:
        populate_by_name = True


@router.post("/data", response_model=dict, summary="Receive sensor data from ESP32")
async def receive_sensor_data(data: SensorDataInput) -> dict:
    """Receive and store sensor data from ESP32."""
    try:
        sensor_state = await asyncio.to_thread(
            update_sensors,
            data.fire, data.pir, data.gas,
            data.raw_gas, data.mq2_rating,
            data.water, data.raw_water,
            data.buzzer, data.muted
        )
        alert_status = await asyncio.to_thread(get_alert_status)
        
        return {
            "message": "✅ Sensor data received successfully",
            "sensor_state": sensor_state,
            "alert_status": alert_status,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status", response_model=SensorStatus, summary="Get current sensor status")
async def get_sensors() -> SensorStatus:
    """Get current sensor status."""
    status = await asyncio.to_thread(get_sensor_status)
    return SensorStatus(
        fire=status["fire"],
        pir=status["pir"],
        gas=status["gas"],
        raw_gas=status["raw_gas"],
        mq2_rating=status["mq2_rating"],
        water=status["water"],
        raw_water=status["raw_water"],
        buzzer=status["buzzer"],
        muted=status["muted"],
        last_update=status["last_update"],
        status=status["status"]
    )


@router.get("/alerts", response_model=dict, summary="Get current alert status")
async def get_alerts() -> dict:
    """Get current alert status based on sensors."""
    return await asyncio.to_thread(get_alert_status)
