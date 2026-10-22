// Cumulus for high: the cloud layer marched on its own at a third of the resolution, with the structure the
// quarter-res blobs never had. Coverage still comes from the same 2D weather map as the cloud
// shadows on the ground (cloudDensity2D), so a cloud and its shadow still go together. Inside it, a
// perlin-worley base shape with flat bases and rounded tops, eroded by two worley octaves (wispy
// under the base, billowing at the top), lit by a four-step march toward the sun with Beer, powder and
// a three-octave stand-in for multiple scattering. Every frame starts its steps at a new offset and
// the result is averaged over frames, reprojected by view direction (the clouds are kilometres
// away) and clamped to this frame's neighbourhood so nothing ghosts.
import * as THREE from 'three';
import { U } from '../core/shared.js';
import { fsMaterial, renderFS, makeRT } from '../core/fsq.js';
import { DECL, NOISE, TERRAIN, SHADOW, LIGHT } from '../glsl/common.js';

const MARCH = /* glsl */`
uniform vec3 uCamPos;
#define cameraPosition uCamPos
${DECL}
${NOISE}
${TERRAIN}
${SHADOW}
${LIGHT}
varying vec2 vUv;
uniform highp sampler2D tDepth;
uniform mat4 uInvProj, uInvView;
uniform float uFrame;

float viewDist(vec2 uv, out vec3 dir){
  float d = textureLod(tDepth, uv, 0.).r;
  vec4 v = uInvProj * vec4(uv * 2. - 1., d * 2. - 1., 1.); v /= v.w;
  vec3 w = (uInvView * vec4(v.xyz, 1.)).xyz;
  vec4 far = uInvProj * vec4(uv * 2. - 1., 1., 1.); far /= far.w;
  dir = normalize((uInvView * vec4(far.xyz, 0.)).xyz);
  return d >= 0.99999 ? 1e7 : length(w - cameraPosition);
}
float remap(float v, float a, float b){ return sat((v - a) / max(b - a, 1e-4)); }
// detail: false for the light march's far steps, which only need the broad shape
float cumulus(vec3 p, bool detail){
  float h = (p.y - uCloudBase) / (uCloudTop - uCloudBase), d = 0.;
  float cov = h > 0. && h < 1. ? cloudDensity2D(p.xz) : 0.;
  if (cov > 0.02) {
    // flat bases, rounded tops; thicker cover builds higher
    float hg = smoothstep(0., 0.07, h) * smoothstep(min(1., 0.3 + 0.8 * cov), 0.22, h);
    // the same broad shapes, in the same places, as the clouds below high
    vec3 o = vec3(uCloudOffset.x, 0., uCloudOffset.y), q0 = (p + o) / 3300.;
    float base = textureLod(uNoise3D, q0, 0.).r * 0.75 + textureLod(uNoise3D, q0 * 2.1 + 0.3, 0.).a * 0.25;
    d = sat((base * hg - (1. - cov)) / max(cov, 0.1));
    if (detail && d > 0.) {
      vec3 q = (p + o) / 430. + vec3(0., uTime * 0.0015, 0.);
      float det = textureLod(uNoise3D, q, 0.).g * 0.7 + textureLod(uNoise3D, q * 3.1 + 0.4, 0.).b * 0.3;
      // wisps under the base, billows at the top
      det = mix(det, 1. - det, sat(h * 3.));
      d = remap(d, det * 0.35, 1.);
    }
  }
  return d * (1. + uStorm);
}

void main(){
  vec3 dir;
  float D = viewDist(vUv, dir);
  vec3 C = cameraPosition, L = uKeyDir;
  float jit = fract(texelFetch(uNoise2D, ivec2(gl_FragCoord.xy) & 255, 0).a + uFrame * 0.618034);
  float mu = dot(dir, L);
  vec3 zen = skyLut(vec3(0., 1., 0.)) * 0.53 * 3.14159 * 0.55;
  vec3 ambUp = mix(zen, ambCube(vec3(0, 1, 0)), 0.35);
  // what distant cloud dissolves into
  vec3 skyc = skyLut(normalize(vec3(dir.x, max(dir.y, 0.02), dir.z)));
  vec3 scat = vec3(0.);
  float T = 1.;
  float base = uCloudBase, top = uCloudTop, t0 = 0., t1 = 0.;
  if (abs(dir.y) > 1e-4) {
    float a = (base - C.y) / dir.y, b = (top - C.y) / dir.y;
    t0 = max(0., min(a, b)); t1 = max(a, b);
  }
  if (C.y > base && C.y < top) t0 = 0.;
  t1 = min(t1, min(D, 42000.));
  if (uCloud > 0.02 && t1 > t0) {
    // 32 steps, each frame at a new offset: the averaging over frames does the rest
    const int M = 32;
    float stp = min(t1 - t0, 12000.) / float(M), t = t0 + stp * jit;
    for (int i = 0; i < M; i++) {
      vec3 p = C + dir * t;
      float d = cumulus(p, true);
      if (d > 0.002) {
        float sigma = d * 0.02;
        // toward the sun, steps growing from 40 m to about 1.6 km
        float od = 0.;
        for (int k = 0; k < 4; k++) {
          float s0 = 40. * pow(3.4, float(k)), s1 = 40. * pow(3.4, float(k + 1));
          od += cumulus(p + L * (s0 + s1) * 0.5, k < 2) * (s1 - s0);
        }
        od *= 0.02;
        // multiple scattering, roughly: each octave lets light further in and scatters it more evenly
        vec3 Ls = vec3(0.);
        float a = 1., b = 1., c = 1.;
        for (int k = 0; k < 3; k++) {
          Ls += a * exp(-od * b) * mix(hgPhase(mu, 0.75 * c), hgPhase(mu, -0.12 * c), 0.4) * 12.566;
          a *= 0.5; b *= 0.45; c *= 0.5;
        }
        float powder = 1. - exp(-sigma * 300.);
        float h = (p.y - base) / (top - base);
        vec3 amb = ambUp * mix(0.3, 1.25, h) * (1. - 0.4 * d);
        vec3 S = (uKeyColor * Ls * mix(0.55, 1., powder) * keyHorizon(p) * 1.1 + amb) * sigma;
        float Ts = exp(-sigma * stp);
        float air = exp(-t / 55000.);
        scat += mix(skyc * (1. - Ts) * T, T * (S - S * Ts) / sigma, air);
        T *= Ts;
        if (T < 0.02) break;
      }
      t += stp;
    }
  }
  gl_FragColor = vec4(scat, T);
}
`;

// average over frames: last frame's result for the same view direction, held to the spread of this
// frame's neighbourhood
const RESOLVE = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tCur, tHist;
uniform mat4 uInvVP, uPrevVP;
uniform vec3 uCam;
uniform float uReset;
void main(){
  vec4 cur = texture(tCur, vUv);
  vec4 o = cur;
  if (uReset < 0.5) {
    vec4 far = uInvVP * vec4(vUv * 2. - 1., 1., 1.);
    vec3 dir = far.xyz / far.w - uCam;
    vec4 pc = uPrevVP * vec4(dir, 0.);
    vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
    if (pc.w > 0. && all(greaterThan(puv, vec2(0.))) && all(lessThan(puv, vec2(1.)))) {
      vec2 t = 1. / vec2(textureSize(tCur, 0));
      vec4 lo = cur, hi = cur;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec4 c = texture(tCur, vUv + vec2(i, j) * t);
        lo = min(lo, c); hi = max(hi, c);
      }
      o = mix(clamp(texture(tHist, puv), lo, hi), cur, 0.15);
    }
  }
  gl_FragColor = o;
}
`;

export class Clouds {
  constructor(renderer) {
    this.renderer = renderer;
    this.march = fsMaterial(MARCH, Object.assign({}, U, {
      tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uInvView: { value: new THREE.Matrix4() },
      uFrame: { value: 0 }, uCamPos: { value: new THREE.Vector3() },
    }));
    this.resolve = fsMaterial(RESOLVE, {
      tCur: { value: null }, tHist: { value: null }, uInvVP: { value: new THREE.Matrix4() }, uPrevVP: { value: new THREE.Matrix4() },
      uCam: { value: new THREE.Vector3() }, uReset: { value: 1 },
    });
    this.vp = new THREE.Matrix4(); this.prevVP = new THREE.Matrix4();
    this.prevPos = new THREE.Vector3();
    this.frame = 0; this.i = 0;
  }
  setSize(W, H) {
    if (this.cur) { this.cur.dispose(); this.hist.forEach(t => t.dispose()); }
    // a third of the render size each way: twice the old clouds' resolution, and the averaging over
    // frames keeps the edges
    const w = Math.ceil(W / 3), h = Math.ceil(H / 3);
    this.cur = makeRT(w, h);
    this.hist = [makeRT(w, h), makeRT(w, h)];
    this.reset = true;
  }
  // the half-res result, (inscatter, transmittance), for the caller to upsample and blend
  render(mainRT, camera) {
    const r = this.renderer, m = this.march.uniforms;
    m.tDepth.value = mainRT.depthTexture;
    m.uInvProj.value.copy(camera.projectionMatrixInverse);
    m.uInvView.value.copy(camera.matrixWorld);
    m.uCamPos.value.copy(camera.position);
    m.uFrame.value = this.frame++ % 64;
    renderFS(r, this.march, this.cur);
    const u = this.resolve.uniforms;
    this.vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    // a cut to a new shot shouldn't carry the old sky over
    if (camera.position.distanceTo(this.prevPos) > 40) this.reset = true;
    u.tCur.value = this.cur.texture; u.tHist.value = this.hist[this.i].texture;
    u.uInvVP.value.copy(this.vp).invert(); u.uPrevVP.value.copy(this.prevVP);
    u.uCam.value.copy(camera.position); u.uReset.value = this.reset ? 1 : 0;
    const out = this.hist[1 - this.i];
    renderFS(r, this.resolve, out);
    this.i = 1 - this.i; this.reset = false;
    this.prevVP.copy(this.vp); this.prevPos.copy(camera.position);
    return out;
  }
}
