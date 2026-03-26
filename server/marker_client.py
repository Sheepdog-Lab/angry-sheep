#!/usr/bin/env python3
"""
WebSocket client for the angry-sheep ArUco server.

Speaks the same protocol as server.py: JSON text frames with markers that include
position (x, y center) and heading (angle_deg, dir_x, dir_y) from ArUco corner geometry.

Run server first:  python server/server.py
Then:             python server/marker_client.py
"""
import argparse
import asyncio
import json
import sys
from typing import Any, Dict, List, Optional, Tuple

import websockets


def parse_marker_payload(raw: str) -> Tuple[Optional[int], Optional[int], List[Dict[str, Any]]]:
    data = json.loads(raw)
    if isinstance(data, list):
        return None, None, data
    markers = data.get("markers")
    if not isinstance(markers, list):
        markers = []
    w = data.get("width")
    h = data.get("height")
    return (
        int(w) if isinstance(w, int) else None,
        int(h) if isinstance(h, int) else None,
        markers,
    )


async def run(uri: str, raw: bool) -> None:
    try:
        async with websockets.connect(uri) as ws:
            if not raw:
                print(f"Connected to {uri} (Ctrl+C to quit)\n", file=sys.stderr)
            async for message in ws:
                if raw:
                    print(message)
                    continue
                width, height, markers = parse_marker_payload(message)
                parts = [
                    f"w={width} h={height}",
                    f"n={len(markers)}",
                ]
                for m in markers:
                    mid = m.get("id", "?")
                    x = m.get("x", "?")
                    y = m.get("y", "?")
                    ang = m.get("angle_deg")
                    ux = m.get("dir_x")
                    uy = m.get("dir_y")
                    if ang is not None and ux is not None and uy is not None:
                        parts.append(
                            f"id{mid} pos=({x},{y}) θ={ang}° dir=({ux},{uy})"
                        )
                    else:
                        parts.append(f"id{mid} pos=({x},{y})")
                line = " | ".join(parts)
                print(line, end="\r", flush=True)
    except websockets.exceptions.InvalidURI as e:
        print(f"Invalid URI: {e}", file=sys.stderr)
        sys.exit(2)
    except (ConnectionRefusedError, OSError) as e:
        print(f"Could not connect to {uri}: {e}", file=sys.stderr)
        sys.exit(1)
    except asyncio.CancelledError:
        raise
    except KeyboardInterrupt:
        if not raw:
            print("\nDisconnected.", file=sys.stderr)


def main() -> None:
    p = argparse.ArgumentParser(description="WebSocket client for ArUco marker stream.")
    p.add_argument(
        "--uri",
        default="ws://127.0.0.1:8765",
        help="Server WebSocket URL (default: ws://127.0.0.1:8765)",
    )
    p.add_argument(
        "--raw",
        action="store_true",
        help="Print each frame as raw JSON (no live status line).",
    )
    args = p.parse_args()
    try:
        asyncio.run(run(args.uri, args.raw))
    except KeyboardInterrupt:
        if not args.raw:
            print("\nDisconnected.", file=sys.stderr)


if __name__ == "__main__":
    main()
