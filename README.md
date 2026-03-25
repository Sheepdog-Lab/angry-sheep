# angry-sheep

Tabletop museum experience: Python OpenCV WebSocket server for ArUco marker tracking.

## Repo layout

| Path | Purpose |
|------|--------|
| `server/` | `server.py`, `requirements.txt` (OpenCV + websockets) |
| `markers/` | Optional printed ArUco assets (see `markers/README.md`) |
| *(repo root)* | Docs, `README.md`, design notes |

## Python server

```bash
cd /path/to/angry-sheep
python3 -m venv venv
source venv/bin/activate   # Mac/Linux
pip install -r server/requirements.txt
python server/server.py
```

Uses the default camera and serves WebSockets on **ws://127.0.0.1:8765**.

Messages are JSON objects: `{"width": <int>, "height": <int>, "markers": [{"id": <int>, "x": <int>, "y": <int>}, ...]}` (pixel coordinates in the camera frame).

## Team notes

- Do not commit `venv/` (see `.gitignore`).
