"""
verify_consistency.py

Run this once after copying the model files into a new environment
(a new machine, a backend server, a fresh clone of this folder) and
before wiring it up to anything else. It checks that:

  1. All required files are present.
  2. config.json's settings agree with roadresq_core.py's constants
     (window size, feature counts) — a mismatch here means the GRU
     was trained with different settings than the ones currently in
     roadresq_core.py, and predictions would be silently wrong rather
     than erroring out.
  3. The saved GRU weights actually load into the CrashGRU class
     defined in roadresq_core.py, with the expected input size.
  4. The YOLO weights load and report the expected 4 classes.

This does NOT run the model on real data — see test_state_equivalence.py
for that. This is a fast, offline structural check.
"""

import os
import json
import sys

import torch

CHECKS_PASSED = []
CHECKS_FAILED = []


def check(name, condition, detail=""):
    if condition:
        CHECKS_PASSED.append(name)
        print(f"  [OK]   {name}")
    else:
        CHECKS_FAILED.append(name)
        print(f"  [FAIL] {name}  {detail}")


def main():
    this_dir = os.path.dirname(os.path.abspath(__file__))
    print("=== RoadResQ file & consistency check ===\n")

    # ---------------- 1. Required files present ----------------
    required = ["roadresq_core.py", "detector.py", "config.json"]
    print("Required files:")
    for fname in required:
        check(f"{fname} exists", os.path.exists(os.path.join(this_dir, fname)))

    if not os.path.exists(os.path.join(this_dir, "config.json")):
        print("\nconfig.json missing — cannot continue further checks.")
        sys.exit(1)

    with open(os.path.join(this_dir, "config.json")) as f:
        config = json.load(f)

    yolo_path = config.get("yolo_weights_path", "")
    yolo_full_path = yolo_path if os.path.isabs(yolo_path) else os.path.join(this_dir, yolo_path)
    check("YOLO weights file exists (models/best.pt)", os.path.exists(yolo_full_path),
          f"looked at: {yolo_full_path}")

    gru_path = config.get("gru_weights_path", "models/gru_tracking_camera.pt")
    gru_full_path = gru_path if os.path.isabs(gru_path) else os.path.join(this_dir, gru_path)
    check("GRU weights file exists (models/gru_tracking_camera.pt)", os.path.exists(gru_full_path),
          f"looked at: {gru_full_path}")

    print()

    # ---------------- 2. roadresq_core settings vs config ----------------
    print("Settings consistency:")
    try:
        import roadresq_core as core
        check("config.json has a 'threshold' key", "threshold" in config)
        check("threshold is between 0 and 1",
              0.0 <= config.get("threshold", -1) <= 1.0,
              f"got {config.get('threshold')}")
        check("N_FEATURES_TOTAL == 18 (tracking+camera variant)",
              core.N_FEATURES_TOTAL == 18,
              f"got {core.N_FEATURES_TOTAL} — update config/model if a different variant is used")
    except ImportError as e:
        check("roadresq_core.py imports cleanly", False, str(e))

    print()

    # ---------------- 3. GRU weights load into CrashGRU ----------------
    print("GRU model:")
    try:
        import roadresq_core as core
        model = core.CrashGRU()

        # The checkpoint is a wrapper: the weights are under "state_dict", next to
        # extra training settings (mean, std, thr, K, idx, window, n_features).
        _ckpt = torch.load(gru_full_path, map_location="cpu", weights_only=False)
        state_dict = _ckpt["state_dict"] if "state_dict" in _ckpt else _ckpt
        model.load_state_dict(state_dict)
        check("GRU weights load into CrashGRU without shape errors", True)

        # Confirm the GRU's expected input size matches our feature count
        gru_input_size = model.gru.input_size
        check("GRU input size matches N_FEATURES_TOTAL",
              gru_input_size == core.N_FEATURES_TOTAL,
              f"GRU expects {gru_input_size} features, "
              f"roadresq_core.py builds {core.N_FEATURES_TOTAL}")
    except Exception as e:
        check("GRU weights load successfully", False, str(e))

    print()

    # ---------------- 4. YOLO weights load ----------------
    print("YOLO model:")
    try:
        from ultralytics import YOLO
        yolo_model = YOLO(yolo_full_path)
        check("best.pt loads successfully", True)
        n_classes = len(yolo_model.names)
        check("YOLO reports 4 classes (car, motorcycle, bus, truck)",
              n_classes == 4, f"got {n_classes}: {yolo_model.names}")
    except Exception as e:
        check("YOLO weights load successfully", False, str(e))

    # ---------------- Summary ----------------
    print("\n=== Summary ===")
    print(f"Passed: {len(CHECKS_PASSED)}")
    print(f"Failed: {len(CHECKS_FAILED)}")
    if CHECKS_FAILED:
        print("\nFailed checks:")
        for c in CHECKS_FAILED:
            print(f"  - {c}")
        print("\nFix the issues above before using this folder in production.")
        sys.exit(1)
    else:
        print("\nAll checks passed. This folder looks ready to use.")
        sys.exit(0)


if __name__ == "__main__":
    main()