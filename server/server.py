import asyncio
import json
import math
import sys

import cv2
import websockets

# ArUco setup
aruco = cv2.aruco
dictionary = aruco.getPredefinedDictionary(aruco.DICT_4X4_50)
parameters = aruco.DetectorParameters()

cap = cv2.VideoCapture(0)
if not cap.isOpened():
    print(
        "Error: could not open camera (index 0). "
        "Allow Camera for Terminal/Cursor in System Settings → Privacy & Security → Camera, "
        "and close other apps using the webcam.",
        file=sys.stderr,
    )
    sys.exit(1)

clients = set()

async def handler(websocket):
    clients.add(websocket)
    try:
        await websocket.wait_closed()
    finally:
        clients.remove(websocket)

async def send_data():
    while True:
        ret, frame = cap.read()
        if not ret:
            await asyncio.sleep(0.05)
            continue

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        corners, ids, _ = aruco.detectMarkers(gray, dictionary, parameters=parameters)

        markers = []

        if ids is not None:
            for i, marker_id in enumerate(ids):
                pts = corners[i][0]
                cx = int(pts[:, 0].mean())
                cy = int(pts[:, 1].mean())
                # OpenCV: corners clockwise from marker top-left; 0→1 is “top” edge in marker frame.
                p0, p1 = pts[0], pts[1]
                edx = float(p1[0] - p0[0])
                edy = float(p1[1] - p0[1])
                elen = math.hypot(edx, edy) or 1.0
                markers.append({
                    "id": int(marker_id[0]),
                    "x": cx,
                    "y": cy,
                    "angle_deg": round(math.degrees(math.atan2(edy, edx)), 2),
                    "dir_x": round(edx / elen, 4),
                    "dir_y": round(edy / elen, 4),
                })

        h, w = frame.shape[:2]
        message = json.dumps(
            {"width": w, "height": h, "markers": markers}
        )

        for ws in list(clients):
            try:
                await ws.send(message)
            except Exception:
                clients.discard(ws)

        await asyncio.sleep(0.03)

async def main():
    host = "127.0.0.1"
    port = 8765
    print(f"ArUco server: WebSocket ws://{host}:{port} — connect a WebSocket client to receive marker JSON.")
    async with websockets.serve(handler, host, port):
        await send_data()

asyncio.run(main())
