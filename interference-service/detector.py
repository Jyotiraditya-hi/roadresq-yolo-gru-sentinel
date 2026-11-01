"""
detector.py

Production entry point for RoadResQ. Loads the trained GRU detector (tracking+camera
variant) and the fine-tuned YOLO model, and exposes:

    analyze_video(video_path)        -> dict with detection + identification
    save_crash_snapshot(...)         -> writes an annotated evidence image

The decision rule is the same as in the training notebook ("GRU PART 6"):
  1. build the 18 features per frame (roadresq_core.py),
  2. standardize them with the saved mean/std,
  3. score one 30-frame window per frame with the GRU,
  4. alert when K consecutive windows are all >= the saved threshold.
"""

import os
import json

import numpy as np
import torch
import cv2
from ultralytics import YOLO

from roadresq_core import (
    build_feature_sequence,
    windows_from_sequence,
    CrashGRU,
    WINDOW_SIZE,
)

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(_THIS_DIR, "config.json")

# ---------------- Load config ----------------
with open(CONFIG_PATH) as f:
    CONFIG = json.load(f)

THRESHOLD = CONFIG["threshold"]                  # fallback only - the checkpoint's own "thr" wins below
YOLO_WEIGHTS_PATH = CONFIG["yolo_weights_path"]  # path to best.pt, relative or absolute
GRU_WEIGHTS_PATH_CFG = CONFIG.get("gru_weights_path", "models/gru_tracking_camera.pt")
CONTEXT_FRAMES = CONFIG.get("context_frames", 5)

GRU_WEIGHTS_PATH = (GRU_WEIGHTS_PATH_CFG if os.path.isabs(GRU_WEIGHTS_PATH_CFG)
                    else os.path.join(_THIS_DIR, GRU_WEIGHTS_PATH_CFG))

# ---------------- Load models (once, at import time) ----------------
_device = "cuda" if torch.cuda.is_available() else "cpu"

yolo_model = YOLO(YOLO_WEIGHTS_PATH if os.path.isabs(YOLO_WEIGHTS_PATH)
                  else os.path.join(_THIS_DIR, YOLO_WEIGHTS_PATH))

# The checkpoint holds the weights ("state_dict") PLUS the settings the model was trained with:
# which feature columns (idx), their mean/std (inputs were standardized), the tuned
# threshold (thr) and K (consecutive windows needed).
_ckpt = torch.load(GRU_WEIGHTS_PATH, map_location=_device, weights_only=False)
_state = _ckpt["state_dict"] if "state_dict" in _ckpt else _ckpt

gru_model = CrashGRU()
gru_model.load_state_dict(_state)
gru_model.to(_device)
gru_model.eval()

_FEAT_IDX = [int(i) for i in _ckpt["idx"]] if "idx" in _ckpt else None
_MEAN = np.asarray(_ckpt["mean"], dtype=np.float32) if "mean" in _ckpt else None
_STD = np.asarray(_ckpt["std"], dtype=np.float32) if "std" in _ckpt else None

if "thr" in _ckpt:
    THRESHOLD = float(_ckpt["thr"])
K_CONSEC = max(1, int(_ckpt["K"])) if "K" in _ckpt else 1


# ============================================================
# Main entry point
# ============================================================

def analyze_video(video_path, context_frames=CONTEXT_FRAMES, max_frames=None):
    """
    Analyze a single video for a crash with the GRU detector, then identify the vehicle
    involved from the YOLO tracking data if a crash is detected.

    Returns:
        {
          "video": str,
          "collision_detected": bool,
          "confidence": float,          # strength of the best run of K consecutive windows
          "impact_frame": int | None,   # frame where the alert first fires
          "vehicles_involved": [ {class, bbox, area, frame}, ... ]
        }
    """
    feats, diffs, sharp, tracking_data, width, height = build_feature_sequence(
        video_path, yolo_model=yolo_model, use_tracking=True, use_camera=True,
        max_frames=max_frames,
    )

    # same preprocessing as training: pick the feature columns, then standardize
    f = feats[:, _FEAT_IDX] if _FEAT_IDX is not None else feats
    if _MEAN is not None and _STD is not None:
        f = (f - _MEAN) / _STD
    f = f.astype(np.float32)

    windows, ends = windows_from_sequence(f, window_size=WINDOW_SIZE)  # one window per frame
    x = torch.tensor(windows, dtype=torch.float32, device=_device)
    probs = gru_model.predict_proba(x).cpu().numpy()

    # alert = K consecutive windows all >= threshold. Score each run of K windows by its
    # weakest window; the video is flagged if the best run reaches the threshold.
    k = max(1, min(K_CONSEC, len(probs)))
    sustained = np.array([probs[i:i + k].min() for i in range(len(probs) - k + 1)])
    confidence = float(sustained.max())
    detected = confidence >= THRESHOLD

    result = {
        "video": video_path,
        "collision_detected": bool(detected),
        "confidence": round(confidence, 3),
        "impact_frame": None,
        "vehicles_involved": [],
    }
    if not detected:
        return result

    first_hit = int(np.flatnonzero(sustained >= THRESHOLD)[0])
    impact_frame = int(ends[first_hit + k - 1])   # frame where the alert first fires
    result["impact_frame"] = impact_frame

    # Identify the vehicle(s) from tracking data already computed above: look at a small
    # window around the impact; if nothing is found there, fall back to the whole video.
    def _collect(lo, hi):
        seen = {}
        for fr in tracking_data or []:
            if not (lo <= fr["frame"] <= hi):
                continue
            for v in fr["vehicles"]:
                vid = v["id"]
                if vid not in seen or v["area"] > seen[vid]["area"]:
                    seen[vid] = {
                        "class": v["class"], "area": float(v["area"]),
                        "bbox": [float(c) for c in v["box"]],
                        "frame": int(fr["frame"]),
                    }
        return seen

    seen_vehicles = _collect(max(0, impact_frame - context_frames), impact_frame + context_frames)
    if not seen_vehicles:
        seen_vehicles = _collect(0, 10 ** 9)

    result["vehicles_involved"] = list(seen_vehicles.values())
    return result


def save_crash_snapshot(video_path, vehicle_info, out_path):
    """Save an annotated image (box + label) of the identified vehicle."""
    cap = cv2.VideoCapture(video_path)
    cap.set(cv2.CAP_PROP_POS_FRAMES, vehicle_info["frame"])
    ret, frame = cap.read()
    cap.release()
    if not ret:
        return None
    x1, y1, x2, y2 = [int(v) for v in vehicle_info["bbox"]]
    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 3)
    cv2.putText(frame, vehicle_info["class"], (x1, max(0, y1 - 10)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 2)
    cv2.imwrite(out_path, frame)
    return out_path