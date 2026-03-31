/**
 * Makes near-black pixels transparent when they touch the image edge (connected
 * component from border). Removes typical flat PNG “black frame” backdrops
 * without needing a re-export. Dark areas not connected to the border are kept.
 *
 * @param {import('p5').Image | null} img
 * @param {{ rgbMax?: number }} [opts]
 */
export function stripVictoryShepherdBackdrop(img, opts = {}) {
  if (!img || !img.width || !img.height) return;
  const rgbMax = opts.rgbMax ?? 34;
  img.loadPixels();
  const w = img.width;
  const h = img.height;
  const pix = img.pixels;
  const n = w * h;
  const seen = new Uint8Array(n);
  const q = new Int32Array(n);
  let qt = 0;
  let qh = 0;

  const matches = (px) => {
    const r = pix[px];
    const g = pix[px + 1];
    const b = pix[px + 2];
    return r <= rgbMax && g <= rgbMax && b <= rgbMax;
  };

  const tryPush = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const idx = y * w + x;
    if (seen[idx]) return;
    seen[idx] = 1;
    const px = idx * 4;
    if (!matches(px)) return;
    pix[px + 3] = 0;
    q[qt++] = idx;
  };

  for (let x = 0; x < w; x++) {
    tryPush(x, 0);
    tryPush(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    tryPush(0, y);
    tryPush(w - 1, y);
  }

  while (qh < qt) {
    const idx = q[qh++];
    const x = idx % w;
    const y = (idx / w) | 0;
    tryPush(x + 1, y);
    tryPush(x - 1, y);
    tryPush(x, y + 1);
    tryPush(x, y - 1);
  }

  img.updatePixels();
}
