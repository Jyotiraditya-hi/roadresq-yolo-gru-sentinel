"""
server.py

Internal-only Python inference microservice for RoadResQ.

This is NOT the public-facing backend. In the MERN architecture, Express
is the public API — this service only talks to Express, over localhost
(or an internal network), and is never exposed directly to the internet
or called from the React frontend.

Responsibilities:
  - Accept an uploaded video file
  - Run analyze_video() (GRU detector + YOLO identification)
  - If a collision is detected, save an annotated snapshot image
  - Return the result as JSON

Run with:
    uvicorn server:app --host 127.0.0.1 --port 8000 --reload

Express then calls, e.g.:
    POST http://127.0.0.1:8000/analyze   (multipart/form-data, field "file")
"""

import os
import shutil
import tempfile
import logging

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse

from detector import analyze_video, save_crash_snapshot

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("roadresq-inference")

app = FastAPI(title="RoadResQ Inference Service", version="1.0.0")

# Where snapshot images get written. Express should read from this same
# location (e.g. mount it as a shared volume, or have this service and
# Express run on the same machine/container with a shared path).
SNAPSHOT_DIR = os.environ.get("ROADRESQ_SNAPSHOT_DIR",
                               os.path.join(os.path.dirname(os.path.abspath(__file__)), "snapshots"))
os.makedirs(SNAPSHOT_DIR, exist_ok=True)


@app.get("/health")
def health():
    """Simple liveness check — Express can poll this to confirm the service is up."""
    return {"status": "ok"}


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    """
    Accepts a video file, runs the full detection pipeline, and returns:

        {
          "collision_detected": bool,
          "confidence": float,
          "impact_frame": int | null,
          "vehicles_involved": [ {class, bbox, area, frame}, ... ],
          "snapshot_url": str | null   # relative path under SNAPSHOT_DIR, if a crash was found
        }

    Express is responsible for combining this with user-submitted data
    (phone number, plate number, location) and for triggering any
    notification to the relevant authority.
    """
    if not file.filename.lower().endswith((".mp4", ".mov", ".avi", ".mkv")):
        raise HTTPException(status_code=400, detail="Unsupported file type. Expected a video file.")

    tmp_path = None
    try:
        suffix = os.path.splitext(file.filename)[1] or ".mp4"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name

        logger.info(f"Analyzing uploaded video: {file.filename} (-> {tmp_path})")
        result = analyze_video(tmp_path)

        snapshot_url = None
        if result["collision_detected"] and result["vehicles_involved"]:
            snapshot_name = f"{os.path.splitext(os.path.basename(tmp_path))[0]}.jpg"
            snapshot_path = os.path.join(SNAPSHOT_DIR, snapshot_name)
            saved = save_crash_snapshot(tmp_path, result["vehicles_involved"][0], snapshot_path)
            if saved:
                snapshot_url = snapshot_name  # Express serves this from SNAPSHOT_DIR

        result["snapshot_url"] = snapshot_url
        result.pop("video", None)  # don't leak the server's local temp file path to the client

        logger.info(f"Result: detected={result['collision_detected']} "
                    f"confidence={result['confidence']}")
        return JSONResponse(content=result)

    except Exception as e:
        logger.exception("Analysis failed")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {e}")

    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)
