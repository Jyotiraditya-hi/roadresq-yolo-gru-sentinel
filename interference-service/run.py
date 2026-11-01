"""
run.py

Command-line entry point for RoadResQ. Run this to analyze a single
video from a terminal, without writing any extra code.

Usage:
    python run.py --video path/to/clip.mp4
    python run.py --video path/to/clip.mp4 --snapshot out.jpg
    python run.py --video path/to/clip.mp4 --json result.json
"""

import argparse
import json
import sys

from detector import analyze_video, save_crash_snapshot


def main():
    parser = argparse.ArgumentParser(description="Analyze a video for a vehicle collision.")
    parser.add_argument("--video", required=True, help="Path to the input video file (.mp4)")
    parser.add_argument("--snapshot", default=None,
                         help="If a crash is detected, save an annotated snapshot image here")
    parser.add_argument("--json", default=None,
                         help="Also write the full result as JSON to this path")
    parser.add_argument("--max-frames", type=int, default=None,
                         help="Optionally cap how many frames of the video are analyzed")
    args = parser.parse_args()

    print(f"Analyzing: {args.video}")
    result = analyze_video(args.video, max_frames=args.max_frames)

    print("\n--- Result ---")
    print(json.dumps(result, indent=2))

    if result["collision_detected"]:
        print(f"\n  Collision detected (confidence {result['confidence']}) "
              f"around frame {result['impact_frame']}.")
        for v in result["vehicles_involved"]:
            print(f"   - {v['class']} seen at frame {v['frame']}, bbox={v['bbox']}")

        if args.snapshot and result["vehicles_involved"]:
            path = save_crash_snapshot(args.video, result["vehicles_involved"][0], args.snapshot)
            print(f"\nSnapshot saved to: {path}")
    else:
        print("\n No collision detected.")

    if args.json:
        with open(args.json, "w") as f:
            json.dump(result, f, indent=2)
        print(f"\nFull result written to: {args.json}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
