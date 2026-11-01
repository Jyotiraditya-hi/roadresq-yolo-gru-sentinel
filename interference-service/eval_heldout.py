"""
eval_heldout.py - runs the detector on the SAME held-out videos the notebook used to report
81% detected / 5% false alarms (notebook "GRU PART 2": random.seed(7), N = 100).

Usage (venv active, inside interference-service):
    python eval_heldout.py --crash-dir "C:\\RaodResQ_Dataset\\Crash-1500" ^
                           --normal-dir "C:\\RaodResQ_Dataset\\Normal" --n 20

--annotations defaults to <crash-dir>\\Crash-1500.txt. --n = videos per class (the full
held-out set is 100 + 100 and takes a long time on a CPU, so start with 20).
"""
import argparse
import json
import os
import random
import time

ap = argparse.ArgumentParser()
ap.add_argument("--crash-dir", required=True)
ap.add_argument("--normal-dir", required=True)
ap.add_argument("--annotations", default=None, help="Crash-1500.txt (default: inside --crash-dir)")
ap.add_argument("--n", type=int, default=20, help="videos per class to test (max 100)")
args = ap.parse_args()

ann_path = args.annotations or os.path.join(args.crash_dir, "Crash-1500.txt")
if not os.path.exists(ann_path):
    raise SystemExit(f"Annotation file not found: {ann_path}  (pass --annotations)")

# ---- labels + metadata, parsed exactly like the notebook ----
gt, meta = {}, {}
with open(ann_path) as f:
    for line in f:
        vid_id, rest = line.strip().split(",", 1)
        gt[vid_id] = json.loads(rest[rest.index("["):rest.index("]") + 1])
        tail = rest[rest.index("]") + 2:].split(",")
        meta[vid_id] = {"time_of_day": tail[2], "weather": tail[3], "ego": tail[4]}

# ---- the notebook's held-out split ----
random.seed(7)
ego_crash = sorted(v for v, m in meta.items() if m["ego"] == "Yes" and 1 in gt[v])
normal_ids = sorted(f.replace(".mp4", "") for f in os.listdir(args.normal_dir) if f.endswith(".mp4"))
N = 100
crash_pick = random.sample(ego_crash, 2 * N)
normal_pick = random.sample(normal_ids, 2 * N)
ho_crash, ho_normal = crash_pick[N:], normal_pick[N:]
print(f"Held-out set rebuilt: {len(ho_crash)} crash + {len(ho_normal)} normal "
      f"(first crash ids: {ho_crash[:3]}, first normal ids: {ho_normal[:3]})")

import detector as D  # loads the models (slow)

def run(ids, folder, label):
    hits = 0
    for vid in ids[:args.n]:
        t0 = time.time()
        r = D.analyze_video(os.path.join(folder, vid + ".mp4"))
        hits += bool(r["collision_detected"])
        print(f"  {label} {vid}  detected={r['collision_detected']!s:<5} conf={r['confidence']:.3f} "
              f"impact_frame={r['impact_frame']}  ({time.time() - t0:.0f}s)")
    return hits

print("\nCRASH videos (want detected=True):")
c = run(ho_crash, args.crash_dir, "crash ")
print("\nNORMAL videos (want detected=False):")
n = run(ho_normal, args.normal_dir, "normal")

k = min(args.n, 100)
print(f"\nSUMMARY on {k}+{k} held-out videos: crashes detected {c}/{k} ({100*c/k:.0f}%), "
      f"false alarms {n}/{k} ({100*n/k:.0f}%)   [notebook reported 81% / 5% on 100+100]")
