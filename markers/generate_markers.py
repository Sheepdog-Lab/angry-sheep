#!/usr/bin/env python3
"""
Generate printable ArUco marker images (DICT_4X4_50).

Requires OpenCV contrib (same stack as server/requirements.txt).

Usage (from repo root, venv active):
  python markers/generate_markers.py
  python markers/generate_markers.py --ids 0-10 --size 400 --out markers/generated
"""
import argparse
import os
import sys

import cv2

ARUCO = cv2.aruco
DICT = ARUCO.getPredefinedDictionary(ARUCO.DICT_4X4_50)


def render_marker(marker_id, side_px, border_bits=1):
    """Return uint8 grayscale image of the marker."""
    if hasattr(ARUCO, "generateImageMarker"):
        return ARUCO.generateImageMarker(DICT, marker_id, side_px, borderBits=border_bits)
    # OpenCV < 4.7 (contrib)
    img = ARUCO.drawMarker(DICT, marker_id, side_px)
    return img


def parse_id_range(spec):
    """Parse '0-10' or '5' into a list of ids."""
    spec = spec.strip()
    if "-" in spec:
        a, b = spec.split("-", 1)
        lo, hi = int(a), int(b)
        if lo > hi:
            lo, hi = hi, lo
        return list(range(lo, hi + 1))
    return [int(spec)]


def main():
    p = argparse.ArgumentParser(description="Generate DICT_4X4_50 ArUco PNGs for printing.")
    p.add_argument(
        "--ids",
        default="0-10",
        help="Single id (e.g. 3) or inclusive range (e.g. 0-10). Default: 0-10",
    )
    p.add_argument(
        "--size",
        type=int,
        default=400,
        help="Marker image side length in pixels (default 400; larger prints easier).",
    )
    p.add_argument(
        "--out",
        default="",
        help="Output directory (default: markers/generated next to this script).",
    )
    p.add_argument(
        "--border-bits",
        type=int,
        default=1,
        help="Quiet zone in marker modules (default 1).",
    )
    args = p.parse_args()

    try:
        ids = parse_id_range(args.ids)
    except ValueError as e:
        print("Bad --ids:", e, file=sys.stderr)
        sys.exit(2)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_dir = args.out or os.path.join(script_dir, "generated")
    os.makedirs(out_dir, exist_ok=True)

    for mid in ids:
        if mid < 0 or mid > 49:
            print("Warning: DICT_4X4_50 only supports ids 0–49; skipping", mid, file=sys.stderr)
            continue
        img = render_marker(mid, args.size, border_bits=args.border_bits)
        path = os.path.join(out_dir, "aruco_4x4_50_id_{:02d}.png".format(mid))
        if not cv2.imwrite(path, img):
            print("Failed to write", path, file=sys.stderr)
            sys.exit(1)
        print("Wrote", path, file=sys.stderr)

    print(
        "Done. Print PNGs at 100% scale (no fit-to-page) for predictable physical size.",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
