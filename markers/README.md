# ArUco markers

The server uses **DICT_4X4_50** (`cv2.aruco.DICT_4X4_50`). Print markers on stiff paper with even lighting for reliable tracking.

## Step 5 — Generate PNGs for printing

From the **repo root**, with the same Python venv as the server:

```bash
source venv/bin/activate   # Mac/Linux
pip install -r server/requirements.txt   # if needed (opencv-contrib-python)
python markers/generate_markers.py
```

Defaults: **IDs 0–10**, **400×400 px** per marker, output folder **`markers/generated/`**.

**Physical game blocks (fence pieces)** use ArUco IDs **6–20** in `web/src/physicalMode.js`. Generate those (or any subset) with:

```bash
python markers/generate_markers.py --ids 6-20 --size 400
python markers/generate_markers.py --ids 11-20 --size 500   # extra block markers only
```

Options:

```bash
python markers/generate_markers.py --ids 0-10 --size 500
python markers/generate_markers.py --ids 3        # single id
python markers/generate_markers.py --out /tmp/markers
```

Files look like: `aruco_4x4_50_id_00.png` … `aruco_4x4_50_id_20.png` (depending on `--ids`).

**Printing:** Use **100% scale** (disable “fit to page”) so physical size matches what you expect; larger markers are easier for the webcam.

**Dictionary:** Only marker IDs **0–49** exist for DICT_4X4_50; the script skips ids outside that range.

## Optional

- Add `markers/generated/*.png` to git if the team wants shared printables without rerunning the script.
- You can also use other generators that support **4×4**, dictionary **50** symbols, matching IDs.
