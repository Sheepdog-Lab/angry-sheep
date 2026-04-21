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
from pathlib import Path

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
CALIBRATION_PATH = Path(__file__).with_name("calibration.json")
CALIBRATION_ORDER = ("top", "right", "bottom", "left")
TABLE_RADIUS = 0.48
CALIBRATION_RADIUS_SCALE = 0.864  # moved another 20% wider from the 0.72 setting
CALIBRATION_RADIUS = TABLE_RADIUS * CALIBRATION_RADIUS_SCALE
SCREEN_POINTS = np.float32(
    [
        [0.5, 0.5 - CALIBRATION_RADIUS],
        [0.5 + CALIBRATION_RADIUS, 0.5],
        [0.5, 0.5 + CALIBRATION_RADIUS],
        [0.5 - CALIBRATION_RADIUS, 0.5],
    ]
)

camera_points = []
homography_matrix = None
calibration_mode = False
latest_camera_markers = []
calibration_message = ""
calibration_notice_id = 0


def set_calibration_message(message):
    global calibration_message, calibration_notice_id
    calibration_message = message
    calibration_notice_id += 1


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


def calibration_state_payload():
    return {
        "active": calibration_mode,
        "count": len(camera_points),
        "nextCorner": CALIBRATION_ORDER[min(len(camera_points), 3)]
        if len(camera_points) < 4
        else "complete",
        "loaded": homography_matrix is not None,
        "message": calibration_message,
        "noticeId": calibration_notice_id,
    }


def load_calibration():
    global camera_points, homography_matrix
    if not CALIBRATION_PATH.exists():
        return
    try:
        data = json.loads(CALIBRATION_PATH.read_text())
        raw_points = data.get("camera_points")
        raw_matrix = data.get("homography_matrix")
        if (
            isinstance(raw_points, list)
            and len(raw_points) == 4
            and isinstance(raw_matrix, list)
            and len(raw_matrix) == 3
        ):
            camera_points = [[float(x), float(y)] for x, y in raw_points]
            homography_matrix = np.array(raw_matrix, dtype=np.float32)
            print("Loaded homography calibration from %s" % CALIBRATION_PATH, flush=True)
    except Exception as exc:
        print("Calibration load failed: %s" % exc, file=sys.stderr)


def save_calibration():
    if homography_matrix is None:
        return
    payload = {
        "camera_points": camera_points,
        "screen_points": SCREEN_POINTS.tolist(),
        "homography_matrix": homography_matrix.tolist(),
    }
    CALIBRATION_PATH.write_text(json.dumps(payload, indent=2))


def reset_calibration():
    global calibration_mode, camera_points, homography_matrix
    calibration_mode = True
    camera_points = []
    homography_matrix = None
    try:
        CALIBRATION_PATH.unlink(missing_ok=True)
    except Exception as exc:
        print("Calibration reset cleanup failed: %s" % exc, file=sys.stderr)
    set_calibration_message("Calibration reset: 0/4 captured. Move marker to top and press C.")
    print(
        "Calibration reset for the green play circle. Capture points in order: %s."
        % ", ".join(CALIBRATION_ORDER),
        flush=True,
    )


def capture_calibration_point():
    global calibration_mode, camera_points, homography_matrix
    if not calibration_mode:
        reset_calibration()

    if not latest_camera_markers:
        set_calibration_message(
            "No marker detected for %s. Hold one marker steady and press C again."
            % CALIBRATION_ORDER[len(camera_points)]
        )
        print("Calibration: no marker currently detected for %s." % CALIBRATION_ORDER[len(camera_points)], file=sys.stderr)
        return

    marker = sorted(latest_camera_markers, key=lambda m: m["id"])[0]
    camera_points.append([float(marker["x"]), float(marker["y"])])
    idx = len(camera_points) - 1
    print(
        "Captured %s at (%.1f, %.1f) using marker %d"
        % (CALIBRATION_ORDER[idx], marker["x"], marker["y"], marker["id"]),
        flush=True,
    )
    set_calibration_message(
        "Captured %s (%d/4)." % (CALIBRATION_ORDER[idx], len(camera_points))
    )

    if len(camera_points) < 4:
        set_calibration_message(
            "Captured %s (%d/4). Move marker to %s and press C."
            % (CALIBRATION_ORDER[idx], len(camera_points), CALIBRATION_ORDER[len(camera_points)])
        )
        print("Move marker to %s and press C again." % CALIBRATION_ORDER[len(camera_points)], flush=True)
        return

    homography_matrix = cv2.getPerspectiveTransform(
        np.array(camera_points, dtype=np.float32),
        SCREEN_POINTS,
    )
    calibration_mode = False
    save_calibration()
    set_calibration_message("Calibration complete.")
    print("Calibration complete. Homography saved to %s." % CALIBRATION_PATH, flush=True)


def transform_point(x, y):
    if homography_matrix is None:
        return None
    pts = np.array([[[float(x), float(y)]]], dtype=np.float32)
    warped = cv2.perspectiveTransform(pts, homography_matrix)
    tx, ty = warped[0, 0]
    return float(tx), float(ty)


cap = None

camera_commands = asyncio.Queue()

# Latest frame from browser: handler only stores the newest base64 string (cheap).
# JPEG decode runs in the capture loop so the WebSocket task never backs up on imdecode.
_browser_bgr = None
_browser_mono = 0.0
_browser_frame = None  # (b64_str, seq, mono) or None
_browser_seq = 0
_last_decoded_browser_seq = -1
BROWSER_FRAME_TTL_SEC = 0.55
# After each broadcast, yield so the WebSocket task can ingest new JPEGs.
# 0 = one event-loop tick only (max throughput; raise if WS ingest starves on slow machines).
STREAM_LOOP_YIELD_SEC = 0.0
# When ArUco was already run for this decoded browser frame, skip (saves CPU).
_last_streamed_browser_seq = None

load_calibration()


def ingest_browser_jpeg_b64(b64s):
    """Record latest browser JPEG (base64 only); decode happens in take_frame_for_detection."""
    global _browser_frame, _browser_seq, _browser_mono
    if not isinstance(b64s, str) or not b64s:
        return
    _browser_seq += 1
    mono = time.monotonic()
    _browser_frame = (b64s, _browser_seq, mono)
    _browser_mono = mono


def _decode_browser_jpeg_if_new():
    """Decode _browser_frame into _browser_bgr when sequence advances."""
    global _browser_bgr, _browser_frame, _last_decoded_browser_seq
    if _browser_frame is None:
        return False
    _b64, seq, _mono = _browser_frame
    if seq == _last_decoded_browser_seq:
        return _browser_bgr is not None
    try:
        raw = base64.b64decode(_b64)
        arr = np.frombuffer(raw, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is not None and img.size > 0:
            _browser_bgr = img
            _last_decoded_browser_seq = seq
            return True
    except Exception:
        pass
    return False


def take_frame_for_detection():
    """Return (frame_bgr, source_str) or (None, None)."""
    global _browser_bgr, _browser_mono, cap
    now = time.monotonic()
    if _browser_frame is not None and (now - _browser_mono) < BROWSER_FRAME_TTL_SEC:
        if cap is not None:
            cap.release()
            cap = None
        _decode_browser_jpeg_if_new()
        if _browser_bgr is not None:
            return _browser_bgr, "browser"
    if cap is None:
        cap = open_camera(CAMERA_INDEX)
        if cap is not None:
            print("OpenCV fallback camera -> index %d" % CAMERA_INDEX, flush=True)
        else:
            return None, None
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
    global latest_camera_markers
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
    latest_camera_markers = []
    if ids is not None:
        aruco.drawDetectedMarkers(debug_frame, corners, ids)
        for i, marker_id in enumerate(ids):
            mid = int(marker_id[0])
            if ALLOWED_MARKER_IDS is not None and mid not in ALLOWED_MARKER_IDS:
                continue
            pts = corners[i][0]
            cx = int(pts[:, 0].mean())
            cy = int(pts[:, 1].mean())
            latest_camera_markers.append({"id": mid, "x": cx, "y": cy})
            p0, p1 = pts[0], pts[1]
            edx = float(p1[0] - p0[0])
            edy = float(p1[1] - p0[1])
            elen = math.hypot(edx, edy) or 1.0
            warped = transform_point(cx, cy)
            if warped is not None:
                tx, ty = warped
            else:
                h, w = frame_bgr.shape[:2]
                tx = cx / float(w or 1)
                ty = cy / float(h or 1)
            markers.append(
                {
                    "id": mid,
                    "x": round(tx, 6),
                    "y": round(ty, 6),
                    "angle_deg": round(math.degrees(math.atan2(edy, edx)), 2),
                    "dir_x": round(edx / elen, 4),
                    "dir_y": round(edy / elen, 4),
                }
            )

    h, w = frame_bgr.shape[:2]
    for idx, pt in enumerate(camera_points):
        label = CALIBRATION_ORDER[idx]
        cv2.circle(debug_frame, (int(pt[0]), int(pt[1])), 10, (0, 255, 255), 2)
        cv2.putText(
            debug_frame,
            label,
            (int(pt[0]) + 12, int(pt[1]) - 8),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (0, 255, 255),
            1,
            cv2.LINE_AA,
        )
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
                continue
            if cmd == "captureCalibrationPoint":
                capture_calibration_point()
                continue
            if cmd == "resetCalibration":
                reset_calibration()
                continue
    finally:
        clients.remove(websocket)


async def broadcast_markers_json(message: str):
    for ws in list(clients):
        try:
            await ws.send(message)
        except Exception:
            clients.discard(ws)


async def capture_and_stream_loop():
    global cap, CAMERA_INDEX, _last_streamed_browser_seq
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

        frame, src = take_frame_for_detection()
        if frame is None:
            await asyncio.sleep(0.05)
            continue

        if src == "browser":
            seq = _last_decoded_browser_seq
            if (
                _last_streamed_browser_seq is not None
                and seq == _last_streamed_browser_seq
            ):
                await asyncio.sleep(0)
                continue
            _last_streamed_browser_seq = seq
        else:
            _last_streamed_browser_seq = None

        w, h, markers, debug_frame, processed = detect_markers_bgr(frame)
        message = json.dumps(
            {
                "width": 1,
                "height": 1,
                "markers": markers,
                "calibration": calibration_state_payload(),
            }
        )

        if SHOW_DEBUG_WINDOWS:
            cv2.imshow("ArUco Debug", debug_frame)
            cv2.imshow("ArUco Threshold", processed)
            cv2.waitKey(1)

        await broadcast_markers_json(message)
        await asyncio.sleep(STREAM_LOOP_YIELD_SEC)


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
