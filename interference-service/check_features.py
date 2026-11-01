"""
check_features.py  -  diagnostic only (does not change anything).

Runs the feature extractor on a few videos and compares the RAW feature statistics
with the mean/std saved inside the GRU checkpoint. If a column differs a lot, the
live code builds that feature differently from how the model was trained.

Usage:
    python check_features.py --dir "C:\\RaodResQ_Dataset\\Crash-1500" --n 5
"""
import argparse
import glob
import os

import numpy as np
import torch

import detector as D
from roadresq_core import build_feature_sequence, windows_from_sequence, ALL_FEATURE_NAMES, WINDOW_SIZE

ap = argparse.ArgumentParser()
ap.add_argument("--dir", required=True, help="folder with .mp4 videos")
ap.add_argument("--n", type=int, default=5, help="how many videos to use")
args = ap.parse_args()

files = sorted(glob.glob(os.path.join(args.dir, "*.mp4")))[: args.n]
if not files:
    raise SystemExit(f"No .mp4 files found in {args.dir}")

all_feats = []
print("\nPer-video model output (with standardization):")
for f in files:
    feats, *_ = build_feature_sequence(f, yolo_model=D.yolo_model, use_tracking=True, use_camera=True)
    all_feats.append(feats)

    windows, _starts = windows_from_sequence(feats, WINDOW_SIZE)
    w = windows[:, :, D._FEAT_IDX] if D._FEAT_IDX is not None else windows
    if D._MEAN is not None:
        w = (w - D._MEAN) / D._STD
    x = torch.tensor(w, dtype=torch.float32, device=D._device)
    probs = D.gru_model.predict_proba(x).cpu().numpy()
    print(f"  {os.path.basename(f)}  frames={len(feats):3d}  max_window_prob={probs.max():.3f}")

X = np.vstack(all_feats)
code_mean, code_std = X.mean(axis=0), X.std(axis=0)

print("\nFeature statistics: what the CODE produces vs what the CHECKPOINT was trained on")
print(f"{'idx':>3}  {'name':<24} {'code mean':>10} {'code std':>10} | {'ckpt mean':>10} {'ckpt std':>10}  flag")
for i, name in enumerate(ALL_FEATURE_NAMES):
    cm, cs = float(code_mean[i]), float(code_std[i])
    km, ks = float(D._MEAN[i]), float(D._STD[i])
    off = abs(cm - km) > 2 * ks or (ks > 0 and not (0.2 < (cs / ks) < 5))
    print(f"{i:>3}  {name:<24} {cm:>10.3f} {cs:>10.3f} | {km:>10.3f} {ks:>10.3f}  {'<-- DIFFERENT' if off else ''}")

print("\nHow to read this: a column marked DIFFERENT means the live code builds that feature")
print("differently from the training notebook. Send this whole output back.")
