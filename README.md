# angry-sheep

Tabletop museum experience: browser client + Python OpenCV WebSocket server for ArUco marker tracking.

## Repo layout

| Path | Purpose |
|------|--------|
| `client/` | HTML / CSS / JS (canvas + WebSocket client) |
| `server/` | `server.py`, `requirements.txt` (OpenCV + websockets) |
| `markers/` | Optional printed ArUco assets (see `markers/README.md`) |
| *(repo root)* | Docs, `package.json`, `README.md`, design notes |

## Python server

```bash
cd /path/to/angry-sheep
python3 -m venv venv
source venv/bin/activate   # Mac/Linux
pip install -r server/requirements.txt
python server/server.py
```

Uses the default camera and serves WebSockets on **ws://localhost:8765**.

## Browser client

In another terminal (repo root):

```bash
npm run client
```

Open the URL it prints (e.g. **http://localhost:3000**). Ensure the Python server is running and the camera is allowed in system privacy settings.

## Team notes

- Keep **client** and **server** changes in separate commits when possible.
- Do not commit `venv/` or `node_modules/` (see `.gitignore`).
