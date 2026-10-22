// Temporal upsampling: the scene renders at a jittered sub-pixel offset each frame, and this pass
// rebuilds a display-resolution image from the current samples plus last frame's reprojected
// result. Resolves shadow and volumetric noise, sub-pixel seams and shimmer, and recovers
// detail when the adaptive governor drops the render scale.
import * as THREE from 'three';
import { fsMaterial, renderFS, makeRT } from '../core/fsq.js';

// Where a pixel was last frame: through the depth buffer to the world, and back through last frame's
// camera. The world is static except the hero balloon, which the camera chases: its pixels follow
// its own motion. Shared by the resolve and the motion blur.
const REPROJ = /* glsl */`
uniform highp sampler2D tDepth;
uniform mat4 uInvVP, uPrevVP;
// rigid movers (the hero's envelope and basket): world -> local now, and local -> world last frame
uniform mat4 uMoverInv[2], uMoverPrev[2];
uniform vec3 uMoverLo[2], uMoverHi[2];
vec2 reproject(vec2 uv, float d){
  vec4 wp = uInvVP * vec4(uv * 2. - 1., d * 2. - 1., 1.);
  vec3 W = wp.xyz / wp.w;
  for (int i = 0; i < 2; i++) {
    vec3 l = (uMoverInv[i] * vec4(W, 1.)).xyz;
    if (all(greaterThanEqual(l, uMoverLo[i])) && all(lessThanEqual(l, uMoverHi[i]))) { W = (uMoverPrev[i] * vec4(l, 1.)).xyz; break; }
  }
  vec4 prev = uPrevVP * vec4(W, 1.);
  return prev.xy / prev.w * 0.5 + 0.5;
}
`;

const RESOLVE = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tCur, tHist;
uniform vec2 uCurRes, uOutRes, uJitter;
uniform float uReset, uExposure, uAlphaMin;
${REPROJ}

float lum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
// blend in a compressed space so bright highlights don't dominate and flicker
vec3 tm(vec3 c){ c *= uExposure; return c / (1. + lum(c)); }
vec3 itm(vec3 c){ return c / max(1. - lum(c), 1e-3) / uExposure; }
vec3 toYC(vec3 c){ return vec3(dot(c, vec3(.25, .5, .25)), dot(c, vec3(.5, 0., -.5)), dot(c, vec3(-.25, .5, -.25))); }
vec3 fromYC(vec3 c){ return vec3(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z); }

// 5-tap Catmull-Rom through bilinear taps: keeps the history sharp frame after frame
vec3 histCR(vec2 uv){
  vec2 sp = uv * uOutRes, tc = floor(sp - 0.5) + 0.5, f = sp - tc;
  vec2 w0 = f * (-0.5 + f * (1. - 0.5 * f)), w1 = 1. + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2. - 1.5 * f)), w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2, tc0 = (tc - 1.) / uOutRes, tc3 = (tc + 2.) / uOutRes, tc12 = (tc + w2 / w12) / uOutRes;
  vec3 c = texture(tHist, vec2(tc12.x, tc0.y)).rgb * w12.x * w0.y
    + texture(tHist, vec2(tc0.x, tc12.y)).rgb * w0.x * w12.y
    + texture(tHist, tc12).rgb * w12.x * w12.y
    + texture(tHist, vec2(tc3.x, tc12.y)).rgb * w3.x * w12.y
    + texture(tHist, vec2(tc12.x, tc3.y)).rgb * w12.x * w3.y;
  float ws = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
  return max(c / ws, 0.);
}

void main(){
  // the render pixel whose jittered sample sits nearest this output pixel
  vec2 p = vUv * uCurRes;
  ivec2 k = ivec2(floor(p - uJitter));
  ivec2 mx = ivec2(uCurRes) - 1;
  vec3 sum = vec3(0), m1 = vec3(0), m2 = vec3(0);
  float wsum = 0., wmax = 0., dmin = 1.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    ivec2 q = clamp(k + ivec2(i, j), ivec2(0), mx);
    vec3 c = tm(texelFetch(tCur, q, 0).rgb);
    vec2 d = vec2(q) + 0.5 + uJitter - p;
    float w = exp(-2.29 * dot(d, d));
    sum += c * w; wsum += w; wmax = max(wmax, w);
    vec3 y = toYC(c);
    m1 += y; m2 += y * y;
    dmin = min(dmin, texelFetch(tDepth, q, 0).r);
  }
  vec3 cur = sum / max(wsum, 1e-4);
  if (uReset > 0.5) { gl_FragColor = vec4(itm(cur), 1.); return; }

  // reproject from the nearest depth around us, so edges carry their history
  vec2 puv = reproject(vUv, dmin);
  if (any(lessThan(puv, vec2(0.))) || any(greaterThan(puv, vec2(1.)))) { gl_FragColor = vec4(itm(cur), 1.); return; }
  vec3 hist = toYC(tm(histCR(puv)));

  // clip the history toward the spread of this frame's neighbourhood
  vec3 mu = m1 / 9., sig = sqrt(max(m2 / 9. - mu * mu, 0.));
  vec3 lo = mu - sig * 1.15, hi = mu + sig * 1.15;
  vec3 e = (hi - lo) * 0.5 + 1e-5, cen = (hi + lo) * 0.5;
  vec3 v = hist - cen, a = abs(v / e);
  float ma = max(a.x, max(a.y, a.z));
  if (ma > 1.) hist = cen + v / ma;

  // trust this frame more when a sample landed close, when the history had to be clipped hard (it
  // was wrong: something moved or came into view), and a little when the view moves, to keep the
  // resampled history from going soft. Static ground that reprojects well keeps a long history, so
  // shadow noise still averages out while flying.
  vec2 vel = (vUv - puv) * uOutRes;
  float alpha = 0.04 + 0.1 * wmax + clamp(length(vel) * 0.004, 0., 0.04) + 0.12 * clamp(ma - 1., 0., 1.);
  vec3 o = mix(fromYC(hist), cur, max(alpha, uAlphaMin));
  gl_FragColor = vec4(itm(o), 1.);
}
`;

// Motion blur from the same reprojection, at half shutter (a 180-degree film camera). Slow drifting
// gets none: under a pixel and a half of travel the pass hands the image straight through. Each tap
// along the streak only counts if its own surface moved about as far, so the balloon the camera chases
// doesn't smear into the canyon behind it.
const BLUR = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tCol;
uniform vec2 uOutRes;
uniform float uFrame;
${REPROJ}
vec2 vel(vec2 uv){ return (uv - reproject(uv, texture(tDepth, uv).r)) * uOutRes * 0.5; }
void main(){
  vec3 c = texture(tCol, vUv).rgb;
  vec2 v = vel(vUv);
  float L = length(v);
  if (L > 1.5) {
    v *= min(L, 24.) / L;
    float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))) + uFrame * 0.618034) - 0.5;
    vec3 acc = c; float ws = 1.;
    for (int i = 0; i < 8; i++) {
      float t = ((float(i) + 0.5 + jit) / 8. - 0.5);
      vec2 uv = vUv + v * t / uOutRes;
      vec2 vs = vel(uv);
      float w = smoothstep(0.5, 0.25, length(vs - v) / max(L, 1.));
      acc += texture(tCol, uv).rgb * w; ws += w;
    }
    c = acc / ws;
  }
  gl_FragColor = vec4(c, 1.);
}
`;

// low-discrepancy sub-pixel offsets
function halton(i, b) { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; }
const JIT = Array.from({ length: 8 }, (_, i) => [halton(i + 1, 2) - 0.5, halton(i + 1, 3) - 0.5]);

export class TAA {
  constructor(renderer) {
    this.renderer = renderer;
    this.mat = fsMaterial(RESOLVE, {
      tCur: { value: null }, tHist: { value: null }, tDepth: { value: null },
      uCurRes: { value: new THREE.Vector2() }, uOutRes: { value: new THREE.Vector2() }, uJitter: { value: new THREE.Vector2() },
      uInvVP: { value: new THREE.Matrix4() }, uPrevVP: { value: new THREE.Matrix4() }, uReset: { value: 1 }, uExposure: { value: 1 },
      // test hook: a floor on how much of this frame goes in (#taaalpha=0.5 all but drops the history)
      uAlphaMin: { value: 0 },
      uMoverInv: { value: [new THREE.Matrix4(), new THREE.Matrix4()] }, uMoverPrev: { value: [new THREE.Matrix4(), new THREE.Matrix4()] },
      uMoverLo: { value: [new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1)] }, uMoverHi: { value: [new THREE.Vector3(-1, -1, -1), new THREE.Vector3(-1, -1, -1)] },
    });
    // the blur reads the very same reprojection uniforms the resolve just set
    const u = this.mat.uniforms;
    this.blurMat = fsMaterial(BLUR, {
      tCol: { value: null }, uOutRes: u.uOutRes, uFrame: { value: 0 }, tDepth: u.tDepth, uInvVP: u.uInvVP, uPrevVP: u.uPrevVP,
      uMoverInv: u.uMoverInv, uMoverPrev: u.uMoverPrev, uMoverLo: u.uMoverLo, uMoverHi: u.uMoverHi,
    });
    this.motionBlur = true;
    this.blurRT = null;
    // { obj, lo, hi } in the object's local frame; set by whoever owns the movers
    this.movers = [];
    this.rt = [null, null];
    this.i = 0; this.frame = 0;
    this.prevVP = new THREE.Matrix4(); this.vp = new THREE.Matrix4();
    this.prevPos = new THREE.Vector3();
    this.reset = true;
    this.saved = new THREE.Matrix4();
  }
  setSize(w, h) {
    for (const t of this.rt) if (t) t.dispose();
    this.rt = [makeRT(w, h), makeRT(w, h)];
    if (this.blurRT) this.blurRT.dispose();
    this.blurRT = makeRT(w, h);
    this.w = w; this.h = h; this.reset = true;
  }
  // shift the projection by a sub-pixel amount; the sample for render pixel i then lands at i + 0.5 + jitter
  jitter(camera, W, H) {
    const j = JIT[this.frame++ % JIT.length];
    this.jx = j[0]; this.jy = j[1];
    this.saved.copy(camera.projectionMatrix);
    camera.projectionMatrix.elements[8] += 2 * this.jx / W;
    camera.projectionMatrix.elements[9] += 2 * this.jy / H;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
  unjitter(camera) {
    camera.projectionMatrix.copy(this.saved);
    camera.projectionMatrixInverse.copy(this.saved).invert();
  }
  resolve(cur, camera, exposure) {
    const u = this.mat.uniforms;
    this.vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    // a hard cut (new shot, journey restart) shouldn't smear the old view in
    if (camera.position.distanceTo(this.prevPos) > 40) this.reset = true;
    u.uInvVP.value.copy(this.vp).invert();
    u.uPrevVP.value.copy(this.prevVP);
    this.movers.forEach((m, i) => {
      if (!m.prev) m.prev = m.obj.matrixWorld.clone();
      u.uMoverInv.value[i].copy(m.obj.matrixWorld).invert();
      u.uMoverPrev.value[i].copy(m.prev);
      u.uMoverLo.value[i].copy(m.lo); u.uMoverHi.value[i].copy(m.hi);
      m.prev.copy(m.obj.matrixWorld);
    });
    u.tCur.value = cur.texture; u.tDepth.value = cur.depthTexture;
    const src = this.rt[this.i], dst = this.rt[1 - this.i];
    u.tHist.value = src.texture;
    u.uCurRes.value.set(cur.width, cur.height); u.uOutRes.value.set(this.w, this.h);
    u.uJitter.value.set(this.jx, this.jy);
    u.uReset.value = this.reset ? 1 : 0;
    u.uExposure.value = exposure;
    renderFS(this.renderer, this.mat, dst);
    this.wasReset = this.reset;
    this.i = 1 - this.i; this.reset = false;
    this.prevVP.copy(this.vp); this.prevPos.copy(camera.position);
    return dst;
  }
  // motion blur over a resolved frame (the history keeps the sharp one); call straight after resolve
  blur(res) {
    if (!this.motionBlur || this.wasReset) return res;
    this.blurMat.uniforms.tCol.value = res.texture;
    this.blurMat.uniforms.uFrame.value = this.frame % 64;
    renderFS(this.renderer, this.blurMat, this.blurRT);
    return this.blurRT;
  }
}
