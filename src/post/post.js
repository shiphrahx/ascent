// HDR post: bloom mip chain, heat shimmer, exposure, filmic curve, per-hour grade, vignette, grain, FXAA.
import * as THREE from 'three';
import { fsMaterial, renderFS, makeRT } from '../core/fsq.js';

const DOWN = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uFirst;
vec3 s(vec2 o){ return texture(tSrc, vUv + o * uTexel).rgb; }
vec3 karis(vec3 c){ return c / (1. + max(c.r, max(c.g, c.b)) * 0.25); }
void main(){
  vec3 a = s(vec2(-2,2)), b = s(vec2(0,2)), c = s(vec2(2,2));
  vec3 d = s(vec2(-2,0)), e = s(vec2(0,0)), f = s(vec2(2,0));
  vec3 g = s(vec2(-2,-2)), h = s(vec2(0,-2)), i = s(vec2(2,-2));
  vec3 j = s(vec2(-1,1)), k = s(vec2(1,1)), l = s(vec2(-1,-1)), m = s(vec2(1,-1));
  vec3 col;
  if (uFirst > 0.5) {
    col = karis(e) * 0.125 + karis((a + c + g + i) * 0.25) * 0.125 + karis((b + d + f + h) * 0.25) * 0.25 + karis((j + k + l + m) * 0.25) * 0.5;
  } else {
    col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  gl_FragColor = vec4(max(col, 0.), 1.);
}
`;
const UP = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uRadius;
void main(){
  vec2 o = uTexel * uRadius;
  vec3 c = texture(tSrc, vUv + vec2(-o.x, o.y)).rgb + texture(tSrc, vUv + vec2(0, o.y)).rgb * 2. + texture(tSrc, vUv + o).rgb
    + texture(tSrc, vUv + vec2(-o.x, 0)).rgb * 2. + texture(tSrc, vUv).rgb * 4. + texture(tSrc, vUv + vec2(o.x, 0)).rgb * 2.
    + texture(tSrc, vUv - o).rgb + texture(tSrc, vUv + vec2(0, -o.y)).rgb * 2. + texture(tSrc, vUv + vec2(o.x, -o.y)).rgb;
  gl_FragColor = vec4(c / 16., 1.);
}
`;

const COMPOSITE = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tScene, tBloom;
uniform vec2 uRes;
uniform float uExposure, uBloom, uTime, uSat, uCon, uVignette, uGrain, uFade;
uniform vec3 uShadowTint, uHighTint, uFadeColor;
uniform vec4 uHeat[2];     // xy screen pos of flame, z strength, w radius
uniform vec2 uHeatUp[2];   // screen-space up direction
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 aces(vec3 x){
  const mat3 I = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 O = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  vec3 v = I * x;
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return clamp(O * (a / b), 0., 1.);
}
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 sceneAt(vec2 uv){ return texture(tScene, uv).rgb; }
void main(){
  vec2 uv = vUv;
  // heat shimmer above burner flames
  for (int i = 0; i < 2; i++) {
    vec4 h = uHeat[i];
    if (h.z <= 0.) continue;
    vec2 up = uHeatUp[i];
    vec2 rel = (uv - h.xy) * vec2(uRes.x / uRes.y, 1.);
    vec2 side = vec2(up.y, -up.x);
    float a = dot(rel, up), sd = dot(rel, side);
    float mask = smoothstep(-0.2 * h.w, 0.15 * h.w, a) * smoothstep(1.6 * h.w, 0.4 * h.w, a) * smoothstep(0.42 * h.w, 0.0, abs(sd));
    float t = uTime * 9.;
    vec2 off = vec2(sin(a * 90. / h.w - t) + sin(sd * 140. / h.w + t * 1.3) * 0.6, cos(a * 70. / h.w - t * 1.1)) * 0.0028 * h.z * mask;
    uv += off;
  }
  vec3 col = sceneAt(uv);
  vec3 bloom = texture(tBloom, uv).rgb;
  col = mix(col, bloom, 0.06 * uBloom) + bloom * 0.03 * uBloom;
  col *= uExposure;
  // split-tone before the curve: tint the shadows, warm or cool the highlights
  float L = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col *= mix(vec3(1.), uHighTint, smoothstep(0.05, 1.2, L));
  col += uShadowTint * (1. - smoothstep(0.0, 0.35, L)) * 0.6;
  col = aces(col * 1.05);
  // contrast around mid grey and saturation
  col = clamp((col - 0.42) * uCon + 0.42, 0., 1.);
  float l2 = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(l2), col, uSat), 0.);
  // vignette
  vec2 q = vUv - 0.5;
  col *= 1. - uVignette * dot(q, q) * 1.6;
  col = toSRGB(col);
  col = mix(col, uFadeColor, uFade);
  // film grain and dither
  float g = hash(vUv * uRes + fract(uTime * 13.) * 100.) - 0.5;
  col += g * uGrain + (hash(vUv * uRes.yx + 3.1) - 0.5) / 255.;
  gl_FragColor = vec4(col, 1.);
}
`;

const FXAA = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uTexel;
float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
void main(){
  vec3 rgbNW = texture(tSrc, vUv + vec2(-1., -1.) * uTexel).rgb;
  vec3 rgbNE = texture(tSrc, vUv + vec2(1., -1.) * uTexel).rgb;
  vec3 rgbSW = texture(tSrc, vUv + vec2(-1., 1.) * uTexel).rgb;
  vec3 rgbSE = texture(tSrc, vUv + vec2(1., 1.) * uTexel).rgb;
  vec3 rgbM = texture(tSrc, vUv).rgb;
  float lNW = lum(rgbNW), lNE = lum(rgbNE), lSW = lum(rgbSW), lSE = lum(rgbSE), lM = lum(rgbM);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1. / 128.);
  float rcp = 1. / (min(abs(dir.x), abs(dir.y)) + red);
  dir = clamp(dir * rcp, -8., 8.) * uTexel;
  vec3 a = 0.5 * (texture(tSrc, vUv + dir * (1. / 3. - 0.5)).rgb + texture(tSrc, vUv + dir * (2. / 3. - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture(tSrc, vUv + dir * -0.5).rgb + texture(tSrc, vUv + dir * 0.5).rgb);
  float lB = lum(b);
  gl_FragColor = vec4((lB < lMin || lB > lMax) ? a : b, 1.);
}
`;

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.levels = 6;
    this.down = fsMaterial(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 } });
    this.up = fsMaterial(UP, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 } }, { blending: THREE.AdditiveBlending });
    this.comp = fsMaterial(COMPOSITE, {
      tScene: { value: null }, tBloom: { value: null }, uRes: { value: new THREE.Vector2() },
      uExposure: { value: 1 }, uBloom: { value: 1 }, uTime: { value: 0 }, uSat: { value: 1 }, uCon: { value: 1 },
      uVignette: { value: 0.32 }, uGrain: { value: 0.012 }, uFade: { value: 0 }, uFadeColor: { value: new THREE.Color(0.75, 0.78, 0.84) },
      uShadowTint: { value: new THREE.Vector3() }, uHighTint: { value: new THREE.Vector3(1, 1, 1) },
      uHeat: { value: [new THREE.Vector4(), new THREE.Vector4()] }, uHeatUp: { value: [new THREE.Vector2(0, 1), new THREE.Vector2(0, 1)] },
    });
    this.fxaa = fsMaterial(FXAA, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.chain = [];
    this.ldr = null;
  }
  setSize(w, h) {
    for (const t of this.chain) t.dispose();
    this.chain = [];
    let cw = w, ch = h;
    for (let i = 0; i < this.levels; i++) {
      cw = Math.max(1, Math.floor(cw / 2)); ch = Math.max(1, Math.floor(ch / 2));
      this.chain.push(makeRT(cw, ch));
    }
    if (this.ldr) this.ldr.dispose();
    this.ldr = makeRT(w, h, { type: THREE.UnsignedByteType });
    this.w = w; this.h = h;
  }
  render(src, look, time) {
    const r = this.renderer;
    // bloom: progressive downsample then tent upsample
    let prev = src;
    for (let i = 0; i < this.levels; i++) {
      const t = this.chain[i];
      this.down.uniforms.tSrc.value = prev;
      this.down.uniforms.uTexel.value.set(1 / prev.image.width, 1 / prev.image.height);
      this.down.uniforms.uFirst.value = i === 0 ? 1 : 0;
      renderFS(r, this.down, t);
      prev = t.texture;
    }
    for (let i = this.levels - 1; i > 0; i--) {
      const s = this.chain[i], d = this.chain[i - 1];
      this.up.uniforms.tSrc.value = s.texture;
      this.up.uniforms.uTexel.value.set(1 / s.width, 1 / s.height);
      this.up.uniforms.uRadius.value = 1.0;
      renderFS(r, this.up, d);
    }
    const u = this.comp.uniforms;
    u.tScene.value = src; u.tBloom.value = this.chain[0].texture;
    u.uRes.value.set(this.w, this.h);
    u.uExposure.value = look.exposure; u.uBloom.value = look.bloom; u.uTime.value = time;
    u.uSat.value = look.sat; u.uCon.value = look.con;
    u.uShadowTint.value.fromArray(look.sh); u.uHighTint.value.fromArray(look.hi);
    renderFS(r, this.comp, this.ldr);
    this.fxaa.uniforms.tSrc.value = this.ldr.texture;
    this.fxaa.uniforms.uTexel.value.set(1 / this.w, 1 / this.h);
    renderFS(r, this.fxaa, null);
  }
}
