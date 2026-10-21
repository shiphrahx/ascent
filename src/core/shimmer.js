// Flicker probe for tools/shimmer.mjs: reads back every displayed frame and measures how much each
// pixel's brightness changes in a way the smooth trend doesn't explain (the second difference over
// three frames). Smooth sweeps of light and steady camera motion score near zero; shimmer, crawl
// and popping score high. Reported in 8-bit luma levels, for the whole frame and one crop.
export class ShimmerProbe {
  constructor(gl) {
    this.gl = gl;
    this.left = 0;
    this.result = null;
  }
  // crop is [x0, y0, x1, y1] in 0..1 of the frame, y down
  // the first lead frames aren't scored: whatever was held still starts moving and the history settles
  start(frames, crop = [0, 0, 1, 1], lead = 30) {
    this.left = frames + 2 + lead; this.lead = lead; this.crop = crop;
    this.prev = this.prev2 = null;
    this.sum = 0; this.sumC = 0; this.n = 0;
    this.result = null;
  }
  grab(w, h) {
    if (this.left <= 0) return;
    const gl = this.gl;
    if (!this.buf || this.buf.length !== w * h * 4) { this.buf = new Uint8Array(w * h * 4); this.prev = this.prev2 = null; }
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, this.buf);
    const b = this.buf, L = new Float32Array(w * h);
    for (let i = 0, j = 0; i < L.length; i++, j += 4) L[i] = 0.2126 * b[j] + 0.7152 * b[j + 1] + 0.0722 * b[j + 2];
    if (this.prev2 && this.lead-- <= 0) {
      const p1 = this.prev, p2 = this.prev2;
      const [cx0, cy0, cx1, cy1] = this.crop;
      // readPixels rows run bottom-up
      const x0 = Math.floor(cx0 * w), x1 = Math.ceil(cx1 * w), y0 = Math.floor((1 - cy1) * h), y1 = Math.ceil((1 - cy0) * h);
      let s = 0, sc = 0;
      for (let y = 0; y < h; y++) {
        const inY = y >= y0 && y < y1;
        for (let x = 0, i = y * w; x < w; x++, i++) {
          const d = Math.abs(L[i] - 2 * p1[i] + p2[i]);
          s += d;
          if (inY && x >= x0 && x < x1) sc += d;
        }
      }
      this.sum += s / (w * h);
      this.sumC += sc / Math.max(1, (x1 - x0) * (y1 - y0));
      this.n++;
    }
    this.prev2 = this.prev; this.prev = L;
    if (--this.left === 0) this.result = { frame: this.sum / this.n, crop: this.sumC / this.n, frames: this.n };
  }
}
