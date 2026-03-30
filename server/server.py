"""
Angry Sheep — ArUco tracking server

Flow:
  • Prefer JPEG frames from the browser (same camera as the <video> preview).
  • If no fresh browser frame, fall back to OpenCV VideoCapture.

Clients may send:
  • {"cmd": "frameJpeg", "data": "<base64 jpeg>"}  — decoded and run through ArUco
  • {"cmd": "setCameraIndex", "index": N}         — switch OpenCV fallback camera

See server/README.md
"""
import asyncio
import base64
import json
import math
import sys
import time

import cv2
import numpy as np
import websockets

# ---------------------------------------------------------------------------
# 1) OpenCV — camera (fallback when browser is not sending frames)
# ---------------------------------------------------------------------------

CAMERA_INDEX = 0


def open_camera(index=CAMERA_INDEX):
    """Open the default (or given-index) webcam. Exits the process if it fails."""
    cap = cv2.VideoCapture(index)
    if not cap.isOpened():
        print(
            "Error: could not open camera (index %d).\n"
            "  • macOS: System Settings → Privacy & Security → Camera → allow Terminal or Cursor.\n"
            "  • Quit Zoom/Meet/other apps using the camera.\n"
            "  • Try CAMERA_INDEX = 1 in server.py if you have multiple cameras."
            % index,
            file=sys.stderr,
        )
        sys.exit(1)
    return cap


def try_open_camera(index):
    """Try to open a camera index without exiting the process."""
    cap = cv2.VideoCapture(index)
    return cap if cap.isOpened() else None


cap = open_camera(CAMERA_INDEX)

camera_commands = asyncio.Queue()

# Latest frame from browser (BGR); OpenCV index order often ≠ getUserMedia order.
_browser_bgr = None
_browser_mono = 0.0
BROWSER_FRAME_TTL_SEC = 0.55


def ingest_browser_jpeg_b64(b64s):
    """Decode base64 JPEG into BGR image; update shared buffer."""
    global _browser_bgr, _browser_mono
    try:
        raw = base64.b64decode(b64s)
        arr = np.frombuffer(raw, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is not None and img.size > 0:
            _browser_bgr = img
            _browser_mono = time.monotonic()
    except Exception:
        pass


def take_frame_for_detection():
    """Return (frame_bgr, source_str) or (None, None)."""
    global _browser_bgr, _browser_mono
    now = time.monotonic()
    if _browser_bgr is not None and (now - _browser_mono) < BROWSER_FRAME_TTL_SEC:
        return _browser_bgr, "browser"
    ret, frame = cap.read()
    if ret and frame is not None and frame.size > 0:
        return frame, "opencv"
    return None, None


# ---------------------------------------------------------------------------
# 2) ArUco — dictionary + detector (must match printed markers)
# ---------------------------------------------------------------------------

aruco = cv2.aruco
ARUCO_DICTIONARY = aruco.DICT_4X4_50
dictionary = aruco.getPredefinedDictionary(ARUCO_DICTIONARY)
parameters = aruco.DetectorParameters()

ALLOWED_MARKER_IDS = frozenset(range(0, 11))


def detect_markers_bgr(frame_bgr):
    """
    Run ArUco on one BGR frame. Returns (width, height, markers_list).
    markers_list entries: id, x, y (center px), angle_deg, dir_x, dir_y.
    """
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    corners, ids, _ = aruco.detectMarkers(gray, dictionary, parameters=parameters)

    markers = []
    if ids is not None:
        for i, marker_id in enumerate(ids):
            mid = int(marker_id[0])
            if ALLOWED_MARKER_IDS is not None and mid not in ALLOWED_MARKER_IDS:
                continue
            pts = corners[i][0]
            cx = int(pts[:, 0].mean())
            cy = int(pts[:, 1].mean())
            p0, p1 = pts[0], pts[1]
            edx = float(p1[0] - p0[0])
            edy = float(p1[1] - p0[1])
            elen = math.hypot(edx, edy) or 1.0
            markers.append(
                {
                    "id": mid,
                    "x": cx,
                    "y": cy,
                    "angle_deg": round(math.degrees(math.atan2(edy, edx)), 2),
                    "dir_x": round(edx / elen, 4),
                    "dir_y": round(edy / elen, 4),
                }
            )

    h, w = frame_bgr.shape[:2]
    return w, h, markers


# ---------------------------------------------------------------------------
# 3) WebSocket
# ---------------------------------------------------------------------------

clients = set()


async def websocket_handler(websocket):
    """Register client; read control + JPEG frames; remove on disconnect."""
    clients.add(websocket)
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
            except (json.JSONDecodeError, TypeError):
                continue
            if not isinstance(data, dict):
                continue
            cmd = data.get("cmd")
            if cmd == "frameJpeg":
                b64 = data.get("data")
                if isinstance(b64, str) and b64:
                    ingest_browser_jpeg_b64(b64)
                continue
            if cmd == "setCameraIndex":
                try:
                    idx = int(data.get("index", 0))
                except (TypeError, ValueError):
                    continue
                if idx < 0:
                    continue
                await camera_commands.put(idx)
    finally:
        clients.remove(websocket)


async def broadcast_markers_json(message: str):
    for ws in list(clients):
        try:
            await ws.send(message)
        except Exception:
            clients.discard(ws)


async def capture_and_stream_loop():
    global cap
    while True:
        try:
            while True:
                new_idx = camera_commands.get_nowait()
                ncap = try_open_camera(new_idx)
                if ncap is not None:
                    cap.release()
                    cap = ncap
                    print("OpenCV fallback camera -> index %d" % new_idx, flush=True)
                else:
                    print(
                        "OpenCV: could not open camera index %d (keeping previous)"
                        % new_idx,
                        file=sys.stderr,
                    )
        except asyncio.QueueEmpty:
            pass

        frame, _src = take_frame_for_detection()
        if frame is None:
            await asyncio.sleep(0.05)
            continue

        w, h, markers = detect_markers_bgr(frame)
        message = json.dumps({"width": w, "height": h, "markers": markers})

        await broadcast_markers_json(message)
        await asyncio.sleep(0.03)


async def main():
    host = "127.0.0.1"
    port = 8765
    print(
        "Tracking server running.\n"
        "  Primary: JPEG frames from browser (same camera as UI preview).\n"
        "  Fallback: OpenCV VideoCapture if no fresh browser frames.\n"
        "  URL:  ws://%s:%s\n"
        "  Docs: server/README.md"
        % (host, port)
    )
    async with websockets.serve(
        websocket_handler,
        host,
        port,
        max_size=16 * 1024 * 1024,
    ):
        await capture_and_stream_loop()


if __name__ == "__main__":
    asyncio.run(main())
