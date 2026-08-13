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


import urllib.request
import json

ESP32_GET_ENDPOINTS = [
    "http://192.168.4.1/api/sensors",
    "http://192.168.4.1/sensors",
    "http://192.168.4.1/data",
    "http://192.168.4.1/json",
    "http://192.168.4.1/read"
]

def fetch_esp32_http_get() -> bool:
    """Proactively fetch live sensor JSON from ESP32 IP 192.168.4.1 via HTTP GET"""
    for url in ESP32_GET_ENDPOINTS:
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'HATSS-Backend/1.0'})
            with urllib.request.urlopen(req, timeout=0.8) as resp:
                if resp.status == 200:
                    body = resp.read().decode('utf-8')
                    data = json.loads(body)
                    update_sensors(
                        fire=data.get('fire') or data.get('flame') or False,
                        pir=data.get('pir') or data.get('ir') or data.get('motion') or False,
                        gas=data.get('gas') or False,
                        raw_gas=data.get('raw_mq2') or data.get('raw_gas') or data.get('mq2') or 400,
                        mq2_rating=data.get('mq2_rating') or 1,
                        water=data.get('water') or 50,
                        raw_water=data.get('raw_water') or 2400,
                        buzzer=data.get('buzzer') or False,
                        muted=data.get('muted') or False
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
