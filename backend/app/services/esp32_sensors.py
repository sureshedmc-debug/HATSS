"""ESP32 sensor data management."""

from datetime import datetime

# Global sensor state
sensor_state = {
    "fire": False,
    "pir": False,
    "gas": False,
    "raw_gas": 400,
    "mq2_rating": 1,
    "water": 50,
    "raw_water": 2400,
    "buzzer": False,
    "muted": False,
    "last_update": "Not received yet",
    "status": "disconnected"
}


def update_sensors(fire: bool, pir: bool, gas: bool, raw_gas: int = 400, mq2_rating: int = 1,
                   water: int = 50, raw_water: int = 2400, buzzer: bool = False, muted: bool = False) -> dict:
    """Update sensor readings from ESP32."""
    global sensor_state
    
    sensor_state["fire"] = bool(fire)
    sensor_state["pir"] = bool(pir)
    sensor_state["gas"] = bool(gas) or (raw_gas > 2200)
    sensor_state["raw_gas"] = int(raw_gas)
    sensor_state["mq2_rating"] = int(mq2_rating)
    sensor_state["water"] = int(water)
    sensor_state["raw_water"] = int(raw_water)
    sensor_state["buzzer"] = bool(buzzer)
    sensor_state["muted"] = bool(muted)
    sensor_state["last_update"] = datetime.now().strftime("%H:%M:%S")
    sensor_state["status"] = "connected"
    
    return sensor_state


def get_sensor_status() -> dict:
    """Get current sensor status."""
    return sensor_state.copy()


def get_alert_status() -> dict:
    """Get alert status based on sensor readings."""
    alerts = []
    
    if sensor_state["fire"]:
        alerts.append("🔥 FIRE DETECTED")
    if sensor_state["pir"]:
        alerts.append("👁️ MOTION DETECTED")
    if sensor_state["gas"] or sensor_state["raw_gas"] > 2200:
        alerts.append(f"🛢️ HAZARD GAS DETECTED ({sensor_state['raw_gas']}/2200)")
    if sensor_state["water"] <= 15:
        alerts.append(f"🚨 WATER LEVEL LOW ({sensor_state['water']}%)")
    
    return {
        "has_alerts": len(alerts) > 0,
        "alerts": alerts,
        "severity": "critical" if any([sensor_state["fire"], sensor_state["gas"], sensor_state["raw_gas"] > 2200]) else 
                   "warning" if (sensor_state["pir"] or sensor_state["water"] <= 15) else "safe"
    }
