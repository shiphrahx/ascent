// GPU particle systems, all animated in the vertex shader from per-instance seeds:
// snowfall, diamond dust, dust motes that only show inside sunbeams, chimney smoke following
// the wind, dust lifted off ridges by gusts, light pillars over the lamps on cold nights,
// and a small CPU pool for breath puffs from the crew and the horses.
import * as THREE from 'three';
import { U } from '../core/shared.js';
import { VCOMMON, WIND } from '../glsl/common.js';
import { mulberry32 } from '../core/noise.js';

const QUAD = new THREE.PlaneGeometry(1, 1);

const HEAD = /* glsl */`
${VCOMMON}
${WIND}
attribute vec4 aP;   // per-instance data, meaning per system
attribute vec4 aQ;
varying vec2 vUv;
varying float vA;
varying vec3 vC;
vec3 camRight(){ return vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); }
vec3 camUp(){ return vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]); }
vec3 lightAt(vec3 p){
  float sh = keyHorizon(p) * terrainShadow(p) * cascadeShadowFast(p) * cloudShadow(p);
  return uKeyColor * sh + ambCube(vec3(0, 1, 0));
}
`;

const VERTS = {
  snow: `
uniform float uBox, uAmt;
void main(){
  float seed = aP.w;
  vec3 base = aP.xyz * uBox;
  float t = uTime;
  vec3 drift = vec3(uWindDir.x, 0., uWindDir.y) * (2.5 + 5.5 * uWindStrength) * t + vec3(0., -1.1 - seed * 0.6, 0.) * t;
  vec3 swirl = vec3(sin(t * 1.3 + seed * 40.), sin(t * 0.9 + seed * 17.) * 0.4, cos(t * 1.1 + seed * 23.)) * (0.6 + uWindStrength * 0.5);
  vec3 p = base + drift + swirl;
  vec3 c = cameraPosition;
  p = c + mod(p - c + uBox * 0.5, uBox) - uBox * 0.5;
  float d = length(p - c);
  float vis = step(seed, uAmt) * smoothstep(uBox * 0.5, uBox * 0.3, d) * smoothstep(0.4, 1.5, d);
  float sz = (0.07 + 0.09 * aQ.x) * vis;
  // stretch along apparent motion for a touch of streak
  vec3 vel = vec3(uWindDir.x, 0., uWindDir.y) * (2.5 + 5.5 * uWindStrength) + vec3(0., -1.4, 0.);
  vec3 r = camRight(), u = camUp();
  vec3 sv = normalize(vel - dot(vel, normalize(c - p)) * normalize(c - p) + 1e-4);
  vec3 wp = p + r * position.x * sz + sv * position.y * sz * (1.1 + 0.35 * uWindStrength);
  vUv = uv; vA = vis;
  vC = lightAt(p) * 1.1 + vec3(0.03);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
}`,
  glitter: `
uniform float uBox, uAmt;
void main(){
  float seed = aP.w;
  vec3 base = aP.xyz * uBox;
  float t = uTime;
  vec3 p = base + vec3(uWindDir.x, 0., uWindDir.y) * t * 0.8 + vec3(sin(t * 0.3 + seed * 30.), -0.12 * t, cos(t * 0.25 + seed * 12.)) * 1.5;
  vec3 c = cameraPosition;
  p = c + mod(p - c + uBox * 0.5, uBox) - uBox * 0.5;
  // each crystal is a tiny mirror: it flashes when its facet bisects light and eye
  vec3 facet = normalize(vec3(sin(seed * 91. + t * 2.1), cos(seed * 37. + t * 1.7), sin(seed * 53. - t * 1.9)));
  vec3 V = normalize(c - p);
  float flash = pow(max(dot(facet, normalize(uKeyDir + V)), 0.), 220.);
  float d = length(p - c);
  float vis = step(seed, uAmt) * smoothstep(uBox * 0.5, uBox * 0.2, d) * smoothstep(0.5, 2., d);
  float sh = keyHorizon(p) * terrainShadow(p) * cascadeShadowFast(p);
  float sz = 0.03 * vis * (1. + 2.5 * flash);
  vec3 wp = p + (camRight() * position.x + camUp() * position.y) * sz;
  vUv = uv; vA = vis;
  vC = uKeyColor * (flash * 60. * sh + 0.06) + ambCube(vec3(0,1,0)) * 0.1;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
}`,
  motes: `
uniform float uBox, uAmt;
void main(){
  float seed = aP.w;
  vec3 base = aP.xyz * uBox;
  float t = uTime;
  vec3 p = base + vec3(sin(t * 0.21 + seed * 30.), sin(t * 0.17 + seed * 11.) * 0.6, cos(t * 0.19 + seed * 7.)) * 1.2 + vec3(uWindDir.x, 0.05, uWindDir.y) * t * 0.3;
  vec3 c = cameraPosition;
  p = c + mod(p - c + uBox * 0.5, uBox) - uBox * 0.5;
  float d = length(p - c);
  float lit = keyHorizon(p) * terrainShadow(p) * cascadeShadowFast(p) * cloudShadow(p);
  float fwd = 0.3 + 2.5 * pow(max(dot(normalize(p - c), uKeyDir), 0.), 6.);
  float vis = step(seed, uAmt) * lit * smoothstep(uBox * 0.5, uBox * 0.25, d) * smoothstep(0.3, 1.2, d);
  float sz = 0.02 * vis;
  vec3 wp = p + (camRight() * position.x + camUp() * position.y) * sz;
  vUv = uv; vA = vis;
  vC = uKeyColor * fwd * 1.8;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
}`,
  smoke: `
uniform float uAmt, uLife;
void main(){
  // aP.xyz emitter, aP.w phase; aQ.x puff index fraction, aQ.y size scale
  float life = uLife;
  float age = fract(uTime / life + aP.w + aQ.x) * life;
  float k = age / life;
  vec3 e = aP.xyz;
  vec2 w = windAt(e.xz);
  float rise = 1.6 * age / (1. + age * 0.12);
  vec3 p = e + vec3(w.x, 0., w.y) * age * 0.85 + vec3(0., rise, 0.);
  p += vec3(sin(age * 0.9 + aP.w * 30.), 0., cos(age * 0.7 + aP.w * 20.)) * age * 0.18;
  float sz = (0.5 + age * 0.55) * aQ.y;
  vec3 wp = p + (camRight() * position.x + camUp() * position.y) * sz;
  vUv = uv;
  vA = smoothstep(0., 0.08, k) * (1. - smoothstep(0.45, 1., k)) * uAmt * 0.55;
  vC = (uKeyColor * keyHorizon(p) * terrainShadow(p) * 0.55 + ambCube(vec3(0,1,0)) * 1.1) * vec3(0.82, 0.82, 0.86);
  vC = applyHaze(vC, p);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
}`,
  dust: `
uniform float uAmt;
void main(){
  float life = 6.;
  float age = fract(uTime / life + aP.w + aQ.x) * life;
  float k = age / life;
  vec3 e = aP.xyz;
  float g = gustAt(e.xz);
  vec2 w = windAt(e.xz);
  vec3 p = e + vec3(w.x, 0., w.y) * age * 1.4 + vec3(0., age * 0.5 + sin(age * 2. + aP.w * 9.) * 0.3, 0.);
  float sz = (0.8 + age * 1.1) * aQ.y;
  vec3 wp = p + (camRight() * position.x + camUp() * position.y) * sz;
  vUv = uv;
  vA = smoothstep(0.55, 0.85, g) * smoothstep(0., 0.15, k) * (1. - k) * uAmt * 0.32;
  vC = (uKeyColor * 0.6 * terrainShadow(p) + ambCube(vec3(0,1,0))) * vec3(0.78, 0.66, 0.5);
  vC = applyHaze(vC, p);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
}`,
  pillar: `
uniform float uAmt;
float d0(vec3 e){ return length(cameraPosition - e) * 0.006; }
void main(){
  vec3 e = aP.xyz;
  // vertical billboard: faces the camera around the y axis
  vec3 toC = cameraPosition - e; toC.y = 0.; toC = normalize(toC);
  vec3 side = vec3(toC.z, 0., -toC.x);
  float h = 34. + aP.w * 26.;
  float wd = 5. + d0(e) * 2.;
  vec3 wp = e + side * position.x * wd + vec3(0., (position.y + 0.5) * h - 1., 0.);
  vUv = uv;
  float d = length(cameraPosition - e);
  vA = uAmt * smoothstep(60., 250., d) * (0.7 + 0.3 * sin(uTime * 0.7 + aP.w * 20.));
  vC = vec3(1.0, 0.62, 0.32) * 0.9;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
}`,
  breath: `
void main(){
  // aP.xyz world position, aP.w age 0..1; aQ.x size
  float k = aP.w;
  float sz = (0.06 + k * 0.32) * aQ.x;
  vec3 wp = aP.xyz + (camRight() * position.x + camUp() * position.y) * sz;
  vUv = uv;
  vA = (1. - k) * smoothstep(0., 0.1, k) * 0.35 * step(0.001, aQ.x);
  vC = uKeyColor * 0.5 * keyHorizon(aP.xyz) + ambCube(vec3(0,1,0)) * 1.2;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
}`,
};

const FRAG = /* glsl */`
varying vec2 vUv;
varying float vA;
varying vec3 vC;
uniform float uSoft, uAdd;
void main(){
  vec2 q = vUv - 0.5;
  float r = length(q) * 2.;
  float a;
  if (uSoft > 1.5) {
    // light pillar: bright core fading up, soft sides
    a = exp(-q.x * q.x * 18.) * pow(1. - vUv.y, 2.2) * smoothstep(0., 0.12, vUv.y);
  } else if (uSoft > 0.5) {
    // smoke puff: lumpy edges
    a = smoothstep(1., 0.15, r) * (0.75 + 0.25 * sin(vUv.x * 9. + vUv.y * 7.));
  } else a = smoothstep(1., 0.2, r);
  a *= vA;
  if (a < 0.002) discard;
  gl_FragColor = uAdd > 0.5 ? vec4(vC * a, 1.) : vec4(vC * a, a);
}
`;

function system(kind, n, fill, opts = {}) {
  const g = new THREE.InstancedBufferGeometry();
  g.index = QUAD.index; g.attributes.position = QUAD.attributes.position; g.attributes.uv = QUAD.attributes.uv;
  const P = new Float32Array(n * 4), Q = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) fill(i, P, Q);
  const aP = new THREE.InstancedBufferAttribute(P, 4), aQ = new THREE.InstancedBufferAttribute(Q, 4);
  if (opts.dynamic) { aP.setUsage(THREE.DynamicDrawUsage); aQ.setUsage(THREE.DynamicDrawUsage); }
  g.setAttribute('aP', aP); g.setAttribute('aQ', aQ);
  g.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, U, { uBox: { value: opts.box || 40 }, uAmt: { value: 0 }, uLife: { value: opts.life || 14 }, uSoft: { value: opts.soft || 0 }, uAdd: { value: opts.add ? 1 : 0 } }),
    vertexShader: HEAD + VERTS[kind], fragmentShader: FRAG,
    transparent: true, depthWrite: false,
    blending: opts.add ? THREE.AdditiveBlending : THREE.CustomBlending,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false; m.layers.set(4); m.renderOrder = opts.order || 5;
  return { mesh: m, mat, aP, aQ, P, Q };
}

export class Particles {
  constructor(scene, data, village) {
    const rng = mulberry32(5150);
    this.snow = system('snow', 26000, (i, P, Q) => { P.set([rng(), rng(), rng(), rng()], i * 4); Q.set([rng(), 0, 0, 0], i * 4); }, { box: 60, order: 6 });
    this.glitter = system('glitter', 2500, (i, P, Q) => { P.set([rng(), rng(), rng(), rng()], i * 4); }, { box: 36, add: true, order: 7 });
    this.motes = system('motes', 2500, (i, P, Q) => { P.set([rng(), rng(), rng(), rng()], i * 4); }, { box: 26, add: true, order: 7 });
    // chimney smoke: 18 puffs per chimney
    const ch = village.chimneys;
    const per = 18;
    this.smoke = system('smoke', ch.length * per, (i, P, Q) => {
      const c = ch[Math.floor(i / per)], ph = (Math.floor(i / per) * 0.137) % 1;
      P.set([c.x, c.y, c.z, ph], i * 4); Q.set([(i % per) / per, 0.8 + rng() * 0.6, 0, 0], i * 4);
    }, { soft: 1, life: 16, order: 4 });
    // dust lifts off exposed ridges and plateau edges
    const ridges = [];
    for (let k = 0; k < 4000 && ridges.length < 160; k++) {
      const x = -2400 + rng() * 4800, z = -1200 + rng() * 2400;
      const h = data.height(x, z);
      let peak = true;
      for (let a = 0; a < 6 && peak; a++) if (data.height(x + Math.cos(a) * 25, z + Math.sin(a) * 25) > h - 1) peak = false;
      if (peak) ridges.push(new THREE.Vector3(x, h + 0.5, z));
    }
    this.dust = system('dust', ridges.length * 12, (i, P, Q) => {
      const r = ridges[Math.floor(i / 12)];
      P.set([r.x, r.y, r.z, (Math.floor(i / 12) * 0.31) % 1], i * 4); Q.set([(i % 12) / 12, 0.7 + rng() * 0.8, 0, 0], i * 4);
    }, { soft: 1, order: 4 });
    this.pillars = system('pillar', village.lamps.length, (i, P, Q) => { const l = village.lamps[i]; P.set([l.x, l.y, l.z, rng()], i * 4); }, { soft: 2, add: true, order: 8 });
    // breath pool
    this.breathN = 260;
    this.breath = system('breath', this.breathN, () => {}, { dynamic: true, order: 6 });
    this.pool = Array.from({ length: this.breathN }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), age: 1, life: 1, size: 0 }));
    this.next = 0;
    for (const s of [this.snow, this.glitter, this.motes, this.smoke, this.dust, this.pillars, this.breath]) scene.add(s.mesh);
  }
  puff(pos, vel, size = 1) {
    const b = this.pool[this.next]; this.next = (this.next + 1) % this.breathN;
    b.p.copy(pos); b.v.copy(vel); b.age = 0; b.life = 1.8 + Math.random() * 0.8; b.size = size;
  }
  update(dt, st, wind) {
    const cold = Math.max(0.35, 1 - Math.max(0, st.sunElev) * 1.6);
    this.snow.mat.uniforms.uAmt.value = Math.min(1, st.storm * 1.15);
    this.glitter.mat.uniforms.uAmt.value = st.diamondDust * (st.keyIsSun ? 1 : 0.4) * (1 - st.storm);
    this.motes.mat.uniforms.uAmt.value = (1 - st.storm) * (st.keyIsSun ? 1 : 0) * 0.8;
    this.smoke.mat.uniforms.uAmt.value = 0.55 + 0.45 * Math.max(st.night, 1 - Math.min(1, Math.max(0, st.sunElev) * 3));
    this.dust.mat.uniforms.uAmt.value = (1 - st.snow) * (1 - st.wet * 0.8) * (1 - st.storm);
    this.pillars.mat.uniforms.uAmt.value = st.pillars * st.night * 0.16;
    // breath pool
    const P = this.breath.P, Q = this.breath.Q;
    for (let i = 0; i < this.breathN; i++) {
      const b = this.pool[i];
      if (b.age < 1) {
        b.age += dt / b.life;
        b.v.multiplyScalar(1 - dt * 1.5);
        b.v.x += (wind ? wind.groundDir.x : 0) * dt * 0.6; b.v.z += (wind ? wind.groundDir.y : 0) * dt * 0.6; b.v.y += dt * 0.15;
        b.p.addScaledVector(b.v, dt);
      }
      P[i * 4] = b.p.x; P[i * 4 + 1] = b.p.y; P[i * 4 + 2] = b.p.z; P[i * 4 + 3] = Math.min(1, b.age);
      Q[i * 4] = b.age < 1 ? b.size * cold : 0;
    }
    this.breath.aP.needsUpdate = true; this.breath.aQ.needsUpdate = true;
  }
}
