// Flicker probe for tools/shimmer.mjs. Every frame, each pixel's brightness is compared with where
// that same bit of world was in the two frames before (reprojected through the depth buffer, the
// way the temporal pass does it), and the second difference over those three samples is scored.
// Smooth sweeps of light and the camera's own motion score near zero; shimmer, crawl and popping
// score high. Pixels whose surface wasn't on screen in both earlier frames (edges, disocclusions)
// and the sky are left out, so a moving silhouette doesn't count as flicker.
// Reported in 8-bit display levels, for the whole frame and one crop.
import * as THREE from 'three';
import { fsMaterial, renderFS, makeRT } from './fsq.js';

const STORE = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tCol;
uniform highp sampler2D tDepth;
uniform mat4 uInvVP;
uniform float uExposure;
void main(){
  vec3 c = texture(tCol, vUv).rgb * uExposure;
  // roughly what the display shows: a soft shoulder, then gamma, in 0..255
  float l = dot(c / (1. + c), vec3(0.2126, 0.7152, 0.0722));
  l = pow(max(l, 0.), 1. / 2.2) * 255.;
  float d = texture(tDepth, vUv).r;
  vec4 wp = uInvVP * vec4(vUv * 2. - 1., d * 2. - 1., 1.);
  gl_FragColor = vec4(l, d >= 1. ? vec3(1e9) : wp.xyz / wp.w);
}
`;
const DIFF = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform highp sampler2D tA, tB, tC;
uniform mat4 uVPB, uVPC;
uniform vec3 uCam;
float look(highp sampler2D t, mat4 vp, vec3 W, out bool ok){
  vec4 p = vp * vec4(W, 1.);
  vec2 uv = p.xy / p.w * 0.5 + 0.5;
  vec4 s = texture(t, uv);
  ok = p.w > 0. && all(greaterThan(uv, vec2(0.002))) && all(lessThan(uv, vec2(0.998)))
    && s.g < 1e8 && distance(s.gba, W) < 0.01 * distance(W, uCam) + 0.05;
  return s.r;
}
void main(){
  vec4 a = texture(tA, vUv);
  if (a.g > 1e8) { gl_FragColor = vec4(0.); return; }
  bool okB, okC;
  float b = look(tB, uVPB, a.gba, okB);
  float c = look(tC, uVPC, a.gba, okC);
  gl_FragColor = (okB && okC) ? vec4(abs(a.r - 2. * b + c), 1., 0., 1.) : vec4(0.);
}
`;

export class ShimmerProbe {
  constructor(renderer) {
    this.renderer = renderer;
    this.left = 0;
    this.result = null;
    this.store = fsMaterial(STORE, { tCol: { value: null }, tDepth: { value: null }, uInvVP: { value: new THREE.Matrix4() }, uExposure: { value: 1 } });
    this.diff = fsMaterial(DIFF, { tA: { value: null }, tB: { value: null }, tC: { value: null }, uVPB: { value: new THREE.Matrix4() }, uVPC: { value: new THREE.Matrix4() }, uCam: { value: new THREE.Vector3() } });
    this._vp = new THREE.Matrix4();
  }
  // crop is [x0, y0, x1, y1] in 0..1 of the frame, y down. The first lead frames aren't scored:
  // whatever was held still starts moving and the history settles.
  start(frames, crop = [0, 0, 1, 1], lead = 30) {
    this.left = frames + 2 + lead; this.lead = lead; this.crop = crop;
    this.hist = [];
    this.sum = 0; this.sumC = 0; this.n = 0; this.valid = 0;
    this.result = null; this.acc = null;
  }
  // where the flicker is: the mean |second difference| per pixel as a PNG data URL, 4 levels = white
  heatmap() {
    const { w, h, acc, n } = this;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d'), img = cx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = Math.min(255, acc[(h - 1 - y) * w + x] / n * 64), o = (y * w + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v; img.data[o + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    return cv.toDataURL('image/png');
  }
  // col: this frame's resolved colour, depth: its depth texture; camera already unjittered
  grab(col, depth, camera, exposure) {
    if (this.left <= 0) return;
    const r = this.renderer, w = depth.image.width, h = depth.image.height;
    if (!this.rts || this.rts[0].width !== w || this.rts[0].height !== h) {
      if (this.rts) { this.rts.forEach(t => t.dispose()); this.out.dispose(); }
      const o = { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
      this.rts = [0, 1, 2].map(() => makeRT(w, h, o));
      this.out = makeRT(w, h, o);
      this.buf = new Float32Array(w * h * 4);
      this.hist = [];
    }
    const vp = this._vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    // reuse the oldest of the three
    const rt = this.hist.length === 3 ? this.hist.pop().rt : this.rts[this.hist.length];
    const su = this.store.uniforms;
    su.tCol.value = col; su.tDepth.value = depth; su.uInvVP.value.copy(vp).invert(); su.uExposure.value = exposure;
    renderFS(r, this.store, rt);
    this.hist.unshift({ rt, vp: vp.clone() });
    if (this.hist.length === 3 && this.lead-- <= 0) {
      const du = this.diff.uniforms;
      du.tA.value = this.hist[0].rt.texture; du.tB.value = this.hist[1].rt.texture; du.tC.value = this.hist[2].rt.texture;
      du.uVPB.value.copy(this.hist[1].vp); du.uVPC.value.copy(this.hist[2].vp);
      du.uCam.value.copy(camera.position);
      renderFS(r, this.diff, this.out);
      r.readRenderTargetPixels(this.out, 0, 0, w, h, this.buf);
      if (!this.acc) { this.acc = new Float32Array(w * h); this.w = w; this.h = h; }
      const b = this.buf, acc = this.acc;
      const [cx0, cy0, cx1, cy1] = this.crop;
      // rows run bottom-up
      const x0 = Math.floor(cx0 * w), x1 = Math.ceil(cx1 * w), y0 = Math.floor((1 - cy1) * h), y1 = Math.ceil((1 - cy0) * h);
      let s = 0, sv = 0, sc = 0, scv = 0;
      for (let y = 0; y < h; y++) {
        const inY = y >= y0 && y < y1;
        for (let x = 0, i = y * w; x < w; x++, i++) {
          const d = b[i * 4], v = b[i * 4 + 1];
          s += d; sv += v; acc[i] += d;
          if (inY && x >= x0 && x < x1) { sc += d; scv += v; }
        }
      }
      this.sum += s / Math.max(1, sv);
      this.sumC += sc / Math.max(1, scv);
      this.valid += sv / (w * h);
      this.n++;
    }
    if (--this.left === 0) this.result = { frame: this.sum / this.n, crop: this.sumC / this.n, frames: this.n, valid: this.valid / this.n };
  }
}
