"""
Angry Sheep — ArUco tracking server

New flow (every ~30ms, while running):

    ┌──────────┐     ┌─────────────┐     ┌─────────────┐
    │ OpenCV   │ ──► │ ArUco       │ ──► │ WebSocket   │
    │ (camera) │     │ (detect IDs)│     │ (JSON out)  │
    └──────────┘     └─────────────┘     └─────────────┘
         │                  │                   │
    BGR frame          id, x, y,           all connected
    from webcam        angle, dir_*        clients

1. OpenCV  — VideoCapture reads a frame from the default webcam.
2. ArUco   — Grayscale + detectMarkers (DICT_4X4_50); build marker list.
3. WebSocket — Serialize JSON and send to every connected client.

Async: a WebSocket server accepts clients; a parallel loop captures and broadcasts.
See server/README.md for camera, printed markers, and how to test the full chain.
"""
import asyncio
import json
import math
import sys

import cv2
import websockets

# ---------------------------------------------------------------------------
# 1) OpenCV — camera
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


cap = open_camera(CAMERA_INDEX)

# ---------------------------------------------------------------------------
# 2) ArUco — dictionary + detector (must match printed markers)
# ---------------------------------------------------------------------------

aruco = cv2.aruco
ARUCO_DICTIONARY = aruco.DICT_4X4_50
dictionary = aruco.getPredefinedDictionary(ARUCO_DICTIONARY)
parameters = aruco.DetectorParameters()

# Only emit these marker IDs. OpenCV often hallucinates random IDs (e.g. 17, 37) on
# noise, glare, or background texture. Set to None to allow all DICT_4X4_50 ids (0–49).
ALLOWED_MARKER_IDS = frozenset(range(0, 11))  # same default set as markers/generate_markers.py


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
            # Corners clockwise from marker top-left; edge 0→1 = “top” of tag in the image.
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
# 3) WebSocket — who is listening, and sending JSON
# ---------------------------------------------------------------------------

clients = set()


async def websocket_handler(websocket):
    """Register a client; remove when they disconnect."""
    clients.add(websocket)
    try:
        await websocket.wait_closed()
    finally:
        clients.remove(websocket)


async def broadcast_markers_json(message: str):
    """Send one JSON string to all clients; drop broken connections."""
    for ws in list(clients):
        try:
            await ws.send(message)
        except Exception:
            clients.discard(ws)


async def capture_and_stream_loop():
    """
    Core loop: OpenCV read → ArUco → WebSocket.
    Runs forever alongside the WebSocket server.
    """
    while True:
        ret, frame = cap.read()
        if not ret:
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
        "  Flow: OpenCV (camera) → ArUco (DICT_4X4_50) → WebSocket JSON\n"
        "  URL:  ws://%s:%s\n"
        "  Docs: server/README.md"
        % (host, port)
    )
    async with websockets.serve(websocket_handler, host, port):
        await capture_and_stream_loop()


if __name__ == "__main__":
    asyncio.run(main())
