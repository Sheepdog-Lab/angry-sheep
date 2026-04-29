# Multiplayer relay (WebSocket)

Angry Sheep’s **online co-op** uses this tiny relay so every browser with the same `?room=YOURCODE` can join one session.

## Run locally

```bash
cd server/mp-relay
npm install
npm start          # listens on port 8788 (override with MP_PORT=9000)
```

In another terminal, start the web app from `web/`:

```bash
cd web
npm run dev        # Vite proxies ws://<host>/mp-ws → ws://127.0.0.1:8788
```

### Same room without typing a code

- **`/join.html`** — redirects to `/?join`, which puts everyone in the **default public lobby** (room id `asg-public`, unless you set `VITE_PUBLIC_ROOM` at build time).
- **`/?join`** — same as above.
- **`/?join=myteam`** — everyone who uses that exact slug shares one room.

### Explicit room

`http://localhost:5173/?room=barn1`

- The **first** tab that connects is the **host** (runs sheep + tools).
- **Later** tabs are **guests** (see the same game; they can **pet** and use **V / U / I** for kind voice; input is merged on the host).

## Deploy

1. Run this relay on a host reachable from the internet (TLS termination optional).
2. Set **`VITE_MP_WS`** when building the web app to your public WebSocket URL, e.g.  
   `VITE_MP_WS=wss://your-server.example/mp` then `npm run build`.

3. Optional: set **`VITE_PUBLIC_ROOM=live`** so the **homepage `/`** also auto-joins that room (no `?join` needed). If set, `/?join` with no slug uses this value instead of `asg-public`.

Without `VITE_MP_WS`, production builds do not connect (digital mode only).
