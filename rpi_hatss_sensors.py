"""
HATSS Raspberry Pi 3 Direct Hardware Controller
Reads IR, Flame, MQ2 Gas, and Water Level Sensors directly from RPi GPIO pins,
drives SSD1306 0.96" OLED display over I2C, controls dual-tone Buzzer siren,
and syncs telemetry with HATSS Web Application API.
"""

import time
import requests
from datetime import datetime

# Try importing RPi GPIO or gpiozero
try:
    from gpiozero import MotionSensor, DigitalInputDevice, PWMBuzzer, TonalBuzzer
    import RPi.GPIO as GPIO
    GPIO_AVAILABLE = True
except Exception as e:
    print(f"⚠️ GPIO library simulation mode: {e}")
    GPIO_AVAILABLE = False

# Try importing OLED display libraries
try:
    import board
    import busio
    from PIL import Image, ImageDraw, ImageFont
    import adafruit_ssd1306
    OLED_AVAILABLE = True
except Exception as e:
    print(f"⚠️ OLED display library simulation mode: {e}")
    OLED_AVAILABLE = False

# Pin Configuration (Raspberry Pi BCM Pins)
PIN_IR = 27       # GPIO 27 (Physical Pin 13) - Active LOW
PIN_FLAME = 22    # GPIO 22 (Physical Pin 15) - Active LOW
PIN_MQ2 = 23      # GPIO 23 (Physical Pin 16) - Active LOW/HIGH
PIN_WATER = 24    # GPIO 24 (Physical Pin 18) - Active LOW/HIGH
PIN_BUZZER = 18   # GPIO 18 (Physical Pin 12) - PWM Buzzer

BACKEND_API_URL = "http://localhost:8000/api/v1/sensors/data"

# Initialize Display
oled = None
if OLED_AVAILABLE:
    try:
        i2c = busio.I2C(board.SCL, board.SDA)
        oled = adafruit_ssd1306.SSD1306_I2C(128, 64, i2c, addr=0x3C)
        oled.fill(0)
        oled.show()
        print("✅ OLED 0.96\" SSD1306 initialized successfully")
    except Exception as e:
        print(f"⚠️ OLED initialization failed: {e}")

# Initialize GPIO Sensors
if GPIO_AVAILABLE:
    try:
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(PIN_IR, GPIO.IN, pull_up_down=GPIO.PUD_UP)
        GPIO.setup(PIN_FLAME, GPIO.IN, pull_up_down=GPIO.PUD_UP)
        GPIO.setup(PIN_MQ2, GPIO.IN, pull_up_down=GPIO.PUD_UP)
        GPIO.setup(PIN_WATER, GPIO.IN, pull_up_down=GPIO.PUD_UP)
        GPIO.setup(PIN_BUZZER, GPIO.OUT)
        print("✅ Raspberry Pi GPIO Sensors initialized")
    except Exception as e:
        print(f"⚠️ GPIO setup error: {e}")

def read_hardware_sensors():
    """Read sensor states from Raspberry Pi GPIO pins"""
    if not GPIO_AVAILABLE:
        return False, False, False, 15

    # Logic matching ESP32: Active LOW triggers
    raw_ir = GPIO.input(PIN_IR)
    raw_flame = GPIO.input(PIN_FLAME)
    raw_mq2 = GPIO.input(PIN_MQ2)
    raw_water = GPIO.input(PIN_WATER)

    ir_alarm = (raw_ir == 0)       # Active LOW
    flame_alarm = (raw_flame == 0) # Active LOW
    gas_alarm = (raw_mq2 == 0)     # Active LOW
    water_alarm = (raw_water == 0) # Active LOW

    water_pct = 15 if water_alarm else 80

    return ir_alarm, flame_alarm, gas_alarm, water_pct

def update_oled(ir_alarm, flame_alarm, gas_alarm, water_pct):
    """Draw HATSS UI on 0.96 OLED display"""
    if not oled or not OLED_AVAILABLE:
        return

    image = Image.new("1", (128, 64))
    draw = ImageDraw.Draw(image)

    threat = ir_alarm or flame_alarm or gas_alarm

    # Beaker animation on right
    draw.rectangle((98, 16, 123, 62), outline=1, fill=0)
    draw.rectangle((102, 12, 119, 16), outline=1, fill=0)
    fill_h = int((water_pct / 100.0) * 42)
    if fill_h > 0:
        draw.rectangle((100, 60 - fill_h, 121, 60), outline=1, fill=1)

    if threat:
        draw.text((6, 2), "! THREAT ALERT !", fill=1)
        draw.line((0, 12, 94, 12), fill=1)
        if flame_alarm:
            draw.text((0, 20), "-> FIRE!", fill=1)
        elif ir_alarm:
            draw.text((0, 20), "-> INTRUSION", fill=1)
        elif gas_alarm:
            draw.text((0, 20), "-> GAS LEAK!", fill=1)
        draw.text((0, 36), "EVACUATE AREA", fill=1)
        draw.text((0, 52), "BUZ: ALARM", fill=1)
    else:
        draw.text((6, 2), "HATSS SECURE", fill=1)
        draw.line((0, 12, 94, 12), fill=1)
        draw.text((0, 20), f"Gas  : {'ALERT' if gas_alarm else 'SAFE'}", fill=1)
        draw.text((0, 31), f"Fire : {'ALERT' if flame_alarm else 'SAFE'}", fill=1)
        draw.text((0, 42), f"IR   : {'ALERT' if ir_alarm else 'CLEAR'}", fill=1)
        draw.text((0, 53), f"Water: {water_pct}%", fill=1)

    oled.image(image)
    oled.show()

def main():
    print("🚀 HATSS Raspberry Pi Hardware Controller Started...")
    siren_toggle = False

    while True:
        try:
            ir_alarm, flame_alarm, gas_alarm, water_pct = read_hardware_sensors()
            threat = ir_alarm or flame_alarm or gas_alarm

            # Siren control on GPIO 18
            if GPIO_AVAILABLE and threat:
                siren_toggle = not siren_toggle
                GPIO.output(PIN_BUZZER, GPIO.HIGH if siren_toggle else GPIO.LOW)
            elif GPIO_AVAILABLE:
                GPIO.output(PIN_BUZZER, GPIO.LOW)

            # Update OLED Display
            update_oled(ir_alarm, flame_alarm, gas_alarm, water_pct)

            # Sync with HATSS Web API
            payload = {
                "fire": flame_alarm,
                "pir": ir_alarm,
                "gas": gas_alarm
            }
            try:
                requests.post(BACKEND_API_URL, json=payload, timeout=1.0)
            except Exception:
                pass

        except Exception as e:
            print(f"Error in sensor loop: {e}")

        time.sleep(0.2)

if __name__ == "__main__":
    main()
