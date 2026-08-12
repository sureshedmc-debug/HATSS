"""
Face Recognition v2 - Enhanced High Precision Matching Engine
Integrated with Roboflow Cloud AI (face-behavier/15) + YOLOv8 + ORB Feature Fusion
"""

import os
import cv2
import base64
import requests
import numpy as np
from pathlib import Path
from datetime import datetime, UTC
from ultralytics import YOLO

# Roboflow Cloud AI Configuration
ROBOFLOW_API_KEY = os.environ.get("ROBOFLOW_API_KEY", "cLh4d3Wn5J3CuLueqMQl")
ROBOFLOW_MODEL_ID = os.environ.get("ROBOFLOW_MODEL_ID", "face-behavier/15")
ROBOFLOW_ENDPOINT = f"https://detect.roboflow.com/{ROBOFLOW_MODEL_ID}?api_key={ROBOFLOW_API_KEY}"

# Directories
KNOWN_FACES_DIR = Path("data/known_faces")
KNOWN_FACES_DIR.mkdir(parents=True, exist_ok=True)
INTRUSIONS_DIR = Path("data/intruder_snaps")
INTRUSIONS_DIR.mkdir(parents=True, exist_ok=True)

# Remove default sample face embeddings if present
for sample_name in ["Krishang Jain.npy", "Kiri.npy"]:
    sample_file = KNOWN_FACES_DIR / sample_name
    if sample_file.exists():
        try:
            sample_file.unlink()
            print(f"🧹 Cleaned up sample embedding: {sample_name}")
        except Exception:
            pass

# Initialize Local Detectors
face_detector = None
haar_cascade = None

try:
    if Path("yolov8n-face.pt").exists():
        face_detector = YOLO("yolov8n-face.pt")
        print("✅ Local YOLOv8 Custom Face Model Loaded")
    else:
        face_detector = YOLO("yolov8n.pt")
        print("✅ Local YOLOv8 Standard Model Loaded")
except Exception as e:
    print(f"⚠️ YOLOv8 initialization skipped: {e}")
    face_detector = None

try:
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    if os.path.exists(cascade_path):
        haar_cascade = cv2.CascadeClassifier(cascade_path)
        print("✅ OpenCV Haar Cascade Detector Loaded")
except Exception as e:
    print(f"⚠️ Haar Cascade initialization failed: {e}")
    haar_cascade = None

try:
    ORB = cv2.ORB_create(nfeatures=1000, scaleFactor=1.2, nlevels=8)
    print("✅ OpenCV ORB Feature Extractor Loaded")
except Exception as e:
    print(f"⚠️ ORB initialization failed: {e}")
    ORB = None


def query_roboflow_face_detection(frame: np.ndarray) -> list[tuple]:
    """Query Roboflow Cloud AI (face-behavier/15) for high-accuracy face & behavior detection"""
    if not ROBOFLOW_API_KEY:
        return []

    try:
        # Encode frame as JPEG base64
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        b64_image = base64.b64encode(buffer).decode('utf-8')

        response = requests.post(
            ROBOFLOW_ENDPOINT,
            data=b64_image,
            headers={'Content-Type': 'application/x-www-form-urlencoded'},
            timeout=2.5
        )

        if response.status_code == 200:
            data = response.json()
            predictions = data.get("predictions", [])
            detections = []
            h, w = frame.shape[:2]

            for pred in predictions:
                # Roboflow returns center_x, center_y, width, height
                cx, cy = pred.get("x", 0), pred.get("y", 0)
                bw, bh = pred.get("width", 0), pred.get("height", 0)
                
                x1 = max(0, int(cx - bw / 2))
                y1 = max(0, int(cy - bh / 2))
                x2 = min(w, int(cx + bw / 2))
                y2 = min(h, int(cy + bh / 2))

                if x2 > x1 and y2 > y1:
                    confidence = pred.get("confidence", 0.0)
                    class_name = pred.get("class", "face")
                    detections.append((x1, y1, x2, y2, confidence, class_name))

            if detections:
                print(f"🤖 Roboflow AI ({ROBOFLOW_MODEL_ID}) detected {len(detections)} face(s)")
                return detections

    except Exception as e:
        print(f"⚠️ Roboflow API request fallback: {e}")

    return []


def detect_faces_in_frame(frame: np.ndarray) -> list[tuple]:
    """Detect all faces in frame using Roboflow Cloud AI with local YOLOv8 / Haar Cascade fallback"""
    # 1. Try Roboflow Cloud AI
    rf_detections = query_roboflow_face_detection(frame)
    if rf_detections:
        return [(d[0], d[1], d[2], d[3]) for d in rf_detections]

    # 2. Local YOLOv8 Fallback
    try:
        if face_detector is not None:
            results = face_detector(frame, verbose=False)
            if len(results) > 0 and results[0].boxes is not None and len(results[0].boxes) > 0:
                boxes = results[0].boxes
                detections = []
                for box in boxes:
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
                    x1, y1 = max(0, x1), max(0, y1)
                    x2, y2 = min(frame.shape[1], x2), min(frame.shape[0], y2)
                    if x2 > x1 and y2 > y1:
                        detections.append((x1, y1, x2, y2))
                if detections:
                    return detections
    except Exception as e:
        print(f"YOLOv8 detection error: {e}")

    # 3. OpenCV Haar Cascade Fallback
    try:
        if haar_cascade is not None:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = haar_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40))
            detections = []
            for (x, y, w, h) in faces:
                detections.append((x, y, x + w, y + h))
            return detections
    except Exception as e:
        print(f"Haar Cascade error: {e}")

    return []


def extract_face_region(frame: np.ndarray) -> tuple[np.ndarray | None, tuple | None]:
    """Extract face region from frame using Roboflow / YOLOv8 / Haar Cascade"""
    detections = detect_faces_in_frame(frame)
    if detections:
        x1, y1, x2, y2 = detections[0]
        face_region = frame[y1:y2, x1:x2]
        if face_region.size > 0:
            return face_region, (x1, y1, x2, y2)
    return None, None


def extract_embedding(frame: np.ndarray) -> np.ndarray | None:
    """Extract high-precision feature embedding using ORB + Spatial Block Descriptor"""
    face_region, _ = extract_face_region(frame)

    if face_region is None:
        return None

    try:
        gray = cv2.cvtColor(face_region, cv2.COLOR_BGR2GRAY)
        equalized = cv2.equalizeHist(gray)
        resized = cv2.resize(equalized, (160, 160))

        features = []

        if ORB is not None:
            kp, des = ORB.detectAndCompute(resized, None)
            if des is not None and len(des) > 0:
                orb_vec = des.astype(np.float32).flatten()
                orb_norm = np.linalg.norm(orb_vec)
                if orb_norm > 0:
                    features.append(orb_vec / orb_norm)

        h, w = resized.shape
        grid_h, grid_w = h // 4, w // 4
        spatial_hist = []
        for i in range(4):
            for j in range(4):
                cell = resized[i*grid_h:(i+1)*grid_h, j*grid_w:(j+1)*grid_w]
                hist = cv2.calcHist([cell], [0], None, [16], [0, 256]).flatten()
                spatial_hist.extend(hist)

        spatial_vec = np.array(spatial_hist, dtype=np.float32)
        spatial_norm = np.linalg.norm(spatial_vec)
        if spatial_norm > 0:
            features.append(spatial_vec / spatial_norm)

        if not features:
            return None

        fused = np.concatenate(features)
        norm = np.linalg.norm(fused)
        return fused / (norm + 1e-8)

    except Exception as e:
        print(f"❌ Embedding extraction error: {e}")
        return None


def save_embedding(name: str, embedding: np.ndarray) -> bool:
    """Save face embedding to file"""
    try:
        safe_name = "".join(c for c in name if c.isalnum() or c in (" ", "_", "-")).strip()
        if not safe_name:
            safe_name = "User"
            
        filepath = KNOWN_FACES_DIR / f"{safe_name}.npy"
        np.save(filepath, embedding)
        print(f"✅ Saved embedding: {filepath}")
        return True
    except Exception as e:
        print(f"❌ Save embedding error: {e}")
        return False


def load_embeddings() -> tuple[np.ndarray, list[str]]:
    """Load all known face embeddings"""
    embeddings = []
    names = []

    for file in KNOWN_FACES_DIR.glob("*.npy"):
        try:
            emb = np.load(file)
            embeddings.append(emb)
            names.append(file.stem)
        except Exception as e:
            print(f"⚠️ Failed to load {file}: {e}")

    if len(embeddings) == 0:
        return np.array([]), []

    max_size = max(len(e) for e in embeddings)
    padded = []
    for emb in embeddings:
        if len(emb) < max_size:
            emb = np.pad(emb, (0, max_size - len(emb)), mode='constant')
        padded.append(emb[:max_size])

    return np.array(padded), names


def match_face(known_embeddings: np.ndarray, known_names: list[str],
               test_embedding: np.ndarray, threshold: float = 0.78) -> tuple[bool, str, float]:
    """Match test embedding against known faces using high-precision cosine similarity"""
    if known_embeddings is None or len(known_embeddings) == 0:
        return False, "UNKNOWN", 0.0

    if test_embedding is None:
        return False, "NO_FACE", 0.0

    if len(test_embedding) < len(known_embeddings[0]):
        test_embedding = np.pad(test_embedding,
                               (0, len(known_embeddings[0]) - len(test_embedding)),
                               mode='constant')
    else:
        test_embedding = test_embedding[:len(known_embeddings[0])]

    similarities = []
    for known_emb in known_embeddings:
        norm1 = np.linalg.norm(known_emb)
        norm2 = np.linalg.norm(test_embedding)

        if norm1 == 0 or norm2 == 0:
            sim = 0
        else:
            sim = np.dot(known_emb, test_embedding) / (norm1 * norm2)

        similarities.append(sim)

    best_idx = np.argmax(similarities)
    best_score = float(similarities[best_idx])
    best_name = known_names[best_idx]

    if best_score >= threshold:
        return True, best_name, best_score
    else:
        return False, "INTRUDER", best_score


def get_known_faces_count() -> int:
    """Get number of registered known faces"""
    return len(list(KNOWN_FACES_DIR.glob("*.npy")))


def get_known_faces_list() -> list[str]:
    """Get list of known face names"""
    return [f.stem for f in KNOWN_FACES_DIR.glob("*.npy")]


print(f"🤖 Roboflow Cloud AI Integrated ({ROBOFLOW_MODEL_ID}) + High-Precision Face Recognition V2 Loaded")
