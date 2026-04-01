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
CAMERA_WIDTH = 1280
CAMERA_HEIGHT = 720
SHOW_DEBUG_WINDOWS = False


def configure_camera(cap):
    """Apply fallback camera settings for small / distant marker detection."""
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)
    return cap


def open_camera(index=CAMERA_INDEX):
    """Open the default (or given-index) webcam. Returns None if it fails."""
    cap = configure_camera(cv2.VideoCapture(index))
    if not cap.isOpened():
        print(
            "OpenCV: could not open fallback camera (index %d).\n"
            "  • macOS: System Settings → Privacy & Security → Camera → allow Terminal or Cursor.\n"
            "  • Quit Zoom/Meet/other apps using the camera.\n"
            "  • Browser camera preview will still work; OpenCV fallback stays disabled."
            % index,
            file=sys.stderr,
        )
        cap.release()
        return None
    return cap


def try_open_camera(index):
    """Try to open a camera index without exiting the process."""
    cap = configure_camera(cv2.VideoCapture(index))
    return cap if cap.isOpened() else None


cap = None

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
    global _browser_bgr, _browser_mono, cap
    now = time.monotonic()
    if _browser_bgr is not None and (now - _browser_mono) < BROWSER_FRAME_TTL_SEC:
        if cap is not None:
            cap.release()
            cap = None
        return _browser_bgr, "browser"
    if cap is None:
        cap = open_camera(CAMERA_INDEX)
        if cap is not None:
            print("OpenCV fallback camera -> index %d" % CAMERA_INDEX, flush=True)
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
parameters.adaptiveThreshWinSizeMin = 3
parameters.adaptiveThreshWinSizeMax = 23
parameters.adaptiveThreshWinSizeStep = 10
parameters.minMarkerPerimeterRate = 0.01
parameters.maxMarkerPerimeterRate = 4.0
parameters.cornerRefinementMethod = aruco.CORNER_REFINE_SUBPIX
detector = (
    aruco.ArucoDetector(dictionary, parameters)
    if hasattr(aruco, "ArucoDetector")
    else None
)

ALLOWED_MARKER_IDS = None


def preprocess_for_detection(frame_bgr):
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    thresh = cv2.adaptiveThreshold(
        blurred,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        21,
        7,
    )
    return gray, thresh


def detect_markers_bgr(frame_bgr):
    """
    Run ArUco on one BGR frame. Returns (width, height, markers_list, debug_frame, processed).
    markers_list entries: id, x, y (center px), angle_deg, dir_x, dir_y.
    """
    gray, processed = preprocess_for_detection(frame_bgr)
    debug_frame = frame_bgr.copy()

    def run_detect(img):
        if detector is not None:
            return detector.detectMarkers(img)
        return aruco.detectMarkers(img, dictionary, parameters=parameters)

    corners, ids, _rejected = run_detect(gray)
    if ids is None or len(ids) == 0:
        corners, ids, _rejected = run_detect(processed)

    markers = []
    if ids is not None:
        aruco.drawDetectedMarkers(debug_frame, corners, ids)
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
    return w, h, markers, debug_frame, processed


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
    global cap, CAMERA_INDEX
    while True:
        try:
            while True:
                new_idx = camera_commands.get_nowait()
                CAMERA_INDEX = new_idx
                if cap is not None:
                    cap.release()
                    cap = None
                ncap = try_open_camera(new_idx)
                if ncap is not None:
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

        w, h, markers, debug_frame, processed = detect_markers_bgr(frame)
        message = json.dumps({"width": w, "height": h, "markers": markers})

        if SHOW_DEBUG_WINDOWS:
            cv2.imshow("ArUco Debug", debug_frame)
            cv2.imshow("ArUco Threshold", processed)
            cv2.waitKey(1)

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
    try:
        asyncio.run(main())
    finally:
        if cap is not None:
            cap.release()
        if SHOW_DEBUG_WINDOWS:
            cv2.destroyAllWindows()
