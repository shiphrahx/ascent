// "Shadow height" maps: for each ground texel, the height above which the key light is visible, and
// how far away the ridge that decides it is. One texture lookup then gives terrain-scale shadows, with
// a penumbra that widens with distance to the occluder, to every material and the volumetrics.
//
// Built by doubling along the sun's direction: pass k folds in the result from 2^k texels up-sun, so
// after n passes every texel has seen every heightmap texel along 2^n of them. The old single march
// grew its step by 10% a step, skipped thin ridges and jittered as the sun moved.
import * as THREE from 'three';
import { U, G, WORLD } from '../core/shared.js';
import { fsMaterial, renderFS, makeRT } from '../core/fsq.js';
import { DECL, NOISE, TERRAIN } from '../glsl/common.js';

const HEAD = /* glsl */`
${DECL}
${NOISE}
${TERRAIN}
varying vec2 vUv;
uniform vec4 uBounds;
uniform vec2 uRes;
vec2 sunDir(){ vec3 L = uKeyDir; return L.xz / max(length(L.xz), 1e-4); }
float sunTan(){ vec3 L = uKeyDir; return L.y / max(length(L.xz), 1e-4); }
`;
// the first sample, t0 up-sun: nearer than that the heightmap is too coarse to judge a slope by
const SEED = HEAD + /* glsl */`
uniform float uT0;
void main(){
  vec2 xz = uBounds.xy + vUv * uBounds.zw;
  gl_FragColor = vec4(heightAt(xz + sunDir() * uT0) - uT0 * sunTan(), uT0, 0., 1.);
}
`;
const STEP = HEAD + /* glsl */`
uniform highp sampler2D tPrev, tOuter, tOld;
uniform vec4 uOuterB;
uniform float uS, uUseOuter, uLast;
// bilinear by hand: float targets can't be relied on to filter
vec2 fetch(vec2 uv){
  vec2 p = uv * uRes - 0.5, f = fract(p);
  ivec2 i = ivec2(floor(p)), mx = ivec2(uRes) - 1;
  vec2 a = texelFetch(tPrev, clamp(i, ivec2(0), mx), 0).rg, b = texelFetch(tPrev, clamp(i + ivec2(1, 0), ivec2(0), mx), 0).rg;
  vec2 c = texelFetch(tPrev, clamp(i + ivec2(0, 1), ivec2(0), mx), 0).rg, d = texelFetch(tPrev, clamp(i + ivec2(1, 1), ivec2(0), mx), 0).rg;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main(){
  vec2 xz = uBounds.xy + vUv * uBounds.zw;
  vec2 here = texelFetch(tPrev, ivec2(gl_FragCoord.xy), 0).rg;
  vec2 q = xz + sunDir() * uS, uv = (q - uBounds.xy) / uBounds.zw;
  vec2 far = vec2(-1e4, 0.);
  if (all(greaterThanEqual(uv, vec2(0.))) && all(lessThanEqual(uv, vec2(1.)))) far = fetch(uv);
  // up-sun of the core, the outer map already holds the answer for the rest of the ray
  else if (uUseOuter > 0.5) far = texture(tOuter, (q - uOuterB.xy) / uOuterB.zw).rg;
  float h = far.x - uS * sunTan();
  vec2 res = h > here.x ? vec2(h, far.y + uS) : here;
  // the finished map keeps the previous one alongside, for the blend on tiers that rebuild slowly
  gl_FragColor = vec4(res, uLast > 0.5 ? texelFetch(tOld, ivec2(gl_FragCoord.xy), 0).rg : vec2(0.));
}
`;

export class TerrainShadow {
  constructor(renderer, tier = 'high') {
    this.renderer = renderer;
    this.tier = tier;
    const C = WORLD.core, O = WORLD.outer, lite = tier === 'lite';
    this.L = { value: new THREE.Vector3(0, 1, 0) };
    const f32 = { format: THREE.RGFormat, type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
    const f16 = { format: THREE.RGBAFormat, type: THREE.HalfFloatType };
    // core at the heightmap's own 2.5 m on high (5 m below: 2.5 m cost the 890M 1.8 ms), outer at 160 m
    const cw = tier === 'high' ? 2048 : 1024, ch = cw / 2;
    const mk = (b, w, h, t0, out) => {
      const step = b.sizeX / w;
      // enough doublings to reach 10 km in the core and 40 km outside it
      const n = Math.ceil(Math.log2((out ? 40000 : 10000) / step));
      // the light is held for the length of a rebuild, which on slow tiers spans several frames
      const u = Object.assign({}, U, { uKeyDir: this.L, uBounds: { value: new THREE.Vector4(b.minX, b.minZ, b.sizeX, b.sizeZ) }, uRes: { value: new THREE.Vector2(w, h) } });
      return {
        w, h, step, n,
        seed: fsMaterial(SEED, Object.assign({}, u, { uT0: { value: t0 } })),
        pass: fsMaterial(STEP, Object.assign({}, u, { tPrev: { value: null }, tOuter: { value: null }, tOld: { value: null }, uLast: { value: 0 }, uOuterB: { value: new THREE.Vector4(O.minX, O.minZ, O.sizeX, O.sizeZ) }, uS: { value: 0 }, uUseOuter: { value: out ? 0 : 1 } })),
        pp: [makeRT(w, h, f32), makeRT(w, h, f32)],
        // finals in turn: each is built reading the one before
        out: [makeRT(w, h, f16), makeRT(w, h, f16)], cur: 0,
      };
    };
    this.core = mk(C, cw, ch, 5, false);
    this.outer = mk(O, 512, 512, 200, true);
    this.publish();
    this.last = new THREE.Vector3(9, 9, 9);
    // how many frames one rebuild is spread over: every frame on high
    this.every = lite ? 30 : tier === 'medium' ? 3 : 1;
    this.age = 0;
  }
  publish() {
    U.uTerrShadow.value = this.core.out[this.core.cur].texture;
    U.uTerrShadowOuter.value = this.outer.out[this.outer.cur].texture;
  }
  // one map's rebuild as a list of passes, so it can be spread over frames
  steps(m) {
    const r = this.renderer, out = [];
    out.push(() => { m.cur = 1 - m.cur; renderFS(r, m.seed, m.pp[0]); m.src = 0; });
    const u = m.pass.uniforms;
    for (let k = 0; k < m.n; k++) out.push(() => {
      u.tPrev.value = m.pp[m.src].texture;
      // the outer map doesn't read itself (a bound target is a feedback loop even when unused)
      u.tOuter.value = m === this.outer ? this.core.out[this.core.cur].texture : this.outer.out[this.outer.cur].texture;
      u.tOld.value = m.out[1 - m.cur].texture;
      u.uLast.value = k === m.n - 1 ? 1 : 0;
      u.uS.value = m.step * (1 << k);
      renderFS(r, m.pass, k === m.n - 1 ? m.out[m.cur] : m.pp[1 - m.src]);
      m.src = 1 - m.src;
    });
    return out;
  }
  // Slow tiers rebuild every few frames. The whole rebuild used to land on one of them, which made
  // every third frame on the 890M miss its refresh; now each frame runs an even share of the passes,
  // and the finished map is shown (and blended toward) once the last pass is done.
  update(force) {
    // blend toward the newest map over the frames until the next one is ready, so a slow tier's
    // shadows slide instead of jumping
    this.age++;
    U.uTerrBlend.value = Math.min(1, this.age / this.every);
    if (!this.queue || !this.queue.length) {
      // only rebuild when the light has moved a little
      const L = U.uKeyDir.value;
      if (!force && L.distanceToSquared(this.last) < 1e-8) return;
      this.last.copy(L);
      this.L.value.copy(L);
      this.queue = [...this.steps(this.outer), ...this.steps(this.core)];
      this.per = force ? this.queue.length : Math.ceil(this.queue.length / this.every);
    }
    G.tag('terrShadow');
    for (let i = 0; i < this.per && this.queue.length; i++) this.queue.shift()();
    if (!this.queue.length) {
      this.publish();
      this.age = 0;
      U.uTerrBlend.value = this.every > 1 && !force ? 0 : 1;
    }
  }
}
