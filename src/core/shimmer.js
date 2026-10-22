// Flicker probe for tools/shimmer.mjs. Every frame, each pixel's brightness is compared with where
// that same bit of world was in the two frames before (reprojected through the depth buffer, the
// way the temporal pass does it), and the second difference over those three samples is scored.
// Smooth sweeps of light and the camera's own motion score near zero; shimmer, crawl and popping
// score high. The hero's envelope and basket move under the camera, so their points are carried along
// with them, as the temporal pass does. Pixels whose surface wasn't on screen in both earlier frames (edges, disocclusions)
// are left out, so a moving silhouette doesn't count as flicker. The sky is tracked by direction
// and only scored when asked for (the clouds test).
// Reported in 8-bit display levels, for the whole frame and one crop. With sources set, each scored
// pixel is also put down to what it shows (the hero balloon, the fleet, the ground and rocks, and so
// on: see mask()), so a flight's score can be split by where it comes from.
import * as THREE from 'three';
import { fsMaterial, renderFS, makeRT } from './fsq.js';

const STORE = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tCol;
uniform highp sampler2D tDepth;
uniform mat4 uInvVP;
uniform vec3 uCam;
uniform float uExposure;
void main(){
  vec3 c = texture(tCol, vUv).rgb * uExposure;
  // roughly what the display shows: a soft shoulder, then gamma, in 0..255
  float l = dot(c / (1. + c), vec3(0.2126, 0.7152, 0.0722));
  l = pow(max(l, 0.), 1. / 2.2) * 255.;
  float d = texture(tDepth, vUv).r;
  vec4 wp = uInvVP * vec4(vUv * 2. - 1., min(d, 0.9999999) * 2. - 1., 1.);
  vec3 W = wp.xyz / wp.w;
  // the sky has no surface: keep a point far out along its direction, flagged by a negative level
  gl_FragColor = d >= 1. ? vec4(-1. - l, uCam + normalize(W - uCam) * 1e5) : vec4(l, W);
}
`;
const DIFF = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform highp sampler2D tA, tB, tC;
uniform mat4 uVPB, uVPC;
uniform vec3 uCam;
uniform float uSky;
// rigid movers: world -> local now, local -> world in frames B and C, and their local boxes
uniform mat4 uMovInv[2], uMovB[2], uMovC[2];
uniform vec3 uMovLo[2], uMovHi[2];
float look(highp sampler2D t, mat4 vp, vec3 W, bool sky, out bool ok){
  vec4 p = vp * vec4(W, 1.);
  vec2 uv = p.xy / p.w * 0.5 + 0.5;
  vec4 s = texture(t, uv);
  ok = p.w > 0. && all(greaterThan(uv, vec2(0.002))) && all(lessThan(uv, vec2(0.998)))
    && (sky ? s.r < 0. : s.r >= 0. && distance(s.gba, W) < 0.01 * distance(W, uCam) + 0.05);
  return sky ? -1. - s.r : s.r;
}
void main(){
  vec4 a = texture(tA, vUv);
  bool sky = a.r < 0., okB, okC;
  float l = sky ? -1. - a.r : a.r;
  vec3 WB = a.gba, WC = a.gba;
  for (int i = 0; i < 2; i++) {
    vec3 q = (uMovInv[i] * vec4(a.gba, 1.)).xyz;
    if (!sky && all(greaterThanEqual(q, uMovLo[i])) && all(lessThanEqual(q, uMovHi[i]))) { WB = (uMovB[i] * vec4(q, 1.)).xyz; WC = (uMovC[i] * vec4(q, 1.)).xyz; break; }
  }
  float b = look(tB, uVPB, WB, sky, okB);
  float c = look(tC, uVPC, WC, sky, okC);
  // sky pixels are scored only when asked (uSky), so the surface numbers stay comparable
  gl_FragColor = (okB && okC && (!sky || uSky > 0.5)) ? vec4(abs(l - 2. * b + c), 1., 0., 1.) : vec4(0.);
}
`;

// One source's pixels: those where that source alone, drawn with the very same jittered camera, lands
// at exactly the depth the full scene left. Last match wins, which only matters where two touch.
const MASK = /* glsl */`
precision highp float;
uniform highp sampler2D tMain, tOne;
uniform float uId;
void main(){
  ivec2 q = ivec2(gl_FragCoord.xy);
  float a = texelFetch(tMain, q, 0).r, b = texelFetch(tOne, q, 0).r;
  if (b >= 1. || abs(a - b) > 1e-7) discard;
  gl_FragColor = vec4(uId / 255., 0., 0., 1.);
}
`;
// surfaces within two pixels of the sky: silhouettes, which the reprojection can't hold still
const SKYEDGE = /* glsl */`
precision highp float;
uniform highp sampler2D tMain;
uniform float uId;
void main(){
  ivec2 q = ivec2(gl_FragCoord.xy), mx = textureSize(tMain, 0) - 1;
  bool edge = false;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) edge = edge || texelFetch(tMain, clamp(q + ivec2(i, j), ivec2(0), mx), 0).r >= 1.;
  if (!edge || texelFetch(tMain, q, 0).r >= 1.) discard;
  gl_FragColor = vec4(uId / 255., 0., 0., 1.);
}
`;

export class ShimmerProbe {
  constructor(renderer) {
    this.renderer = renderer;
    this.left = 0;
    this.result = null;
    this.store = fsMaterial(STORE, { tCol: { value: null }, tDepth: { value: null }, uInvVP: { value: new THREE.Matrix4() }, uCam: { value: new THREE.Vector3() }, uExposure: { value: 1 } });
    const m2 = () => ({ value: [new THREE.Matrix4(), new THREE.Matrix4()] });
    this.diff = fsMaterial(DIFF, { tA: { value: null }, tB: { value: null }, tC: { value: null }, uVPB: { value: new THREE.Matrix4() }, uVPC: { value: new THREE.Matrix4() }, uCam: { value: new THREE.Vector3() }, uSky: { value: 0 },
      uMovInv: m2(), uMovB: m2(), uMovC: m2(), uMovLo: { value: [new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1)] }, uMovHi: { value: [new THREE.Vector3(-1, -1, -1), new THREE.Vector3(-1, -1, -1)] } });
    // [{ obj, lo, hi }], the temporal pass's own list
    this.movers = [];
    this._vp = new THREE.Matrix4();
    this.maskMat = fsMaterial(MASK, { tMain: { value: null }, tOne: { value: null }, uId: { value: 0 } });
    this.edgeMat = fsMaterial(SKYEDGE, { tMain: { value: null }, uId: { value: 0 } });
    // [{ name, objs }] set by whoever owns the scene; id 0 is everything else
    this.sources = null;
  }
  get names() { return ['other', ...this.sources.map(s => s.name), 'sky edge']; }
  // Call straight after the main scene render, camera still jittered. Draws each source on its own
  // and marks its pixels in the id target the next grab reads.
  mask(scene, camera, main) {
    if (this.left <= 0 || !this.sources) return;
    const r = this.renderer, w = main.width, h = main.height;
    if (!this.idRT || this.idRT.width !== w || this.idRT.height !== h) {
      if (this.idRT) { this.idRT.dispose(); this.oneRT.dispose(); }
      this.idRT = makeRT(w, h, { type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
      this.oneRT = makeRT(w, h, { depth: true, depthTexture: true });
      this.ids = new Uint8Array(w * h * 4);
    }
    r.setRenderTarget(this.idRT); r.setClearColor(0x000000, 0); r.clear(true, false, false);
    const kids = scene.children, vis = kids.map(o => o.visible);
    const mu = this.maskMat.uniforms;
    mu.tMain.value = main.depthTexture; mu.tOne.value = this.oneRT.depthTexture;
    this.sources.forEach((src, i) => {
      kids.forEach(o => { o.visible = false; });
      src.objs.forEach(o => { o.visible = vis[kids.indexOf(o)]; });
      r.setRenderTarget(this.oneRT); r.clear(true, true, false);
      r.render(scene, camera);
      mu.uId.value = i + 1;
      // the mask pass draws over the id target without clearing it
      renderFS(r, this.maskMat, this.idRT);
    });
    kids.forEach((o, i) => { o.visible = vis[i]; });
    this.edgeMat.uniforms.tMain.value = main.depthTexture;
    this.edgeMat.uniforms.uId.value = this.sources.length + 1;
    renderFS(r, this.edgeMat, this.idRT);
    this.masked = true;
  }
  // crop is [x0, y0, x1, y1] in 0..1 of the frame, y down. The first lead frames aren't scored:
  // whatever was held still starts moving and the history settles.
  start(frames, crop = [0, 0, 1, 1], lead = 30, sky = false) {
    this.left = frames + 2 + lead; this.lead = lead; this.crop = crop;
    this.diff.uniforms.uSky.value = sky ? 1 : 0;
    this.hist = [];
    this.sum = 0; this.sumC = 0; this.n = 0; this.valid = 0;
    this.result = null; this.acc = null;
    this.masked = false;
    if (this.sources) { const n = this.sources.length + 2; this.srcSum = new Float64Array(n); this.srcCnt = new Float64Array(n); }
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
    su.uCam.value.copy(camera.position);
    renderFS(r, this.store, rt);
    this.hist.unshift({ rt, vp: vp.clone(), mov: this.movers.map(m => m.obj.matrixWorld.clone()) });
    if (this.hist.length === 3 && this.lead-- <= 0) {
      const du = this.diff.uniforms;
      du.tA.value = this.hist[0].rt.texture; du.tB.value = this.hist[1].rt.texture; du.tC.value = this.hist[2].rt.texture;
      du.uVPB.value.copy(this.hist[1].vp); du.uVPC.value.copy(this.hist[2].vp);
      this.movers.forEach((m, i) => {
        du.uMovInv.value[i].copy(this.hist[0].mov[i]).invert();
        du.uMovB.value[i].copy(this.hist[1].mov[i]); du.uMovC.value[i].copy(this.hist[2].mov[i]);
        du.uMovLo.value[i].copy(m.lo); du.uMovHi.value[i].copy(m.hi);
      });
      du.uCam.value.copy(camera.position);
      renderFS(r, this.diff, this.out);
      r.readRenderTargetPixels(this.out, 0, 0, w, h, this.buf);
      if (!this.acc) { this.acc = new Float32Array(w * h); this.w = w; this.h = h; }
      const b = this.buf, acc = this.acc;
      const [cx0, cy0, cx1, cy1] = this.crop;
      // rows run bottom-up
      const x0 = Math.floor(cx0 * w), x1 = Math.ceil(cx1 * w), y0 = Math.floor((1 - cy1) * h), y1 = Math.ceil((1 - cy0) * h);
      let s = 0, sv = 0, sc = 0, scv = 0;
      const ids = this.masked ? this.ids : null;
      if (ids) r.readRenderTargetPixels(this.idRT, 0, 0, w, h, ids);
      for (let y = 0; y < h; y++) {
        const inY = y >= y0 && y < y1;
        for (let x = 0, i = y * w; x < w; x++, i++) {
          const d = b[i * 4], v = b[i * 4 + 1];
          s += d; sv += v; acc[i] += d;
          if (inY && x >= x0 && x < x1) { sc += d; scv += v; }
          if (ids && v > 0) { const k = ids[i * 4]; this.srcSum[k] += d; this.srcCnt[k] += v; }
        }
      }
      this.sum += s / Math.max(1, sv);
      this.sumC += sc / Math.max(1, scv);
      this.valid += sv / (w * h);
      this.n++;
    }
    this.masked = false;
    if (--this.left === 0) {
      this.result = { frame: this.sum / this.n, crop: this.sumC / this.n, frames: this.n, valid: this.valid / this.n };
      // per source: its own mean, its share of the scored pixels, and its share of all the flicker
      if (this.sources) {
        const tS = this.srcSum.reduce((a, b) => a + b, 0), tC = this.srcCnt.reduce((a, b) => a + b, 0);
        this.result.sources = this.names.map((name, k) => ({ name, score: this.srcSum[k] / Math.max(1, this.srcCnt[k]), area: this.srcCnt[k] / Math.max(1, tC), share: this.srcSum[k] / Math.max(1e-9, tS) }));
      }
    }
  }
}
