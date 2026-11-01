"""
test_state_equivalence.py

A regression test, not a unit test of correctness — it does not check
whether detections are "right," only that the system behaves
CONSISTENTLY. Specifically it guards against a real bug class that
came up repeatedly during development: YOLO's ByteTrack keeps internal
state across calls when persist=True, so if that state isn't reset
between videos, a video's tracking results can be subtly influenced by
whatever video ran before it in the same process — the IDs, growth
calculations, etc. silently become order-dependent.

This test checks two things:

  1. SAME-VIDEO EQUIVALENCE
     Running analyze_video() on the same file twice, in the same
     process, produces the same collision_detected / confidence /
     impact_frame. If this fails, something is retaining state between
     calls that shouldn't be.

  2. ORDER INDEPENDENCE
     Running analyze_video() on video A, then B, then A again, gives
     the same result for A both times — i.e. processing B in between
     did not change A's result. This is the direct regression test for
     the tracker-state-leak bug class.

Usage:
    python test_state_equivalence.py --video-a path/to/one.mp4 --video-b path/to/other.mp4

If you only have one test video available, pass the same path for
both --video-a and --video-b; test 2 becomes a weaker but still useful
"running it twice in a row doesn't drift" check.
"""

import argparse
import sys

from detector import analyze_video


def results_match(r1, r2, tol=1e-6):
    if r1["collision_detected"] != r2["collision_detected"]:
        return False, "collision_detected differs"
    if abs(r1["confidence"] - r2["confidence"]) > tol:
        return False, f"confidence differs: {r1['confidence']} vs {r2['confidence']}"
    if r1.get("impact_frame") != r2.get("impact_frame"):
        return False, f"impact_frame differs: {r1.get('impact_frame')} vs {r2.get('impact_frame')}"
    return True, ""


def main():
    parser = argparse.ArgumentParser(description="State-equivalence regression test for analyze_video().")
    parser.add_argument("--video-a", required=True, help="Path to the first test video")
    parser.add_argument("--video-b", required=True,
                         help="Path to a second, different test video (can equal --video-a if that's all you have)")
    args = parser.parse_args()

    failures = []

    # ---------------- Test 1: same video, run twice ----------------
    print(f"[Test 1] Running analyze_video twice on: {args.video_a}")
    r1 = analyze_video(args.video_a)
    r2 = analyze_video(args.video_a)
    ok, detail = results_match(r1, r2)
    if ok:
        print("  [OK] Same video produced identical results on both runs.")
    else:
        print(f"  [FAIL] Results differ between runs: {detail}")
        failures.append("same-video equivalence")

    # ---------------- Test 2: order independence ----------------
    print(f"\n[Test 2] Running A -> B -> A, checking A's result is unaffected by B in between")
    print(f"  A = {args.video_a}")
    print(f"  B = {args.video_b}")
    r_a1 = analyze_video(args.video_a)
    _ = analyze_video(args.video_b)   # run something else in between
    r_a2 = analyze_video(args.video_a)
    ok, detail = results_match(r_a1, r_a2)
    if ok:
        print("  [OK] Video A's result was unaffected by processing video B in between.")
    else:
        print(f"  [FAIL] Video A's result changed after processing B: {detail}")
        print("         This usually means tracker/model state is leaking between videos —")
        print("         check that yolo_model.predictor is reset before each video "
              "(see run_yolo_tracking in roadresq_core.py).")
        failures.append("order independence (state leak)")

    # ---------------- Summary ----------------
    print("\n=== Summary ===")
    if failures:
        print(f"{len(failures)} test(s) FAILED: {', '.join(failures)}")
        sys.exit(1)
    else:
        print("All state-equivalence tests passed.")
        sys.exit(0)


if __name__ == "__main__":
    main()
