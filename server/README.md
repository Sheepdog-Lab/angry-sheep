# Python tracking server (`server.py`)

This process ties **your webcam**, **printed ArUco markers**, and **WebSocket clients** into one pipeline.

## The flow (what `server.py` does)

Each frame, in order:

1. **OpenCV** — Grab a color image from the camera (`VideoCapture`).
2. **ArUco** — Find square markers in that image (dictionary **DICT_4X4_50**). For each tag you get **ID**, **center (x, y)**, and **which way it’s rotated** in the image.
3. **WebSocket** — Send one JSON message to every connected program (browser, `marker_client.py`, game engine, etc.).

Nothing works end-to-end until all three pieces are in place: camera allowed, markers printed with the **same** dictionary, and a client connected to `ws://127.0.0.1:8765`.

---

## How to connect everything (checklist)

### A. Python environment (once per machine)

From the **repo root** (folder that contains `server/` and `web/`):

```bash
cd /path/to/angry-sheep
python3 -m venv venv
source venv/bin/activate          # Mac/Linux
pip install -r server/requirements.txt
```

You need **opencv-contrib-python** (ArUco lives in “contrib”).

### B. Camera

1. Plug in / use the built-in webcam.
2. **macOS:** **System Settings → Privacy & Security → Camera** — turn on access for **Terminal** or **Cursor** (whichever you use to run Python).
3. Close other apps that might lock the camera (Zoom, Photo Booth, etc.).
4. If the server says it can’t open the camera, try changing **`CAMERA_INDEX`** in `server.py` from `0` to `1` (second camera).

### C. Printed markers (must match the code)

- Dictionary: **DICT_4X4_50** (IDs **0–49** only).
- Generate PNGs from the repo:

  ```bash
  source venv/bin/activate
  python markers/generate_markers.py
  ```

- Print **`markers/generated/*.png`** at **100% scale** (don’t “shrink to fit” unless everyone agrees on size). Bigger tags are easier for the webcam.
- Details: **`markers/README.md`**.

### D. Run the server

```bash
cd /path/to/angry-sheep
source venv/bin/activate
python server/server.py
```

You should see a line with **`ws://127.0.0.1:8765`**. Leave this terminal open.

### E. Connect a client (prove the pipe works)

**Option 1 — Python test client (no web UI):**

```bash
# second terminal, same venv
python server/marker_client.py
```

Hold printed markers in front of the camera; the terminal should show **IDs and positions** updating.

**Option 2 — Web app:**  
The `web/` app currently uses **mock** mouse/keyboard input. Wiring it to this WebSocket is a separate integration step (same JSON contract the team defines in the frontend).

---

## False-positive IDs

OpenCV can briefly “see” wrong marker IDs (e.g. 17, 37) on glare or clutter. By default **`server.py` only emits IDs 0–10**, matching `markers/generate_markers.py`. Change **`ALLOWED_MARKER_IDS`** in `server.py` to `None` for all 0–49, or `frozenset({...})` for a custom set. Match **`allowedMarkerIds`** in `web/src/config.js` for the overlay.

## JSON over WebSocket (one message per frame)

```json
{
  "width": 640,
  "height": 480,
  "markers": [
    {
      "id": 3,
      "x": 120,
      "y": 200,
      "angle_deg": -15.5,
      "dir_x": 0.96,
      "dir_y": -0.27
    }
  ]
}
```

`x` / `y` are the marker **center** in **camera pixels**. `angle_deg` / `dir_*` describe how the tag is **rotated in the image** (not full 3D pose unless you add calibration later).

---

## Files here

| File | Role |
|------|------|
| `server.py` | OpenCV + ArUco + WebSocket server |
| `marker_client.py` | Minimal subscriber to test the stream |
| `requirements.txt` | Python dependencies |
