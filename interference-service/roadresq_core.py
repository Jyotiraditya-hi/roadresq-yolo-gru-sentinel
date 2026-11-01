"""
roadresq_core.py

Building blocks for the RoadResQ crash-detection pipeline. Everything here is a direct
port of the training notebook ("GRU PART 3 / 4 / 6"), so the features the live service
builds are the SAME 18 numbers per frame the GRU was trained on:

  12 vehicle features (from YOLO + ByteTrack):
     n_veh, total_area_frac, max_area_frac, big_cx, big_cy, max_growth1, max_growth3,
     log_max_size_mult, max_center_jump, n_vanished, n_appeared, max_iou
  6 camera features:
     log_jolt, log_blur, log_score, diff, log_sharp, log_sharp_drop

If you retrain the GRU with different features or settings, change them here too.
"""

import numpy as np
import cv2
import torch
import torch.nn as nn

# ============================================================
# Constants - must match the notebook ("GRU PART 2")
# ============================================================
WINDOW_SIZE = 30        # GRU sees the last 30 frames
CAMERA_LOOKBACK = 8     # notebook: LOOKBACK
MAX_FRAMES = 100        # notebook: frames read per video (training clips are ~50 frames)
N_TRACKING_FEATURES = 12
N_CAMERA_FEATURES = 6
N_FEATURES_TOTAL = N_TRACKING_FEATURES + N_CAMERA_FEATURES  # 18

TRACKING_FEATURE_NAMES = [
    "n_veh", "total_area_frac", "max_area_frac", "big_cx", "big_cy", "max_growth1",
    "max_growth3", "log_max_size_mult", "max_center_jump", "n_vanished", "n_appeared", "max_iou",
]
CAMERA_FEATURE_NAMES = ["log_jolt", "log_blur", "log_score", "diff", "log_sharp", "log_sharp_drop"]
ALL_FEATURE_NAMES = TRACKING_FEATURE_NAMES + CAMERA_FEATURE_NAMES


# ============================================================
# Detection helpers (notebook "GRU PART 3")
# ============================================================

def remove_duplicate_detections(boxes, dist_threshold=10):
    """Collapse near-identical duplicate boxes (same vehicle, double-detected)."""
    xyxy = boxes.xyxy.cpu().numpy()
    conf = boxes.conf.cpu().numpy()
    centers = [((b[0] + b[2]) / 2, (b[1] + b[3]) / 2) for b in xyxy]
    keep = list(range(len(xyxy)))
    for i in range(len(xyxy)):
        for j in range(i + 1, len(xyxy)):
            if i not in keep or j not in keep:
                continue
            dist = ((centers[i][0] - centers[j][0]) ** 2 +
                    (centers[i][1] - centers[j][1]) ** 2) ** 0.5
            if dist < dist_threshold:
                if conf[i] >= conf[j]:
                    if j in keep:
                        keep.remove(j)
                else:
                    if i in keep:
                        keep.remove(i)
    return keep


def stitch_tracks(all_frames_data, max_gap_frames=3, max_dist=40):
    """Bridge short ID gaps (brief detection dropouts) into one logical track."""
    active_tracks = {}
    next_logical_id = 1
    stitched_data = []
    for frame_entry in all_frames_data:
        fnum = frame_entry["frame"]
        new_vehicles = []
        for v in frame_entry["vehicles"]:
            raw_id = v["id"]
            matched_logical_id = None
            for lid, info in active_tracks.items():
                if info["raw_id"] == raw_id and (fnum - info["last_frame"]) <= 1:
                    matched_logical_id = lid
                    break
            if matched_logical_id is None:
                best_lid, best_dist = None, max_dist
                for lid, info in active_tracks.items():
                    gap = fnum - info["last_frame"]
                    if 1 < gap <= max_gap_frames and info["last_class"] == v["class"]:
                        dist = ((info["last_center"][0] - v["center"][0]) ** 2 +
                                (info["last_center"][1] - v["center"][1]) ** 2) ** 0.5
                        if dist < best_dist:
                            best_dist, best_lid = dist, lid
                matched_logical_id = best_lid
            if matched_logical_id is None:
                matched_logical_id = next_logical_id
                next_logical_id += 1
            active_tracks[matched_logical_id] = {
                "raw_id": raw_id, "last_center": v["center"],
                "last_class": v["class"], "last_frame": fnum,
            }
            new_vehicles.append({
                "id": matched_logical_id, "class": v["class"], "center": v["center"],
                "area": v["area"], "box": v["box"],
            })
        stitched_data.append({"frame": fnum, "vehicles": new_vehicles})
    return stitched_data


def iou(a, b):
    """Overlap (intersection over union) of two boxes (x1, y1, x2, y2)."""
    ix1, iy1, ix2, iy2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / ua if ua > 0 else 0.0


def run_yolo_tracking(video_path, yolo_model, conf=0.15, dup_dist_threshold=10,
                      max_gap_frames=3, max_dist=40, max_frames=MAX_FRAMES):
    """Run YOLO + ByteTrack over the video (first `max_frames` frames), return stitched tracking data."""
    cap = cv2.VideoCapture(video_path)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    yolo_model.predictor = None  # reset tracker state between videos

    all_frames_data, frame_num = [], 0
    while frame_num < max_frames:
        ret, frame = cap.read()
        if not ret:
            break
        results = yolo_model.track(frame, conf=conf, persist=True,
                                   tracker="bytetrack.yaml", verbose=False)
        frame_data = []
        boxes = results[0].boxes
        if boxes.id is not None and len(boxes) > 0:
            keep_indices = remove_duplicate_detections(boxes, dist_threshold=dup_dist_threshold)
            xyxy = boxes.xyxy.cpu().numpy()
            track_ids = boxes.id.int().tolist()
            classes = boxes.cls.int().tolist()
            for idx in keep_indices:
                x1, y1, x2, y2 = [float(c) for c in xyxy[idx]]
                frame_data.append({
                    "id": track_ids[idx], "class": yolo_model.names[classes[idx]],
                    "center": ((x1 + x2) / 2, (y1 + y2) / 2),
                    "area": (x2 - x1) * (y2 - y1), "box": (x1, y1, x2, y2),
                })
        all_frames_data.append({"frame": frame_num, "vehicles": frame_data})
        frame_num += 1
    cap.release()

    tracking_data = stitch_tracks(all_frames_data, max_gap_frames=max_gap_frames, max_dist=max_dist)
    return tracking_data, width, height


# ============================================================
# Camera signal (notebook "GRU PART 4" + extract_video_features)
# ============================================================

def camera_arrays(video_path, resize_to=(320, 180), max_frames=MAX_FRAMES):
    """Per-frame raw motion-difference and sharpness arrays (first `max_frames` frames)."""
    cap = cv2.VideoCapture(video_path)
    prev, diffs, sharp = None, [], []
    while len(diffs) < max_frames:
        ret, frame = cap.read()
        if not ret:
            break
        g = cv2.cvtColor(cv2.resize(frame, resize_to), cv2.COLOR_BGR2GRAY)
        sharp.append(float(cv2.Laplacian(g, cv2.CV_64F).var()))
        diffs.append(float(np.mean(cv2.absdiff(g, prev))) if prev is not None else 0.0)
        prev = g
    cap.release()
    return np.array(diffs), np.array(sharp)


def camera_frame_features(diffs, sharp, fnum, lookback=CAMERA_LOOKBACK):
    """The 6 camera features for frame `fnum`:
    log_jolt, log_blur, log_score, diff, log_sharp, log_sharp_drop."""
    if fnum >= lookback:
        md = np.median(diffs[fnum - lookback:fnum])
        ms = np.median(sharp[fnum - lookback:fnum])
        jolt = diffs[fnum] / max(md, 1e-3)
        blur = ms / max(sharp[fnum], 1e-6)
    else:
        jolt = blur = 1.0
    drop = sharp[fnum - 1] / max(sharp[fnum], 1e-6) if fnum >= 1 else 1.0
    return np.array([
        min(np.log1p(jolt), 8), min(np.log1p(blur), 8), min(np.log1p(jolt * blur), 10),
        diffs[fnum], np.log1p(sharp[fnum]), min(np.log1p(drop), 8),
    ], dtype=np.float32)


# ============================================================
# Vehicle features (notebook "GRU PART 4": vehicle_frame_features)
# ============================================================

def tracking_frame_features(tracking_data, width, height):
    """The 12 vehicle features for every frame. Returns a (n_frames, 12) array."""
    W, H = width, height
    area_hist, cen_hist, first_area = {}, {}, {}
    prev_ids = set()
    out = []
    for fr in tracking_data:
        t = fr["frame"]
        vs = fr["vehicles"]
        ids = set(v["id"] for v in vs)
        n = len(vs)
        if n == 0:
            row = [0, 0, 0, 0, 0, 0, 0, 0, 0, len(prev_ids - ids), 0, 0]
        else:
            areas = [v["area"] for v in vs]
            big = vs[int(np.argmax(areas))]
            g1, g3, mult, jump = [0.0], [0.0], [1.0], [0.0]
            for v in vs:
                vid = v["id"]
                first_area.setdefault(vid, v["area"])
                ah, ch = area_hist.get(vid, {}), cen_hist.get(vid, {})
                if (t - 1) in ah and ah[t - 1] > 0:
                    g1.append(v["area"] / ah[t - 1] - 1)
                if (t - 3) in ah and ah[t - 3] > 0:
                    g3.append(v["area"] / ah[t - 3] - 1)
                if first_area[vid] > 0:
                    mult.append(v["area"] / first_area[vid])
                if (t - 1) in ch:
                    jump.append(((v["center"][0] - ch[t - 1][0]) ** 2 +
                                 (v["center"][1] - ch[t - 1][1]) ** 2) ** 0.5 / W)
            max_iou = 0.0
            for i in range(n):
                for j in range(i + 1, n):
                    max_iou = max(max_iou, iou(vs[i]["box"], vs[j]["box"]))
            row = [n, sum(areas) / (W * H), max(areas) / (W * H),
                   (big["center"][0] - W / 2) / W, big["center"][1] / H,
                   float(np.clip(max(g1), -1, 5)), float(np.clip(max(g3), -1, 5)),
                   float(min(np.log1p(max(mult)), 6)), float(min(max(jump), 1)),
                   len(prev_ids - ids), (len(ids - prev_ids) if t > 0 else 0), max_iou]
        for v in vs:
            area_hist.setdefault(v["id"], {})[t] = v["area"]
            cen_hist.setdefault(v["id"], {})[t] = v["center"]
        prev_ids = ids
        out.append(row)
    return np.array(out, dtype=np.float32)


# ============================================================
# Full-video feature sequence + windows (feeds the GRU)
# ============================================================

def build_feature_sequence(video_path, yolo_model=None, use_tracking=True,
                           use_camera=True, max_frames=None):
    """
    Build the (n_frames, n_features) sequence for a video. Production uses both feature
    groups (18 columns: 12 vehicle + 6 camera). Only the first MAX_FRAMES frames are read,
    like in training.
    """
    limit = MAX_FRAMES if max_frames is None else min(int(max_frames), MAX_FRAMES)
    diffs, sharp = camera_arrays(video_path, max_frames=limit)

    tracking_data, width, height = None, None, None
    if use_tracking:
        if yolo_model is None:
            raise ValueError("yolo_model is required when use_tracking=True")
        tracking_data, width, height = run_yolo_tracking(video_path, yolo_model, max_frames=limit)

    n_frames = len(diffs) if tracking_data is None else min(len(diffs), len(tracking_data))
    if n_frames < 5:
        raise ValueError("Video is too short or could not be read (need at least 5 frames)")

    cam_feats = np.zeros((n_frames, N_CAMERA_FEATURES), dtype=np.float32)
    if use_camera:
        for i in range(n_frames):
            cam_feats[i] = camera_frame_features(diffs, sharp, i)

    track_feats = np.zeros((n_frames, N_TRACKING_FEATURES), dtype=np.float32)
    if use_tracking:
        track_feats = tracking_frame_features(tracking_data, width, height)[:n_frames]

    if use_tracking and use_camera:
        feats = np.hstack([track_feats, cam_feats])
    elif use_tracking:
        feats = track_feats
    else:
        feats = cam_feats

    return feats, diffs[:n_frames], sharp[:n_frames], tracking_data, width, height


def windows_from_sequence(feats, window_size=WINDOW_SIZE):
    """
    One window per frame, like training: the window ending at frame e holds the last
    `window_size` frames, with the first frame repeated at the start of the video.
    Returns (windows, ends): windows is (n_frames, window_size, n_features) and ends[i] is
    the frame the i-th window ends on.
    """
    T = feats.shape[0]
    p = np.concatenate([np.repeat(feats[:1], window_size - 1, 0), feats]).astype(np.float32)
    windows = np.stack([p[e:e + window_size] for e in range(T)])
    return windows, list(range(T))


# ============================================================
# GRU model - same as the notebook's CrashGRU
# ============================================================

class CrashGRU(nn.Module):
    """GRU over a (batch, WINDOW_SIZE, n_features) window -> one crash logit per window."""

    def __init__(self, n_features=N_FEATURES_TOTAL, hidden_size=64, num_layers=1, dropout=0.3):
        super().__init__()
        self.gru = nn.GRU(n_features, hidden_size, num_layers=num_layers, batch_first=True)
        self.drop = nn.Dropout(dropout)
        self.out = nn.Linear(hidden_size, 1)

    def forward(self, x):
        _, h = self.gru(x)                          # h: (num_layers, batch, hidden)
        return self.out(self.drop(h[-1])).squeeze(-1)  # (batch,)

    @torch.no_grad()
    def predict_proba(self, x):
        self.eval()
        return torch.sigmoid(self.forward(x))