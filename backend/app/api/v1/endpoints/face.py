"""Face recognition endpoints."""

import asyncio

from fastapi import APIRouter, HTTPException, File, Form, UploadFile
from app.schemas.face import FaceStatus, KnownFace
from app.services.face_recognition_v2 import (
    get_known_faces_list,
    get_known_faces_count,
    save_embedding,
    load_embeddings,
    match_face,
    extract_embedding,
    detect_faces_in_frame
)
import numpy as np
from datetime import datetime, UTC
import cv2
from pathlib import Path

router = APIRouter(prefix="/face", tags=["face"])

# Global state for current face detection
_last_intrusion_saved_time = 0.0
_current_face_status = {
    "label": "NO FACE",
    "confidence": 0.0,
    "last_updated": datetime.now(UTC)
}


@router.get("/status", response_model=FaceStatus, summary="Get current face recognition status")
async def get_face_status() -> FaceStatus:
    """Get the latest face recognition status."""
    return FaceStatus(
        label=_current_face_status["label"],
        confidence=_current_face_status["confidence"],
        last_updated=_current_face_status["last_updated"]
    )


# Intrusions endpoints
@router.get("/intrusions/count", response_model=dict, summary="Count intrusion detections")
async def count_intrusions() -> dict:
    """Get count of saved intrusion images."""
    try:
        intrusions_dir = Path("data/intruder_snaps")
        if intrusions_dir.exists():
            count = len(list(intrusions_dir.glob("*.jpg")))
            return {"count": count}
    except Exception as e:
        print(f"⚠️ Error counting intrusions: {e}")
    return {"count": 0}


@router.get("/intrusions/list", response_model=dict, summary="List intrusion images")
async def list_intrusions() -> dict:
    """Get list of intrusion image filenames."""
    try:
        intrusions_dir = Path("data/intruder_snaps")
        if intrusions_dir.exists():
            files = sorted([f.name for f in intrusions_dir.glob("*.jpg")], reverse=True)
            return {"count": len(files), "files": files[:50]}  # Last 50
    except Exception as e:
        print(f"⚠️ Error listing intrusions: {e}")
    return {"count": 0, "files": []}


@router.post("/analyze-frame", response_model=dict, summary="Analyze a camera frame for faces")
async def analyze_frame(image: UploadFile = File(...)) -> dict:
    """
    Analyze a frame from the camera for face detection and recognition.
    
    Args:
        image: JPEG image frame from browser camera
        
    Returns:
        Face detection results with label and confidence
    """
    global _current_face_status, _last_intrusion_saved_time
    
    try:
        # Read image from upload
        contents = await image.read()
        nparr = np.frombuffer(contents, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if frame is None:
            return {
                "label": "ERROR",
                "confidence": 0.0,
                "error": "Invalid image"
            }
        
        # Detect faces in frame (CPU-bound, run in thread pool)
        detections = await asyncio.to_thread(detect_faces_in_frame, frame)
        
        if not detections:
            _current_face_status = {
                "label": "NO FACE",
                "confidence": 0.0,
                "last_updated": datetime.now(UTC)
            }
            return {
                "label": "NO FACE",
                "confidence": 0.0,
                "faces_detected": 0,
                "boxes": [],
                "frame_size": [frame.shape[1], frame.shape[0]]
            }

        boxes = [list(map(int, d)) for d in detections]
        known_embeddings, known_names = await asyncio.to_thread(load_embeddings)
        
        from app.services.face_recognition_v2 import extract_embedding_from_crop
        
        face_results = []
        has_intruder = False
        primary_label = "INTRUDER"
        primary_confidence = 0.0

        for (x1, y1, x2, y2) in boxes:
            face_crop = frame[y1:y2, x1:x2]
            if face_crop.size == 0:
                continue

            emb = await asyncio.to_thread(extract_embedding_from_crop, face_crop)
            
            if emb is not None and len(known_embeddings) > 0:
                is_match, matched_name, score = await asyncio.to_thread(
                    match_face, known_embeddings, known_names, emb, 0.65
                )
                if is_match:
                    label = f"KNOWN: {matched_name}"
                    conf = float(score)
                else:
                    label = "INTRUDER"
                    conf = 0.85
                    has_intruder = True
            else:
                label = "INTRUDER"
                conf = 0.85
                has_intruder = True

            face_results.append({
                "box": [x1, y1, x2, y2],
                "label": label,
                "confidence": conf
            })

        if not face_results:
            return {
                "label": "NO FACE",
                "confidence": 0.0,
                "faces_detected": 0,
                "results": [],
                "boxes": [],
                "frame_size": [frame.shape[1], frame.shape[0]]
            }

        # Save snapshot if any intruder is detected
        if has_intruder:
            now_ts = datetime.now(UTC).timestamp()
            if (now_ts - _last_intrusion_saved_time) > 2.0:
                try:
                    intrusions_dir = Path("data/intruder_snaps")
                    intrusions_dir.mkdir(parents=True, exist_ok=True)
                    timestamp = int(now_ts)
                    intrusion_path = intrusions_dir / f"{timestamp}.jpg"
                    await asyncio.to_thread(cv2.imwrite, str(intrusion_path), frame)
                    _last_intrusion_saved_time = now_ts
                    print(f"🚨 Intruder photo saved: {intrusion_path}")
                except Exception as e:
                    print(f"⚠️ Failed to save intrusion photo: {e}")

        # Set status to first face result or highest priority
        primary_label = face_results[0]["label"]
        primary_confidence = face_results[0]["confidence"]

        _current_face_status = {
            "label": primary_label,
            "confidence": primary_confidence,
            "last_updated": datetime.now(UTC)
        }

        return {
            "label": primary_label,
            "confidence": primary_confidence,
            "faces_detected": len(face_results),
            "results": face_results,
            "boxes": [r["box"] for r in face_results],
            "frame_size": [frame.shape[1], frame.shape[0]]
        }
    
    except Exception as e:
        _current_face_status = {
            "label": "ERROR",
            "confidence": 0.0,
            "last_updated": datetime.now(UTC)
        }
        return {
            "label": "ERROR",
            "confidence": 0.0,
            "error": str(e)
        }


@router.get("/known", response_model=list[str], summary="List all known faces")
async def list_known_faces() -> list[str]:
    """Get list of registered known face names."""
    return await asyncio.to_thread(get_known_faces_list)


@router.get("/known/count", response_model=dict, summary="Count of known faces")
async def count_known_faces() -> dict:
    """Get count of registered known faces."""
    count = await asyncio.to_thread(get_known_faces_count)
    return {"count": count}


@router.post("/register", response_model=dict, summary="Register a known face from image(s)")
async def register_face(name: str = Form(...), 
                       image: UploadFile = File(None),
                       image_1: UploadFile = File(None),
                       image_2: UploadFile = File(None),
                       image_3: UploadFile = File(None)) -> dict:
    """
    Register a new known face from uploaded image(s).
    Supports single image or 3 images from different angles.
    
    Args:
        name: Person's name
        image: Single image (backward compatibility)
        image_1, image_2, image_3: Three images from different angles
    """
    try:
        embeddings = []
        
        # Handle 3-angle registration
        if image_1 and image_2 and image_3:
            for idx, img_file in enumerate([image_1, image_2, image_3], 1):
                contents = await img_file.read()
                nparr = np.frombuffer(contents, np.uint8)
                frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                
                if frame is None:
                    continue
                
                embedding = await asyncio.to_thread(extract_embedding, frame)
                if embedding is not None:
                    embeddings.append(embedding)
        
        # Fallback: Handle single image
        elif image:
            contents = await image.read()
            nparr = np.frombuffer(contents, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if frame is None:
                raise HTTPException(status_code=400, detail="Invalid image file")
            
            embedding = await asyncio.to_thread(extract_embedding, frame)
            if embedding is not None:
                embeddings.append(embedding)
        
        if not embeddings:
            return {
                "success": False,
                "message": "⚠️ No face detected in images. Please try again with clear face photos."
            }
        
        # Combine embeddings (average them safely with shape homogenization)
        max_len = max(len(emb) for emb in embeddings)
        padded_embeddings = []
        for emb in embeddings:
            if len(emb) < max_len:
                emb = np.pad(emb, (0, max_len - len(emb)), mode='constant')
            padded_embeddings.append(emb[:max_len])

        final_embedding = np.mean(padded_embeddings, axis=0)
        final_embedding = final_embedding / (np.linalg.norm(final_embedding) + 1e-8)
        
        # Save embedding (I/O-bound, run in thread pool)
        success = await asyncio.to_thread(save_embedding, name, final_embedding)
        if success:
            angles_text = f" ({len(embeddings)} angles)" if len(embeddings) > 1 else ""
            return {
                "success": True,
                "message": f"✅ {name} registered successfully{angles_text}!",
                "name": name,
                "angles": len(embeddings),
                "registered_at": datetime.now(UTC).isoformat()
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to save embedding")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Registration error: {str(e)}")
