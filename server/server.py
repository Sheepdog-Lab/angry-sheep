import cv2
import asyncio
import websockets
import json

# ArUco setup
aruco = cv2.aruco
dictionary = aruco.getPredefinedDictionary(aruco.DICT_4X4_50)
parameters = aruco.DetectorParameters()

cap = cv2.VideoCapture(0)

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
            continue

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        corners, ids, _ = aruco.detectMarkers(gray, dictionary, parameters=parameters)

        markers = []

        if ids is not None:
            for i, marker_id in enumerate(ids):
                pts = corners[i][0]
                cx = int(pts[:, 0].mean())
                cy = int(pts[:, 1].mean())
                markers.append({
                    "id": int(marker_id[0]),
                    "x": cx,
                    "y": cy
                })

        h, w = frame.shape[:2]
        message = json.dumps(
            {"width": w, "height": h, "markers": markers}
        )

        for ws in clients:
            await ws.send(message)

        await asyncio.sleep(0.03)

async def main():
    async with websockets.serve(handler, "localhost", 8765):
        await send_data()

asyncio.run(main())
