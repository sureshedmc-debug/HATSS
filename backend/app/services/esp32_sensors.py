"""ESP32 sensor data management."""

from datetime import datetime

# Global sensor state
sensor_state = {
    "fire": False,
    "pir": False,
    "gas": False,
    "raw_gas": 0,
    "mq2_rating": 0,
    "water": 0,
    "raw_water": 0,
    "buzzer": False,
    "muted": False,
    "last_update": "Not received yet",
    "status": "disconnected"
}


def update_sensors(fire: bool, pir: bool, gas: bool, raw_gas: int = 0, mq2_rating: int = 0,
                   water: int = 0, raw_water: int = 0, buzzer: bool = False, muted: bool = False) -> dict:
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


import urllib.request
import json

ESP32_GET_ENDPOINTS = [
    "http://192.168.4.1/api/sensors",
    "http://192.168.4.1/sensors",
    "http://192.168.4.1/data",
    "http://192.168.4.1/json",
    "http://192.168.4.1/read"
]

def extract_val(data: dict, keys: list, default):
    """Safely extract value from dict trying multiple keys without falsy 0 bug"""
    for k in keys:
        if k in data and data[k] is not None:
            return data[k]
    return default


def fetch_esp32_http_get() -> bool:
    """Proactively fetch live sensor JSON from ESP32 IP 192.168.4.1 via HTTP GET"""
    for url in ESP32_GET_ENDPOINTS:
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'HATSS-Backend/1.0'})
            with urllib.request.urlopen(req, timeout=0.8) as resp:
                if resp.status == 200:
                    body = resp.read().decode('utf-8')
                    data = json.loads(body)
                    
                    fire_val = bool(extract_val(data, ['fire', 'flame'], False))
                    pir_val = bool(extract_val(data, ['pir', 'ir', 'motion'], False))
                    gas_val = bool(extract_val(data, ['gas'], False))
                    raw_gas_val = int(extract_val(data, ['raw_mq2', 'raw_gas', 'mq2', 'raw_ao'], 0))
                    mq2_rating_val = int(extract_val(data, ['mq2_rating'], 0))
                    water_val = int(extract_val(data, ['water', 'water_level', 'water_pct'], 0))
                    raw_water_val = int(extract_val(data, ['raw_water', 'water_raw', 'raw_soil'], 0))
                    buzzer_val = bool(extract_val(data, ['buzzer'], False))
                    muted_val = bool(extract_val(data, ['muted'], False))

                    update_sensors(
                        fire=fire_val,
                        pir=pir_val,
                        gas=gas_val,
                        raw_gas=raw_gas_val,
                        mq2_rating=mq2_rating_val,
                        water=water_val,
                        raw_water=raw_water_val,
                        buzzer=buzzer_val,
                        muted=muted_val
                    )
                    return True
        except Exception:
            continue
    return False


def get_sensor_status() -> dict:
    """Get current sensor status (fetches live HTTP GET from 192.168.4.1 first)"""
    fetch_esp32_http_get()
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
