# angry-sheep

Tabletop museum experience: Python OpenCV WebSocket server for ArUco marker tracking.

## Repo layout

| Path | Purpose |
|------|--------|
| `server/` | `server.py`, `marker_client.py`, `requirements.txt` |
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

Messages are JSON objects with `width`, `height`, and `markers`. Each marker has `id`, `x`, `y` (center, pixels), `angle_deg` (in-plane heading of the marker’s top edge: 0° = right in the image, 90° = down), and unit vector `dir_x`, `dir_y` along that edge.

## Python client (same protocol)

In a **second** terminal (venv active), while `server.py` is running:

```bash
python server/marker_client.py
```

Optional: `python server/marker_client.py --raw` prints one JSON line per frame; `--uri ws://HOST:PORT` if the server is not local.

## Team notes

- Do not commit `venv/` (see `.gitignore`).
