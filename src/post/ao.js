// Screen-space ambient occlusion: half-res, SAO-style horizon samples from the depth buffer, rotated
// every frame so the temporal pass averages the noise away. Upsampled with depth weights and
// multiplied into the HDR scene before the volumetrics, so haze and light shafts stay unshaded.
import * as THREE from 'three';
import { U } from '../core/shared.js';
import { fsMaterial, renderFS, makeRT } from '../core/fsq.js';

const AO = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform highp sampler2D tDepth;
uniform mat4 uInvProj;
uniform vec2 uRes;          // depth buffer size
uniform float uProjScale;   // pixels per metre at 1m view depth
uniform float uRadius, uFrame;
// explicit LOD: these run in loops past an early exit, where the D3D compiler warns about
// implicit-gradient lookups
vec3 viewPos(vec2 uv){
  float d = textureLod(tDepth, uv, 0.).r;
  vec4 v = uInvProj * vec4(uv * 2. - 1., d * 2. - 1., 1.);
  return v.xyz / v.w;
}
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main(){
  float d0 = texture(tDepth, vUv).r;
  if (d0 >= 0.99999) { gl_FragColor = vec4(1.); return; }
  vec3 P = viewPos(vUv);
  // normal from the flatter of the two neighbours on each axis, so silhouettes don't smear
  vec2 t = 1. / uRes;
  vec3 px = viewPos(vUv + vec2(t.x, 0)) - P, nx = P - viewPos(vUv - vec2(t.x, 0));
  vec3 py = viewPos(vUv + vec2(0, t.y)) - P, ny = P - viewPos(vUv - vec2(0, t.y));
  vec3 N = normalize(cross(abs(px.z) < abs(nx.z) ? px : nx, abs(py.z) < abs(ny.z) ? py : ny));
  float rPx = uRadius * uProjScale / -P.z;
  if (rPx < 1.5) { gl_FragColor = vec4(1.); return; }
  rPx = min(rPx, 140.);
  float rot = ign(gl_FragCoord.xy + 5.588238 * uFrame) * 6.2832;
  float jit = fract(ign(gl_FragCoord.yx * 1.37 + uFrame * 3.1) + 0.5);
  float occ = 0.;
  const int DIRS = 4, STEPS = 4;
  for (int i = 0; i < DIRS; i++) {
    float a = rot + float(i) * 3.14159 / float(DIRS) * 2.;
    vec2 dir = vec2(cos(a), sin(a));
    for (int j = 0; j < STEPS; j++) {
      float s = (float(j) + jit) / float(STEPS);
      vec2 uv = vUv + dir * s * s * rPx * t;
      vec3 v = viewPos(uv) - P;
      float dd = dot(v, v);
      float vn = dot(v, N);
      occ += max(0., vn * inversesqrt(dd + 1e-4) - 0.08) * max(0., 1. - dd / (uRadius * uRadius));
    }
  }
  float ao = max(0., 1. - occ / float(DIRS * STEPS) * 2.2);
  gl_FragColor = vec4(vec3(ao * ao), 1.);
}
`;

// Full-res: upsample the AO, and add screen-space contact shadows: a short march through the depth
// buffer toward the sun from every pixel within 160 m, which grounds chimneys, crew, ropes and houses
// where the cascades are too coarse to (UE does the same). The scene's alpha says how much of each
// pixel is direct light: contact shadows darken only that part, and AO only the rest.
const APPLY = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tAO, tScene, tNoise;
uniform highp sampler2D tDepth;
uniform vec2 uHalfRes, uRes;
uniform mat4 uProj, uInvProj;
uniform vec3 uLightV;
uniform float uStrength, uAOOn, uContactOn, uFrame, uLightUp, uWide;
float linZ(float d){ float z = d * 2. - 1.; return uProj[3][2] / (z * uProj[2][3] - uProj[2][2]); }
vec3 viewPos(vec2 uv, float d){ vec4 v = uInvProj * vec4(uv * 2. - 1., d * 2. - 1., 1.); return v.xyz / v.w; }
float contact(float d0){
  vec3 P = viewPos(vUv, d0);
  float dist = -P.z, occ = 0.;
  if (dist < 160. && uLightUp > 0.) {
    // a metre or so near, reaching further away where a pixel is bigger
    float len = 1.2 + dist * 0.012, thick = 0.3 + dist * 0.01, bias = 0.03 + dist * 0.0015;
    float jit = fract(texelFetch(tNoise, ivec2(gl_FragCoord.xy) & 255, 0).a + uFrame * 0.618034);
    for (int i = 0; i < 12; i++) {
      vec3 Q = P + uLightV * len * (float(i) + jit + 0.5) / 12.;
      vec4 c = uProj * vec4(Q, 1.);
      vec2 q = c.xy / c.w * 0.5 + 0.5;
      if (any(lessThan(q, vec2(0.))) || any(greaterThan(q, vec2(1.)))) break;
      float dz = -Q.z + linZ(texture(tDepth, q).r);
      if (dz > bias && dz < thick) { occ = 1.; break; }
    }
    occ *= 1. - smoothstep(100., 160., dist);
  }
  return occ;
}
void main(){
  float d0 = texture(tDepth, vUv).r;
  float ao = 1.;
  if (uAOOn > 0.5) {
    float zc = linZ(d0);
    vec2 hp = vUv * uHalfRes - 0.5;
    vec2 b = floor(hp), f = hp - b;
    // wide: each tap sits on a texel corner, so the filtering averages a 2x2 block and the four taps
    // between them cover 4x4 half-res pixels: a blur for the price of the plain upsample
    if (uWide > 0.5) f = (f + 0.5) * 0.5;
    float acc = 0., ws = 0.;
    for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
      vec2 uv = (uWide > 0.5 ? b + vec2(i, j) * 2. : b + vec2(i, j) + 0.5) / uHalfRes;
      float z = linZ(texture(tDepth, uv).r);
      float bw = (i == 0 ? 1. - f.x : f.x) * (j == 0 ? 1. - f.y : f.y);
      float w = bw * exp(-abs(z - zc) / (abs(zc) * 0.03 + 0.1)) + 1e-4 * bw;
      acc += texture(tAO, uv).r * w; ws += w;
    }
    ao = mix(1., acc / ws, uStrength);
  }
  float a = texture(tScene, vUv).a, direct = (1. - a) / 0.999;
  float cs = uContactOn > 0.5 && a < 1. && d0 < 1. ? contact(d0) : 0.;
  // alpha 1: a material that doesn't say, so AO darkens all of it as before
  float m = a < 1. ? (1. - direct) * ao + direct * (1. - cs) : ao;
  gl_FragColor = vec4(vec3(m), 1.);
}
`;
// the scene's own depth is attached to the target we darken, so the multiply can't read it
const MUL = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tAO;
void main(){ gl_FragColor = vec4(texture(tAO, vUv).rgb, 1.); }
`;

export class AmbientOcclusion {
  constructor(renderer) {
    this.renderer = renderer;
    this.mat = fsMaterial(AO, {
      tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uRes: { value: new THREE.Vector2() },
      uProjScale: { value: 1 }, uRadius: { value: 2.2 }, uFrame: { value: 0 },
    });
    this.apply = fsMaterial(APPLY, {
      tAO: { value: null }, tDepth: { value: null }, tScene: { value: null }, tNoise: U.uNoise2D,
      uHalfRes: { value: new THREE.Vector2() }, uRes: { value: new THREE.Vector2() }, uProj: { value: new THREE.Matrix4() }, uInvProj: { value: new THREE.Matrix4() },
      uLightV: { value: new THREE.Vector3() }, uStrength: { value: 0.75 }, uAOOn: { value: 1 }, uContactOn: { value: 1 }, uFrame: U.uTAAFrame, uLightUp: { value: 1 }, uWide: { value: 0 },
    });
    this.aoOn = true; this.contactOn = true;
    this.wide = true;
    // dst = dst * ao
    this.mul = fsMaterial(MUL, { tAO: { value: null } }, { blending: THREE.CustomBlending, extra: { blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor } });
    this.rt = null; this.full = null;
  }
  setSize(W, H) {
    if (this.rt) { this.rt.dispose(); this.full.dispose(); }
    this.rt = makeRT(Math.ceil(W / 2), Math.ceil(H / 2), { type: THREE.UnsignedByteType });
    this.full = makeRT(W, H, { type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  }
  render(mainRT, camera) {
    if (!this.aoOn && !this.contactOn) return;
    const u = this.mat.uniforms;
    if (this.aoOn) {
      u.tDepth.value = mainRT.depthTexture;
      u.uInvProj.value.copy(camera.projectionMatrixInverse);
      u.uRes.value.set(mainRT.width, mainRT.height);
      u.uProjScale.value = camera.projectionMatrix.elements[5] * mainRT.height * 0.5;
      u.uFrame.value = U.uTAAFrame.value;
      renderFS(this.renderer, this.mat, this.rt);
    }
    const a = this.apply.uniforms;
    a.tAO.value = this.rt.texture; a.tDepth.value = mainRT.depthTexture; a.tScene.value = mainRT.texture;
    a.uHalfRes.value.set(this.rt.width, this.rt.height); a.uRes.value.set(mainRT.width, mainRT.height);
    a.uProj.value.copy(camera.projectionMatrix); a.uInvProj.value.copy(camera.projectionMatrixInverse);
    a.uLightV.value.copy(U.uKeyDir.value).transformDirection(camera.matrixWorldInverse);
    a.uLightUp.value = U.uKeyDir.value.y > 0.02 ? 1 : 0;
    a.uWide.value = this.wide ? 1 : 0;
    a.uAOOn.value = this.aoOn ? 1 : 0; a.uContactOn.value = this.contactOn ? 1 : 0;
    renderFS(this.renderer, this.apply, this.full);
    this.mul.uniforms.tAO.value = this.full.texture;
    renderFS(this.renderer, this.mul, mainRT);
  }
}
