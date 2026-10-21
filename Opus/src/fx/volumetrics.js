// Quarter-res raymarched participating media: thin air with shafts from the shadow maps, snowstorm
// haze and a volumetric cloud layer. Depth-aware upsample, then blended over the HDR scene as
// scene * T + inscatter.
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
uniform sampler2D tDepth;
uniform mat4 uInvProj, uInvView;
uniform vec2 uHalfRes;
uniform float uFrame;

float viewDist(vec2 uv, out vec3 dir){
  float d = texture(tDepth, uv).r;
  vec4 ndc = vec4(uv * 2. - 1., d * 2. - 1., 1.);
  vec4 v = uInvProj * ndc; v /= v.w;
  vec3 w = (uInvView * vec4(v.xyz, 1.)).xyz;
  vec4 far = uInvProj * vec4(uv * 2. - 1., 1., 1.); far /= far.w;
  dir = normalize((uInvView * vec4(far.xyz, 0.)).xyz);
  return d >= 0.99999 ? 1e7 : length(w - cameraPosition);
}

float cloudCover(vec2 xz){ return cloudDensity2D(xz); }
float cloudDensity(vec3 p){
  float base = uCloudBase, top = uCloudTop;
  float h = (p.y - base) / (top - base);
  if (h < 0. || h > 1.) return 0.;
  float cov = cloudCover(p.xz);
  if (cov <= 0.02) return 0.;
  // flat bases, billowing rounded tops; thicker cover reaches higher
  float hg = smoothstep(0., 0.07, h) * smoothstep(min(1., 0.35 + 0.75 * cov), 0.2, h);
  vec3 q = (p + vec3(uCloudOffset.x, 0., uCloudOffset.y)) / 3300.;
  float n = textureLod(uNoise3D, q, 0.).r * 0.75 + textureLod(uNoise3D, q * 2.1 + 0.3, 0.).a * 0.25;
  float d = sat((n * hg - (1. - cov)) / max(cov, 0.1));
  if (d > 0.) {
    float det = textureLod(uNoise3D, q * 6.3 + vec3(0., uTime * 0.002, 0.), 0.).g;
    d = sat((d - det * 0.38 * (1. - d * 0.6)) / (1. - det * 0.38 + 1e-3));
  }
  return d * (1. + uStorm);
}

void main(){
  vec3 dir;
  float D = viewDist(vUv, dir);
  vec3 C = cameraPosition;
  float jit = fract(texelFetch(uNoise2D, ivec2(gl_FragCoord.xy) & 255, 0).a + uFrame * 0.618034);
  vec3 L = uKeyDir;
  float mu = dot(dir, L);
  float phaseAir = mix(hgPhase(mu, 0.55), hgPhase(mu, -0.15), 0.35) * 12.566;
  // the air down low only sees the deep blue zenith, not the glowing horizon
  vec3 zen = skyLut(vec3(0., 1., 0.)) * 0.53 * 3.14159 * 0.55;
  vec3 ambUp = mix(zen, ambCube(vec3(0, 1, 0)), 0.35);
  vec3 ambSide = mix(zen, ambCube(-dir), 0.35);
  vec3 scat = vec3(0);
  float T = 1.;

  // --- near media: snow haze and faint air for shafts ---
  float Dn = min(D, 6000.);
  const int N = 22;
  float prev = 0.;
  float airBase = 0.00006 + uStorm * 0.0009 + uDiamond * 0.00003;
  for (int i = 0; i < N; i++) {
    float x = (float(i) + jit) / float(N);
    float t = Dn * x * x;
    float dt = t - prev; prev = t;
    if (dt <= 0.) continue;
    vec3 p = C + dir * t;
    float hfall = exp(-max(p.y - 40., 0.) / 900.);
    float air = airBase * hfall;
    if (uStorm > 0.) {
      vec3 sq = p / 90. + vec3(uTime * 0.06, -uTime * 0.04, uTime * 0.05) * uWindStrength;
      air *= 0.6 + 0.8 * texture(uNoise3D, sq).r;
    }
    float sigma = air;
    if (sigma < 1e-7) continue;
    // shafts only matter near the camera; skip the shadow maps further out
    float sh = keyHorizon(p) * terrainShadow(p) * cloudShadow(p);
    if (t < 2500.) sh *= cascadeShadowFast(p);
    vec3 Ls = uKeyColor * sh * phaseAir;
    vec3 La = mix(ambSide, ambUp, 0.6) * 1.2;
    vec3 S = (Ls + La) * sigma;
    float Ts = exp(-sigma * dt);
    scat += T * (S - S * Ts) / max(sigma, 1e-7);
    T *= Ts;
    if (T < 0.01) break;
  }

  // --- cloud layer ---
  if (uCloud > 0.02) {
    float base = uCloudBase, top = uCloudTop;
    float t0, t1;
    if (abs(dir.y) < 1e-4) { t0 = 0.; t1 = 0.; }
    else {
      float a = (base - C.y) / dir.y, b = (top - C.y) / dir.y;
      t0 = max(0., min(a, b)); t1 = max(a, b);
    }
    if (C.y > base && C.y < top) t0 = 0.;
    t1 = min(t1, min(D, 42000.));
    if (t1 > t0 && T > 0.01) {
      const int M = 20;
      float len = min(t1 - t0, 9000.);
      float stp = len / float(M);
      float t = t0 + stp * jit;
      float phaseC = mix(hgPhase(mu, 0.72), hgPhase(mu, -0.1), 0.45) * 12.566;
      for (int i = 0; i < M; i++) {
        vec3 p = C + dir * t;
        float d = cloudDensity(p);
        if (d > 0.003) {
          float sigma = d * 0.018;
          // light march toward the key light
          float od = 0.;
          for (int k = 0; k < 3; k++) {
            vec3 q = p + L * (70. + 220. * float(k) * float(k));
            od += cloudDensity(q) * (150. + 220. * float(k));
          }
          float Tl = exp(-od * 0.018) * 0.85 + exp(-od * 0.004) * 0.15;
          float powder = 1. - exp(-sigma * 400.);
          float h = (p.y - base) / (top - base);
          vec3 amb = ambUp * mix(0.35, 1.25, h) * (1. - 0.4 * d);
          vec3 Ls = uKeyColor * Tl * phaseC * mix(0.6, 1., powder) * keyHorizon(p) * 1.2;
          vec3 S = (Ls + amb) * sigma;
          float Ts = exp(-sigma * stp);
          // distant cloud dissolves into the sky
          float air = exp(-t / 55000.);
          vec3 skyc = skyLut(normalize(vec3(dir.x, max(dir.y, 0.02), dir.z)));
          vec3 add = T * (S - S * Ts) / sigma;
          scat += mix(skyc * (1. - Ts) * T, add, air);
          T *= Ts;
          if (T < 0.02) break;
        }
        t += stp;
      }
    }
  }
  gl_FragColor = vec4(scat, T);
}
`;

const UPSAMPLE = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tVol, tDepth;
uniform vec2 uHalfRes, uFullRes;
uniform mat4 uProj;
float linZ(float d){ float z = d * 2. - 1.; return uProj[3][2] / (z * uProj[2][3] - uProj[2][2]); }
void main(){
  float zc = linZ(texture(tDepth, vUv).r);
  vec2 hp = vUv * uHalfRes - 0.5;
  vec2 b = floor(hp), f = hp - b;
  vec4 acc = vec4(0); float wsum = 0.;
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
    vec2 o = vec2(i, j);
    vec2 uv = (b + o + 0.5) / uHalfRes;
    float z = linZ(texture(tDepth, uv).r);
    float bw = (i == 0 ? 1. - f.x : f.x) * (j == 0 ? 1. - f.y : f.y);
    float w = bw * exp(-abs(z - zc) / (abs(zc) * 0.06 + 0.5)) + 1e-4 * bw;
    acc += texture(tVol, uv) * w; wsum += w;
  }
  gl_FragColor = acc / max(wsum, 1e-5);
}
`;

const BLUR = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tVol, tDepth;
uniform vec2 uDir, uHalfRes;
uniform mat4 uProj;
float linZ(float d){ float z = d * 2. - 1.; return uProj[3][2] / (z * uProj[2][3] - uProj[2][2]); }
void main(){
  float zc = linZ(texture(tDepth, vUv).r);
  vec4 acc = vec4(0); float ws = 0.;
  for (int i = -3; i <= 3; i++) {
    vec2 uv = vUv + uDir * float(i) / uHalfRes;
    float z = linZ(texture(tDepth, uv).r);
    float w = exp(-float(i * i) / 6.) * exp(-abs(z - zc) / (abs(zc) * 0.05 + 0.3));
    acc += texture(tVol, uv) * w; ws += w;
  }
  gl_FragColor = acc / ws;
}
`;

const BLEND = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tVol;
void main(){ gl_FragColor = texture(tVol, vUv); }
`;

export class Volumetrics {
  constructor(renderer) {
    this.renderer = renderer;
    this.march = fsMaterial(MARCH, Object.assign({}, U, {
      tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uInvView: { value: new THREE.Matrix4() },
      uHalfRes: { value: new THREE.Vector2() }, uFrame: { value: 0 }, uCamPos: { value: new THREE.Vector3() },
    }));
    this.up = fsMaterial(UPSAMPLE, {
      tVol: { value: null }, tDepth: { value: null }, uHalfRes: { value: new THREE.Vector2() }, uFullRes: { value: new THREE.Vector2() },
      uProj: { value: new THREE.Matrix4() },
    });
    this.blur = fsMaterial(BLUR, { tVol: { value: null }, tDepth: { value: null }, uDir: { value: new THREE.Vector2() }, uHalfRes: { value: new THREE.Vector2() }, uProj: { value: new THREE.Matrix4() } });
    // dst = vol.rgb + dst * vol.a
    this.blend = fsMaterial(BLEND, { tVol: { value: null } }, {
      blending: THREE.CustomBlending,
      extra: { blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.SrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor },
    });
    this.half = null; this.full = null; this.frame = 0;
  }
  setSize(W, H) {
    if (this.half) { this.half.dispose(); this.full.dispose(); this.half2.dispose(); }
    // quarter resolution: clouds and air are soft, and the depth-aware upsample plus TAA rebuild the edges
    const D = this.div = 4;
    this.half = makeRT(Math.ceil(W / D), Math.ceil(H / D), { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.half2 = makeRT(Math.ceil(W / D), Math.ceil(H / D), { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.full = makeRT(W, H);
    this.W = W; this.H = H;
  }
  render(mainRT, camera) {
    const r = this.renderer;
    const m = this.march.uniforms;
    m.tDepth.value = mainRT.depthTexture;
    m.uInvProj.value.copy(camera.projectionMatrixInverse);
    m.uInvView.value.copy(camera.matrixWorld);
    m.uCamPos.value.copy(camera.position);
    m.uHalfRes.value.set(this.half.width, this.half.height);
    m.uFrame.value = this.frame++ % 64;
    renderFS(r, this.march, this.half);
    const bl = this.blur.uniforms;
    bl.tDepth.value = mainRT.depthTexture; bl.uHalfRes.value.set(this.half.width, this.half.height); bl.uProj.value.copy(camera.projectionMatrix);
    bl.tVol.value = this.half.texture; bl.uDir.value.set(1, 0); renderFS(r, this.blur, this.half2);
    bl.tVol.value = this.half2.texture; bl.uDir.value.set(0, 1); renderFS(r, this.blur, this.half);
    const u = this.up.uniforms;
    u.tVol.value = this.half.texture; u.tDepth.value = mainRT.depthTexture;
    u.uHalfRes.value.set(this.half.width, this.half.height); u.uFullRes.value.set(this.W, this.H);
    u.uProj.value.copy(camera.projectionMatrix);
    renderFS(r, this.up, this.full);
    this.blend.uniforms.tVol.value = this.full.texture;
    renderFS(r, this.blend, mainRT);
  }
}
