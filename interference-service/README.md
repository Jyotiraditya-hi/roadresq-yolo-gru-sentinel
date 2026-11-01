# RoadResQ — Detection Core

This folder is the **production-ready core** of RoadResQ: a vehicle
collision detector (GRU, using tracking + camera-motion features) paired
with YOLO for identifying which vehicle was involved once a crash is
flagged.

It is deliberately small. It does **not** contain the training
notebooks, the dataset, or the step-by-step experimentation that
produced these models (threshold tuning, rule-based detection attempts,
model comparisons) — only the final, working pipeline. That history
lives in your Colab notebook / Drive, kept separately as project
documentation.

## Why GRU, not a simpler model

Three detectors were built and honestly compared on the same held-out
set of 100 crash + 100 normal videos (never used for tuning):

| Model                        | Detected | False alarms |
|-------------------------------|---------:|--------------:|
| Gradient boosting (camera only) | 70%    | 10%           |
| GRU — tracking only           | 76%      | 13%           |
| GRU — camera only             | 65%      | 7%            |
| **GRU — tracking + camera**   | **81%**  | **5%**        |

The tracking+camera GRU won on both axes and is what this folder ships.

## How the pieces fit together

```
                 ┌─────────────────────┐
  video file --> │   GRU detector       │ --> collision_detected?
                 │ (tracking + camera   │     confidence
                 │  features, 30-frame  │     impact_frame
                 │  sliding window)     │
                 └─────────┬───────────┘
                           │ only if a crash is detected
                           v
                 ┌─────────────────────┐
                 │  YOLO (best.pt)      │ --> vehicle class, bbox,
                 │  on a small window   │     frame — used for
                 │  around impact_frame │     evidence / snapshot
                 └─────────────────────┘
```

The GRU decides **whether and roughly when** a collision happened. YOLO
only ever runs on a handful of frames right around that moment, and
only to answer **what was involved** — it never decides the crash/no
crash question. This split exists because testing showed YOLO alone is
unreliable for the "did a crash happen" decision (heavy motion blur and
detection dropout right at the moment of impact), but is reliable for
identifying a vehicle in the clearer frames just before/after.

## Files in this folder

| File                         | Purpose |
|-------------------------------|---------|
| `roadresq_core.py`            | Shared logic: YOLO/tracking helpers, camera-signal functions, the 12 tracking + 6 camera per-frame feature builders, and the `CrashGRU` PyTorch model class. Imported by everything else. |
| `detector.py`                 | Loads the trained GRU + YOLO weights and exposes `analyze_video(video_path)` — the single function a backend calls. |
| `run.py`                      | Command-line entry point: `python run.py --video clip.mp4`. Useful for quick manual testing without writing code. |
| `verify_consistency.py`       | Run once after copying this folder anywhere new. Checks all required files exist and that the saved GRU/YOLO weights actually match what `roadresq_core.py` expects. |
| `test_state_equivalence.py`   | A regression test guarding against a real bug class hit during development: YOLO's tracker carrying hidden state between videos. Confirms results are deterministic and order-independent. |
| `requirements.txt`             | Python packages needed to run this folder. |
| `config.json`                  | Decision threshold, path to YOLO weights, and other runtime settings. **Edit this, not the code,** if you retune the threshold later. |

## Files you must add yourself (not included here)

These are the actual trained weights — too large and specific to your
training run to hardcode, and they belong in this folder but need to be
copied in from wherever you trained them (Google Drive / Colab):

- **`best.pt`** — your fine-tuned YOLO weights
  (from `RoadResQ_Dataset/runs/finetune_v4_combined/weights/best.pt`)
- **`gru_model.pt`** — the trained GRU's `state_dict`
  (saved from the GRU training notebook, e.g. with
  `torch.save(model.state_dict(), "gru_model.pt")`)

Place both files directly in this folder, alongside `detector.py`. If
you keep them somewhere else, update `yolo_weights_path` in
`config.json` to point at the real location.

## Setup

```bash
pip install -r requirements.txt
```

Then verify everything is wired correctly before using it anywhere
else:

```bash
python verify_consistency.py
```

Fix anything it reports before proceeding — a passing check here means
the file structure and model shapes all agree; it does not yet confirm
the model gives correct answers.

Run the state-equivalence regression test against one or two sample
videos (crash or normal, doesn't matter — this checks consistency, not
correctness):

```bash
python test_state_equivalence.py --video-a sample1.mp4 --video-b sample2.mp4
```

## Quick manual test

```bash
python run.py --video path/to/clip.mp4 --snapshot evidence.jpg --json result.json
```

## Using this from a backend

```python
from detector import analyze_video, save_crash_snapshot

result = analyze_video("/path/to/uploaded_video.mp4")

if result["collision_detected"]:
    vehicle = result["vehicles_involved"][0]
    save_crash_snapshot("/path/to/uploaded_video.mp4", vehicle, "snapshot.jpg")
    # combine `result` with user-submitted info (phone number, plate number)
    # and send to your notification layer from here
```

`analyze_video` is pure Python with no notebook or Colab dependency —
this folder can be dropped into any Python backend (Flask, FastAPI,
Django, a plain script) as-is, as long as the two weight files above
are present and `requirements.txt` is installed.

## What this folder does NOT include

- The dataset, or any dataset-specific paths (`Crash-1500.txt` etc.)
- Training code for the GRU or YOLO fine-tuning
- The threshold-tuning / model-comparison experiments that led to
  choosing this architecture
- The notification system (SMS/email to an authority), or any
  frontend/backend web application — those are separate pieces that
  consume `analyze_video`'s output, not part of the detection core.
