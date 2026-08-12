"""
Face Recognition v2 - YOLOv8 + OpenCV Haar Cascade + ORB Feature-Based Implementation
Robust face detection with automatic fallback and ORB embeddings
"""

import os
import cv2
import numpy as np
from pathlib import Path
from datetime import datetime, UTC
from ultralytics import YOLO

# Configuration
KNOWN_FACES_DIR = Path("data/known_faces")
KNOWN_FACES_DIR.mkdir(parents=True, exist_ok=True)
INTRUSIONS_DIR = Path("data/intruder_snaps")
INTRUSIONS_DIR.mkdir(parents=True, exist_ok=True)

# Initialize Detectors
face_detector = None
haar_cascade = None

# Try loading YOLOv8
try:
    if Path("yolov8n-face.pt").exists():
        face_detector = YOLO("yolov8n-face.pt")
        print("✅ YOLOv8 Custom Face Model Loaded")
    else:
        face_detector = YOLO("yolov8n.pt")
        print("✅ YOLOv8 Standard Model Loaded")
except Exception as e:
    print(f"⚠️ YOLOv8 initialization skipped/failed: {e}")
    face_detector = None

# Initialize OpenCV Haar Cascade Fallback (Always available in cv2)
try:
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    if os.path.exists(cascade_path):
        haar_cascade = cv2.CascadeClassifier(cascade_path)
        print("✅ OpenCV Haar Cascade Face Detector Loaded")
except Exception as e:
    print(f"⚠️ Haar Cascade initialization failed: {e}")
    haar_cascade = None

# Initialize ORB (OpenCV feature extractor)
try:
    ORB = cv2.ORB_create(nfeatures=500)
    print("✅ OpenCV ORB Feature Detector Loaded")
except Exception as e:
    print(f"⚠️ ORB initialization failed: {e}")
    ORB = None


def extract_face_region(frame: np.ndarray) -> tuple[np.ndarray | None, tuple | None]:
    """Extract face region from frame using YOLOv8 or OpenCV Haar Cascade fallback"""
    try:
        # 1. Try YOLOv8
        if face_detector is not None:
            results = face_detector(frame, verbose=False)
            if len(results) > 0 and results[0].boxes is not None and len(results[0].boxes) > 0:
                boxes = results[0].boxes
                box = boxes[0]
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
                x1, y1 = max(0, x1), max(0, y1)
                x2, y2 = min(frame.shape[1], x2), min(frame.shape[0], y2)
                face_region = frame[y1:y2, x1:x2]
                if face_region.size > 0:
                    return face_region, (x1, y1, x2, y2)

        # 2. Fallback to OpenCV Haar Cascade
        if haar_cascade is not None:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = haar_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(30, 30))
            if len(faces) > 0:
                x, y, w, h = faces[0]
                x1, y1, x2, y2 = x, y, x + w, y + h
                face_region = frame[y1:y2, x1:x2]
                if face_region.size > 0:
                    return face_region, (x1, y1, x2, y2)

        return None, None

    except Exception as e:
        print(f"Face detection error: {e}")
        return None, None


def extract_embedding(frame: np.ndarray) -> np.ndarray | None:
    """Extract face embedding using ORB features"""
    face_region, _ = extract_face_region(frame)

    if face_region is None:
        return None

    try:
        # Convert to grayscale for ORB
        gray = cv2.cvtColor(face_region, cv2.COLOR_BGR2GRAY)

        # Resize to consistent size
        resized = cv2.resize(gray, (128, 128))

        # Extract ORB keypoints and descriptors
        if ORB is not None:
            kp, des = ORB.detectAndCompute(resized, None)
            if des is not None and len(des) > 0:
                embedding = des.astype(np.float32).flatten()
                norm = np.linalg.norm(embedding)
                if norm > 0:
                    return embedding / norm

        # Fallback: use raw pixel histogram
        hist = cv2.calcHist([resized], [0], None, [256], [0, 256])
        embedding = hist.flatten().astype(np.float32)
        norm = np.linalg.norm(embedding)
        return embedding / (norm + 1e-8)

    except Exception as e:
        print(f"❌ Embedding extraction error: {e}")
        return None


def save_embedding(name: str, embedding: np.ndarray) -> bool:
    """Save face embedding to file"""
    try:
        filepath = KNOWN_FACES_DIR / f"{name}.npy"
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

    # Pad embeddings to same size
    max_size = max(len(e) for e in embeddings)
    padded = []
    for emb in embeddings:
        if len(emb) < max_size:
            emb = np.pad(emb, (0, max_size - len(emb)), mode='constant')
        padded.append(emb[:max_size])

    return np.array(padded), names


def match_face(known_embeddings: np.ndarray, known_names: list[str],
               test_embedding: np.ndarray, threshold: float = 0.5) -> tuple[bool, str, float]:
    """Match test embedding against known faces using cosine similarity"""
    if known_embeddings is None or len(known_embeddings) == 0:
        return False, "UNKNOWN", 999.0

    if test_embedding is None:
        return False, "NO_FACE", 999.0

    # Pad test embedding to match known embeddings size
    if len(test_embedding) < len(known_embeddings[0]):
        test_embedding = np.pad(test_embedding,
                               (0, len(known_embeddings[0]) - len(test_embedding)),
                               mode='constant')
    else:
        test_embedding = test_embedding[:len(known_embeddings[0])]

    # Cosine similarity
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
    best_score = similarities[best_idx]
    best_name = known_names[best_idx]

    if best_score > threshold:
        return True, best_name, float(best_score)
    else:
        return False, "INTRUDER", float(1.0 - best_score)


def get_known_faces_count() -> int:
    """Get number of registered known faces"""
    return len(list(KNOWN_FACES_DIR.glob("*.npy")))


def get_known_faces_list() -> list[str]:
    """Get list of known face names"""
    return [f.stem for f in KNOWN_FACES_DIR.glob("*.npy")]


def detect_faces_in_frame(frame: np.ndarray) -> list[tuple]:
    """Detect all faces in frame using YOLOv8 or OpenCV Haar Cascade"""
    try:
        # 1. Try YOLOv8
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

        # 2. Fallback to OpenCV Haar Cascade
        if haar_cascade is not None:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = haar_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(30, 30))
            detections = []
            for (x, y, w, h) in faces:
                detections.append((x, y, x + w, y + h))
            return detections

        return []

    except Exception as e:
        print(f"Face detection error: {e}")
        return []


print("✅ Face Recognition V2 Module Loaded (YOLOv8 + Haar Cascade + ORB)")
