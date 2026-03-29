# Web dev on old Node (14.x)

The main app lives in **`web/`** and targets **Vite 6** (**Node 18+**). Do not change `web/package.json` for legacy Node.

If you are stuck on **Node 14** and `npm run dev` fails in `web/`, use **this folder** instead. It installs **Vite 2** and sets `root` to the repo’s **`web/`** folder (same `index.html` and `src/`).

```bash
cd dev/web-node14
npm install
npm run dev
```

Open **http://localhost:5173/** (same port as the README for the main app). **ArUco dots** on the table need **`python server/server.py`** running in another terminal (same machine).

To work on the real toolchain, upgrade Node (e.g. [nvm](https://github.com/nvm-sh/nvm)) and use **`web/`** only.
