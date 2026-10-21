// HDR post: bloom mip chain, heat shimmer, exposure, UE5's filmic curve, per-hour grade, vignette, dither.
import * as THREE from 'three';
import { fsMaterial, renderFS, makeRT } from '../core/fsq.js';
import { AsyncReader } from '../core/readback.js';

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

// 64x36 log luminance of the resolved frame (before exposure): the histogram for auto exposure reads
// it back, and local exposure samples it as each pixel's neighbourhood
const LUM = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uCell;
void main(){
  float s = 0.;
  for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) {
    vec3 c = texture(tSrc, vUv + (vec2(i, j) - 1.5) * 0.25 * uCell).rgb;
    s += log2(max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-6));
  }
  gl_FragColor = vec4(s / 16., 0., 0., 1.);
}
`;

const COMPOSITE = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tScene, tBloom, tLum;
uniform float uLumAvg, uLocalShadow, uLocalHigh;
uniform vec2 uRes;
uniform float uExposure, uBloom, uTime, uSat, uCon, uVignette, uFade, uLevels, uDof, uFocus, uGrain;
uniform highp sampler2D tDepth;
uniform mat4 uProj;
uniform vec3 uShadowTint, uHighTint, uFadeColor;
uniform vec4 uHeat[2];     // xy screen pos of flame, z strength, w radius
uniform vec2 uHeatUp[2];   // screen-space up direction
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
// UE5's filmic tone curve at its default settings (slope 0.88, toe 0.55, shoulder 0.26, black clip 0,
// white clip 0.04), worked in ACEScg with UE's 0.96 pre and 0.93 post desaturation. With these settings
// the toe and shoulder overlap, which UE handles by running the blend backwards; so does this.
// The constants are UE's own derivation (0.18 in maps to 0.18 out), worked out ahead.
vec3 filmUE(vec3 x){
  const mat3 toAP1 = mat3(0.6131, 0.0702, 0.0206, 0.3395, 0.9164, 0.1096, 0.0474, 0.0134, 0.8698);
  const mat3 fromAP1 = mat3(1.7051, -0.1303, -0.0240, -0.6218, 1.1408, -0.1290, -0.0833, -0.0105, 1.1530);
  const vec3 Y = vec3(0.2722, 0.6741, 0.0537);
  const float S = 0.88, W = 0.04, toeS = 0.45, shS = 0.78;
  const float toeM = -0.390277, straightM = 0.901641, shM = -0.606186;
  vec3 c = max(toAP1 * x, 0.);
  c = mix(vec3(dot(c, Y)), c, 0.96);
  vec3 L = log2(max(c, vec3(1e-10))) * 0.30103;
  vec3 straight = S * (L + straightM);
  vec3 toe = 2. * toeS / (1. + exp(-2. * S / toeS * (L - toeM)));
  vec3 sh = (1. + W) - 2. * shS / (1. + exp(2. * S / shS * (L - shM)));
  toe = mix(straight, toe, vec3(lessThan(L, vec3(toeM))));
  sh = mix(straight, sh, vec3(greaterThan(L, vec3(shM))));
  vec3 t = 1. - clamp((L - toeM) / (shM - toeM), 0., 1.);
  t = (3. - 2. * t) * t * t;
  vec3 o = max(mix(toe, sh, t), 0.);
  o = mix(vec3(dot(o, Y)), o, 0.93);
  return clamp(fromAP1 * o, 0., 1.);
}
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - 0.055, step(0.0031308, c)); }
// light unsharp mask: the temporal resolve softens a touch, this gives the edges back. Clamped to
// the range of the pixels it was built from, which stops it drawing a dark rim round every cliff
// against the sky (unclamped it took 60% off the edge pixel).
vec3 sceneAt(vec2 uv){
  vec2 t = 1. / uRes;
  vec3 c = texture(tScene, uv).rgb;
  vec3 a = texture(tScene, uv + vec2(t.x, 0)).rgb, b = texture(tScene, uv - vec2(t.x, 0)).rgb;
  vec3 e = texture(tScene, uv + vec2(0, t.y)).rgb, f = texture(tScene, uv - vec2(0, t.y)).rgb;
  vec3 d = c - (a + b + e + f) * 0.25;
  // scale by local brightness so the sharpening stays proportional in HDR
  vec3 s = c + d * 0.6 / (1. + abs(d) / (c + 1e-3));
  return clamp(s, min(c, min(min(a, b), min(e, f))), max(c, max(max(a, b), max(e, f))));
}
// Depth of field for close-up shots only (Pipeline sets uDof from the camera): a small disc gather
// sized by the thin-lens circle of confusion, a few pixels at most.
float linZ(float d){ float z = d * 2. - 1.; return uProj[3][2] / (z * uProj[2][3] - uProj[2][2]); }
vec3 dof(vec3 c, vec2 uv){
  float z = -linZ(texture(tDepth, uv).r);
  float coc = min(abs(1. / uFocus - 1. / max(z, 0.1)) * 100. * uDof, 3.);
  if (coc < 0.5) return c;
  vec3 acc = c; float ws = 1.;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 2.39996 + uTime * 7.1, r = sqrt((float(i) + 0.5) / 8.) * coc;
    vec2 q = uv + vec2(cos(a), sin(a)) * r / uRes;
    // nearer things don't bleed into what's behind them in focus
    float zq = -linZ(texture(tDepth, q).r), w = zq < z - 1. && abs(1. / uFocus - 1. / max(zq, 0.1)) * 100. * uDof < 0.5 ? 0. : 1.;
    acc += texture(tScene, q).rgb * w; ws += w;
  }
  return acc / ws;
}
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
  if (uDof > 0.) col = dof(col, uv);
  // a touch of lateral chromatic aberration toward the frame's edges, as a real lens has
  vec2 qc = uv - 0.5;
  float ca = dot(qc, qc) * 0.0035;
  col.r += texture(tScene, 0.5 + qc * (1. + ca)).r - texture(tScene, uv).r;
  col.b += texture(tScene, 0.5 + qc * (1. - ca)).b - texture(tScene, uv).b;
  col = max(col, 0.);
  // Local exposure, as UE5 has it: lift what sits in a darker neighbourhood than the frame as a whole
  // and pull down what sits in a brighter one, so shaded cliffs stay readable next to sky and snow.
  // It backs off where a pixel doesn't belong to its neighbourhood (a silhouette against the sky),
  // which is what keeps the coarse neighbourhood from drawing halos.
  if (uLocalShadow + uLocalHigh > 0.) {
    float ll = texture(tLum, uv).r, lp = log2(max(dot(col, vec3(0.2126, 0.7152, 0.0722)), 1e-6));
    float d = ll - uLumAvg, w = exp(-(lp - ll) * (lp - ll) * 0.5);
    col *= exp2(-clamp(d, -4., 4.) * (d < 0. ? uLocalShadow : uLocalHigh) * w);
  }
  // Bloom, energy conserving and with no threshold, the way UE does it: the upsampled chain is the
  // sum of every level, so dividing by their count gives the average blur, and a few percent of the
  // pixel trades for it. The old mix plus an added share came to over half the blurred image laid on
  // top, which read as haze rather than glow.
  vec3 bloom = texture(tBloom, uv).rgb / uLevels;
  col = mix(col, bloom, 0.05 * uBloom);
  col *= uExposure;
  // split-tone before the curve: tint the shadows, warm or cool the highlights
  float L = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col *= mix(vec3(1.), uHighTint, smoothstep(0.05, 1.2, L));
  col += uShadowTint * (1. - smoothstep(0.0, 0.35, L)) * 0.6;
  // contrast in log space around 18% grey before the curve, as UE grades: it steepens the midtones
  // without clipping the shadows (linear contrast after the curve crushed everything under 5% to black)
  col = 0.18 * exp2(log2(max(col, vec3(1e-6)) / 0.18) * uCon);
  // the scene's exposure was set up against the fitted ACES curve, which puts 18% grey out at 0.11;
  // UE's puts it at 0.18. Scaling in by 0.72 keeps each hour's brightness and takes UE's shape.
  col = filmUE(col * 0.72);
  float l2 = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(l2), col, uSat), 0.);
  // vignette
  vec2 q = vUv - 0.5;
  col *= 1. - uVignette * dot(q, q) * 1.6;
  col = toSRGB(col);
  // light film grain, strongest in the mid-tones and gone in the highlights; it changes every frame
  // and comes after the temporal pass, so nothing tries to average it away
  float gl = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col += (hash(vUv * uRes + fract(uTime * 7.3) * 91.) - 0.5) * 0.016 * gl * (1. - gl) * 4. * uGrain;
  col = mix(col, uFadeColor, uFade);
  // dither the 8-bit output so gradients don't band
  col += (hash(vUv * uRes + fract(uTime * 13.) * 100.) - 0.5) / 255.;
  gl_FragColor = vec4(col, 1.);
}
`;

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    // seven levels: the widest is 1/128 of the frame, for a soft wide skirt around the sun
    this.levels = 7;
    this.down = fsMaterial(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 } });
    this.up = fsMaterial(UP, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 } }, { blending: THREE.AdditiveBlending });
    this.comp = fsMaterial(COMPOSITE, {
      tScene: { value: null }, tBloom: { value: null }, uRes: { value: new THREE.Vector2() },
      uExposure: { value: 1 }, uBloom: { value: 1 }, uLevels: { value: 7 }, uDof: { value: 0 }, uFocus: { value: 50 }, uGrain: { value: 1 },
      tDepth: { value: null }, uProj: { value: new THREE.Matrix4() }, uTime: { value: 0 }, uSat: { value: 1 }, uCon: { value: 1 },
      uVignette: { value: 0.32 }, uFade: { value: 0 }, uFadeColor: { value: new THREE.Color(0.75, 0.78, 0.84) },
      uShadowTint: { value: new THREE.Vector3() }, uHighTint: { value: new THREE.Vector3(1, 1, 1) },
      uHeat: { value: [new THREE.Vector4(), new THREE.Vector4()] }, uHeatUp: { value: [new THREE.Vector2(0, 1), new THREE.Vector2(0, 1)] },
      tLum: { value: null }, uLumAvg: { value: 0 }, uLocalShadow: { value: 0.25 }, uLocalHigh: { value: 0.2 },
    });
    this.lumMat = fsMaterial(LUM, { tSrc: { value: null }, uCell: { value: new THREE.Vector2(1 / 64, 1 / 36) } });
    this.lumRT = makeRT(64, 36);
    this.comp.uniforms.tLum.value = this.lumRT.texture;
    this.reader = new AsyncReader(renderer, this.lumRT);
    // mean log2 luminance of the middle 80% of the frame, once the first read lands
    this.lumAvg = null;
    this.chain = [];
  }
  setSize(w, h) {
    for (const t of this.chain) t.dispose();
    this.chain = [];
    let cw = w, ch = h;
    for (let i = 0; i < this.levels; i++) {
      cw = Math.max(1, Math.floor(cw / 2)); ch = Math.max(1, Math.floor(ch / 2));
      this.chain.push(makeRT(cw, ch));
    }
    this.w = w; this.h = h;
  }
  render(src, look, time) {
    const r = this.renderer;
    // luminance for exposure: the histogram ignores the darkest and brightest tenth, as UE's does
    this.lumMat.uniforms.tSrc.value = src;
    renderFS(r, this.lumMat, this.lumRT);
    if (this.reader.poll()) {
      const b = this.reader.buf, v = new Float32Array(64 * 36);
      for (let i = 0; i < v.length; i++) v[i] = b[i * 4];
      v.sort();
      let m = 0, n = 0;
      for (let i = Math.floor(v.length * 0.1); i < Math.ceil(v.length * 0.9); i++) { m += v[i]; n++; }
      this.lumAvg = m / n;
    }
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
    renderFS(r, this.comp, null);
  }
}
