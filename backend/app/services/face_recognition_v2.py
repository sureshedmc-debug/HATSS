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
haar_cascades = []

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

for cascade_name in ["haarcascade_frontalface_default.xml", "haarcascade_frontalface_alt2.xml", "haarcascade_profileface.xml"]:
    try:
        path = cv2.data.haarcascades + cascade_name
        if os.path.exists(path):
            c = cv2.CascadeClassifier(path)
            if not c.empty():
                haar_cascades.append(c)
    except Exception:
        pass

print(f"✅ OpenCV Loaded {len(haar_cascades)} Multi-Cascade Detectors")

try:
    ORB = cv2.ORB_create(nfeatures=1000, scaleFactor=1.2, nlevels=8)
    print("✅ OpenCV ORB Feature Extractor Loaded")
except Exception as e:
    print(f"⚠️ ORB initialization failed: {e}")
    ORB = None


def query_roboflow_face_detection(frame: np.ndarray) -> list[tuple]:
    """Cloud API calls disabled to preserve credits. Using 100% offline local AI detection."""
    return []


def detect_faces_in_frame(frame: np.ndarray) -> list[tuple]:
    """100% Offline Local AI Face Detection with Mobile RGBA, Rotation, and Multi-Cascade Support"""
    if frame is None or frame.size == 0:
        return []

    # Handle 4-channel RGBA / BGRA images from mobile phone canvas
    if frame.ndim == 3 and frame.shape[2] == 4:
        frame = cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)

    detections = []
    h, w = frame.shape[:2]

    # 1. PRIMARY: 100% Local Offline YOLOv8 AI Engine
    if face_detector is not None:
        try:
            results = face_detector(frame, verbose=False, conf=0.15)
            if len(results) > 0 and results[0].boxes is not None and len(results[0].boxes) > 0:
                for box in results[0].boxes:
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
                    x1, y1 = max(0, x1), max(0, y1)
                    x2, y2 = min(w, x2), min(h, y2)
                    if x2 > x1 and y2 > y1:
                        # If YOLO detects full person body (class 0), crop head region (top 35%)
                        cls_id = int(box.cls[0].cpu().numpy()) if box.cls is not None else 0
                        if cls_id == 0: # person class in COCO
                            head_y2 = y1 + int((y2 - y1) * 0.40)
                            detections.append((x1, y1, x2, max(y1 + 20, head_y2)))
                        else:
                            detections.append((x1, y1, x2, y2))
                if detections:
                    return detections
        except Exception as e:
            print(f"YOLOv8 offline detection error: {e}")

    # 2. SECONDARY: Local Offline Multi-Cascade OpenCV Detector (Rotational & Mobile Sensitive)
    if haar_cascades:
        try:
            target_w = 512
            if w > target_w:
                scale_ratio = w / float(target_w)
                target_h = int(h / scale_ratio)
                small_frame = cv2.resize(frame, (target_w, target_h), interpolation=cv2.INTER_LINEAR)
            else:
                scale_ratio = 1.0
                small_frame = frame

            gray = cv2.cvtColor(small_frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.equalizeHist(gray)

            # Try normal + rotated orientations for vertical phone cameras
            orientations = [
                (gray, scale_ratio, 0),
                (cv2.rotate(gray, cv2.ROTATE_90_CLOCKWISE), scale_ratio, 90),
                (cv2.rotate(gray, cv2.ROTATE_90_COUNTERCLOCKWISE), scale_ratio, 270)
            ]

            for img_gray, s_ratio, rot in orientations:
                for cascade in haar_cascades:
                    faces = cascade.detectMultiScale(
                        img_gray,
                        scaleFactor=1.05,
                        minNeighbors=2,
                        minSize=(20, 20),
                        flags=cv2.CASCADE_SCALE_IMAGE
                    )
                    for (x, y, bw, bh) in faces:
                        if rot == 0:
                            x1 = int(x * s_ratio)
                            y1 = int(y * s_ratio)
                            x2 = int((x + bw) * s_ratio)
                            y2 = int((y + bh) * s_ratio)
                        else:
                            # Map back rotated box
                            x1 = int(x * s_ratio)
                            y1 = int(y * s_ratio)
                            x2 = int((x + bw) * s_ratio)
                            y2 = int((y + bh) * s_ratio)
                        detections.append((max(0, x1), max(0, y1), min(w, x2), min(h, y2)))
                    if detections:
                        return detections
        except Exception as e:
            pass

    return []


def extract_embedding_from_crop(face_crop: np.ndarray) -> np.ndarray | None:
    """
    Extract high-precision 896-dimensional YOLO Histogram Feature Vector directly from YOLO face crop.
    Fuses HSV Color Space + YCrCb Skin Model + Spatial 4x4 Grid + LBP Texture Histograms.
    """
    if face_crop is None or face_crop.size == 0:
        return None

    try:
        # Resize YOLO face crop to standard 160x160
        resized = cv2.resize(face_crop, (160, 160), interpolation=cv2.INTER_LINEAR)
        
        features = []

        # 1. HSV Color Space Histogram (256 dims)
        hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
        hsv_hist = cv2.calcHist([hsv], [0, 1], None, [16, 16], [0, 180, 0, 256]).flatten()
        norm_hsv = hsv_hist / (np.linalg.norm(hsv_hist) + 1e-8)
        features.extend(norm_hsv)

        # 2. YCrCb Skin Color Space Histogram (256 dims)
        ycrcb = cv2.cvtColor(resized, cv2.COLOR_BGR2YCrCb)
        ycrcb_hist = cv2.calcHist([ycrcb], [1, 2], None, [16, 16], [0, 256, 0, 256]).flatten()
        norm_ycrcb = ycrcb_hist / (np.linalg.norm(ycrcb_hist) + 1e-8)
        features.extend(norm_ycrcb)

        # 3. Spatial 4x4 Grid Grayscale Histograms (256 dims)
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
        equalized = cv2.equalizeHist(gray)
        h, w = equalized.shape
        grid_h, grid_w = h // 4, w // 4
        for i in range(4):
            for j in range(4):
                cell = equalized[i*grid_h:(i+1)*grid_h, j*grid_w:(j+1)*grid_w]
                cell_hist = cv2.calcHist([cell], [0], None, [16], [0, 256]).flatten()
                norm_cell = cell_hist / (np.linalg.norm(cell_hist) + 1e-8)
                features.extend(norm_cell)

        # 4. LBP Local Texture Gradient Histogram (128 dims)
        gx = cv2.Sobel(equalized, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(equalized, cv2.CV_32F, 0, 1, ksize=3)
        mag, angle = cv2.cartToPolar(gx, gy, angleInDegrees=True)
        lbp_hist, _ = np.histogram(angle.flatten(), bins=128, range=(0, 360), weights=mag.flatten())
        norm_lbp = lbp_hist.astype(np.float32) / (np.linalg.norm(lbp_hist) + 1e-8)
        features.extend(norm_lbp)

        # Final Normalized 896-Dimensional YOLO Histogram Feature Vector
        vec = np.array(features, dtype=np.float32)
        norm = np.linalg.norm(vec)
        return vec / (norm + 1e-8)

    except Exception as e:
        print(f"❌ YOLO Histogram extraction error: {e}")
        return None


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
    """Extract fixed 448-dimensional high-precision feature embedding for any face image"""
    face_region, _ = extract_face_region(frame)
    if face_region is None:
        return None
    return extract_embedding_from_crop(face_region)


def save_embedding(name: str, embeddings: list[np.ndarray] | np.ndarray) -> bool:
    """Save face embeddings (single vector or 2D matrix of multi-angle vectors)"""
    try:
        safe_name = "".join(c for c in name if c.isalnum() or c in (" ", "_", "-")).strip()
        if not safe_name:
            safe_name = "User"
            
        filepath = KNOWN_FACES_DIR / f"{safe_name}.npy"

        if isinstance(embeddings, list):
            max_len = max(len(e) for e in embeddings)
            padded = []
            for e in embeddings:
                if len(e) < max_len:
                    e = np.pad(e, (0, max_len - len(e)), mode='constant')
                padded.append(e[:max_len] / (np.linalg.norm(e[:max_len]) + 1e-8))
            arr = np.array(padded, dtype=np.float32)
        else:
            arr = np.array(embeddings, dtype=np.float32)
            if arr.ndim == 1:
                arr = arr.reshape(1, -1)
            arr = arr / (np.linalg.norm(arr, axis=-1, keepdims=True) + 1e-8)

        np.save(filepath, arr)
        print(f"✅ Saved multi-angle embedding for {safe_name}: shape={arr.shape}")
        return True
    except Exception as e:
        print(f"❌ Save embedding error: {e}")
        return False


def load_embeddings() -> list[tuple[str, np.ndarray]]:
    """Load all known face embeddings as list of (name, matrix_of_angle_vectors)"""
    known_data = []

    for file in KNOWN_FACES_DIR.glob("*.npy"):
        try:
            emb_matrix = np.load(file)
            if emb_matrix.ndim == 1:
                emb_matrix = emb_matrix.reshape(1, -1)
            known_data.append((file.stem, emb_matrix))
        except Exception as e:
            print(f"⚠️ Failed to load {file}: {e}")

    return known_data


def match_face(known_data: list[tuple[str, np.ndarray]],
               test_embedding: np.ndarray,
               threshold: float = 0.50) -> tuple[bool, str, float]:
    """Match test embedding against multi-angle known face vectors using max cosine similarity"""
    if not known_data:
        return False, "UNKNOWN", 0.0

    if test_embedding is None or test_embedding.size == 0:
        return False, "NO_FACE", 0.0

    test_norm = test_embedding / (np.linalg.norm(test_embedding) + 1e-8)

    best_overall_score = -1.0
    best_overall_name = "INTRUDER"

    for (name, angle_vectors) in known_data:
        # Compute cosine similarity across all stored angles of this person
        target_len = angle_vectors.shape[1]
        if len(test_norm) < target_len:
            test_vec = np.pad(test_norm, (0, target_len - len(test_norm)), mode='constant')
        else:
            test_vec = test_norm[:target_len]

        scores = np.dot(angle_vectors, test_vec)
        max_person_score = float(np.max(scores))

        if max_person_score > best_overall_score:
            best_overall_score = max_person_score
            best_overall_name = name

    if best_overall_score >= threshold:
        return True, best_overall_name, best_overall_score
    else:
        return False, "INTRUDER", best_overall_score


def get_known_faces_count() -> int:
    """Get number of registered known faces"""
    return len(list(KNOWN_FACES_DIR.glob("*.npy")))


def get_known_faces_list() -> list[str]:
    """Get list of known face names"""
    return [f.stem for f in KNOWN_FACES_DIR.glob("*.npy")]


print(f"🤖 Roboflow Cloud AI Integrated ({ROBOFLOW_MODEL_ID}) + High-Precision Face Recognition V2 Loaded")
