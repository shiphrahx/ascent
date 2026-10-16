// Balloon envelope: natural-shape profile split into vertical gores and horizontal panels,
// fabric scalloped between load tapes, crown ring, parachute vent and a scoop skirt.
// One shader handles the hero (uniforms) and the fleet (per-instance attributes).
import * as THREE from 'three';
import { VCOMMON, COMMON } from '../glsl/common.js';
import { makeMaterial } from '../core/mat.js';

export const ENV = { NG: 20, PANELS: 14, mouthY: 0, height: 21.8, maxR: 8.7, mouthR: 2.25 };

// profile control points (r, y) from mouth to crown
const PROF = [[2.25, 0], [2.6, 0.9], [3.9, 3.0], [5.7, 5.6], [7.3, 8.4], [8.35, 11.3], [8.7, 13.7], [8.45, 16.1], [7.55, 18.2], [5.9, 19.95], [3.6, 21.15], [1.35, 21.7], [0.0, 21.8]];

function profileAt(s) {
  // catmull-rom through PROF by parameter s in [0,1]
  const n = PROF.length - 1;
  const f = s * n, i = Math.min(n - 1, Math.floor(f)), t = f - i;
  const p0 = PROF[Math.max(0, i - 1)], p1 = PROF[i], p2 = PROF[i + 1], p3 = PROF[Math.min(n, i + 2)];
  const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  return [Math.max(0, cr(p0[0], p1[0], p2[0], p3[0])), cr(p0[1], p1[1], p2[1], p3[1])];
}
export function envelopeRadiusAt(y) {
  // for collision: radius at height y above mouth
  let best = 0;
  for (let k = 0; k <= 60; k++) { const [r, yy] = profileAt(k / 60); if (Math.abs(yy - y) < 0.6) best = Math.max(best, r); }
  return best;
}

export function buildEnvelope(lod = 0) {
  const NG = ENV.NG;
  const U = lod === 0 ? 10 : lod === 1 ? 4 : 2;        // columns per gore
  const NS = lod === 0 ? 140 : lod === 1 ? 48 : 22;    // rows mouth -> crown
  const cols = NG * U;
  const pos = [], gu = [], sv = [], idx = [];
  for (let j = 0; j <= NS; j++) {
    // denser rows near the crown and mouth
    let s = j / NS;
    s = s - 0.06 * Math.sin(s * Math.PI * 2) / (Math.PI * 2) * 2;
    const [r0, y] = profileAt(s);
    for (let i = 0; i <= cols; i++) {
      const g = Math.floor(i / U) % NG, u = (i % U) / U + (i === cols ? 0 : 0);
      const uu = i === cols ? 1 : (i % U) / U;
      const gi = i === cols ? NG - 1 : g;
      const th = i / cols * Math.PI * 2;
      // fabric bulges between load tapes; most in the belly, none at the crown ring
      const bulge = 0.022 * Math.sin(Math.PI * uu) * Math.sin(Math.PI * Math.min(1, s * 1.15));
      const r = r0 * (1 + bulge);
      pos.push(Math.cos(th) * r, y, Math.sin(th) * r);
      gu.push(gi + (i === cols ? 0.9999 : uu), 0);
      sv.push(s);
    }
  }
  const W = cols + 1;
  for (let j = 0; j < NS; j++) for (let i = 0; i < cols; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aGU', new THREE.Float32BufferAttribute(gu, 2));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(sv, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  const n = g.attributes.normal;
  for (let j = 0; j <= NS; j++) {
    const a = j * W, b = a + cols;
    const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
  }
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 11, 0), 14);
  return g;
}

// scoop skirt hanging from the mouth, flaring slightly
export function buildSkirt(lod = 0) {
  const NR = lod ? 24 : 80, NY = lod ? 3 : 10;
  const pos = [], gu = [], sv = [], idx = [];
  for (let j = 0; j <= NY; j++) {
    const v = j / NY;
    const y = -1.35 * (1 - v) + 0.05;
    for (let i = 0; i <= NR; i++) {
      const th = i / NR * Math.PI * 2;
      const r = ENV.mouthR + 0.04 + 0.32 * Math.pow(1 - v, 1.4) + 0.04 * Math.sin(th * ENV.NG);
      pos.push(Math.cos(th) * r, y, Math.sin(th) * r);
      gu.push(i / NR * ENV.NG, 1);
      sv.push(-0.06 * (1 - v));
    }
  }
  const W = NR + 1;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NR; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aGU', new THREE.Float32BufferAttribute(gu, 2));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(sv, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// crown ring: a torus at the vent edge
export function buildCrown() {
  const g = new THREE.TorusGeometry(1.32, 0.05, 6, 48);
  g.rotateX(Math.PI / 2);
  g.translate(0, 21.68, 0);
  return g;
}

export const PALETTES = [
  // linear-ish colours, 5 per palette; picked to read well backlit and night-glowing
  [[0.62, 0.05, 0.06], [0.95, 0.62, 0.10], [0.05, 0.30, 0.42], [0.92, 0.86, 0.72], [0.30, 0.04, 0.18]],   // hero: crimson, saffron, teal, cream, plum
  [[0.85, 0.20, 0.04], [0.95, 0.75, 0.18], [0.80, 0.08, 0.10], [0.98, 0.92, 0.70], [0.55, 0.10, 0.04]],
  [[0.04, 0.18, 0.55], [0.85, 0.85, 0.88], [0.80, 0.10, 0.12], [0.06, 0.45, 0.70], [0.95, 0.75, 0.15]],
  [[0.10, 0.45, 0.20], [0.95, 0.85, 0.30], [0.90, 0.40, 0.08], [0.05, 0.22, 0.12], [0.96, 0.95, 0.85]],
  [[0.55, 0.10, 0.45], [0.95, 0.45, 0.55], [0.25, 0.05, 0.35], [0.98, 0.85, 0.90], [0.90, 0.65, 0.10]],
  [[0.95, 0.80, 0.10], [0.85, 0.30, 0.05], [0.95, 0.95, 0.90], [0.60, 0.08, 0.05], [0.15, 0.10, 0.08]],
  [[0.08, 0.55, 0.60], [0.95, 0.90, 0.80], [0.95, 0.45, 0.20], [0.03, 0.25, 0.35], [0.85, 0.12, 0.20]],
  [[0.75, 0.05, 0.08], [0.98, 0.97, 0.94], [0.75, 0.05, 0.08], [0.08, 0.12, 0.40], [0.98, 0.97, 0.94]],
  [[0.30, 0.65, 0.20], [0.95, 0.88, 0.20], [0.10, 0.40, 0.75], [0.90, 0.25, 0.10], [0.60, 0.10, 0.50]],
  [[0.95, 0.55, 0.12], [0.98, 0.85, 0.45], [0.75, 0.22, 0.05], [0.45, 0.08, 0.04], [0.98, 0.95, 0.88]],
  [[0.10, 0.12, 0.40], [0.95, 0.75, 0.15], [0.95, 0.95, 0.95], [0.55, 0.05, 0.10], [0.20, 0.45, 0.80]],
  [[0.90, 0.30, 0.45], [0.98, 0.90, 0.75], [0.45, 0.70, 0.75], [0.95, 0.60, 0.30], [0.35, 0.15, 0.40]],
  [[0.85, 0.85, 0.80], [0.12, 0.30, 0.60], [0.85, 0.85, 0.80], [0.80, 0.15, 0.10], [0.95, 0.70, 0.10]],
  [[0.35, 0.05, 0.05], [0.85, 0.55, 0.10], [0.10, 0.10, 0.12], [0.90, 0.80, 0.55], [0.60, 0.20, 0.05]],
  [[0.05, 0.35, 0.30], [0.75, 0.85, 0.30], [0.95, 0.80, 0.30], [0.10, 0.25, 0.15], [0.98, 0.95, 0.85]],
  [[0.70, 0.40, 0.85], [0.30, 0.70, 0.95], [0.95, 0.90, 0.40], [0.95, 0.45, 0.45], [0.95, 0.95, 0.95]],
];

function paletteTexture() {
  const W = 8, H = PALETTES.length;
  const d = new Float32Array(W * H * 4);
  PALETTES.forEach((p, j) => p.forEach((c, i) => { const k = (j * W + i) * 4; d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 1; }));
  const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  return t;
}
export const PALETTE_TEX = paletteTexture();

const VERT = /* glsl */`
${VCOMMON}
attribute vec2 aGU;
attribute float aS;
#ifdef FLEET
attribute vec4 aBal;   // palette, pattern, burner, seed
attribute vec4 aBal2;  // deflate, unused...
varying vec4 vBal;
varying vec3 vBurnerW;
#endif
uniform float uBreath, uDent, uRipple, uBurn, uLying, uGroundY, uInflate;
uniform vec3 uDentDir;   // local-space horizontal direction the wind comes from
uniform float uSkirt;
varying vec3 vWorld, vN, vLocal;
varying vec2 vGU;
varying float vS;
#ifdef DEPTH_PASS
varying float vDepthAlpha;
#endif
void main(){
  vec3 p = position;
  vec3 n = normal;
  float s = aS;
  float t = uTime;
  float breath = uBreath, dent = uDent, ripple = uRipple, burn = uBurn;
  float lying = uLying, groundY = uGroundY, infl = uInflate;
  vec3 dentDir = uDentDir;
  float seed = 0.;
#ifdef FLEET
  vBal = aBal;
  burn = aBal.z; seed = aBal.w;
  breath = 0.006 * sin(t * 0.7 + seed * 40.) + 0.012 * burn;
  ripple = 0.05 + 0.04 * sin(t * 0.3 + seed * 9.);
  dent = 0.15 * max(0., sin(t * 0.21 + seed * 31.)) ;
  dentDir = normalize(vec3(cos(seed * 50.), 0., sin(seed * 50.)));
  lying = aBal2.x; groundY = aBal2.y; infl = aBal2.z;
#endif
  vec2 hr = p.xz;
  float rr = length(hr);
  vec3 radial = rr > 1e-4 ? vec3(p.x / rr, 0., p.z / rr) : vec3(0.);
  float th = atan(p.z, p.x);
  // breathing: the whole envelope swells a touch with each blast
  float sm = sin(3.14159 * clamp(s * 1.1, 0., 1.));
  p += n * (breath * 8.0 * sm);
  // travelling ripples across loose fabric, stronger low on the envelope
  float loose = (1. - smoothstep(0.15, 0.75, s)) * 0.8 + 0.2;
  float w1 = sin(th * 3. + s * 14. - t * 2.3 + seed) * sin(th * 2. - s * 9. + t * 1.7);
  float w2 = sin(th * 7. + s * 21. + t * 3.1 + seed * 3.);
  p += n * ripple * loose * (w1 * 0.7 + w2 * 0.3);
  // wind shear dent on the windward side
  float face = max(0., dot(radial, dentDir));
  float dm = pow(face, 3.) * smoothstep(0.1, 0.4, s) * smoothstep(0.95, 0.6, s);
  p -= radial * dent * 2.6 * dm;
  // skirt flutters
  if (s < 0.) p += radial * (0.06 * sin(th * 5. + t * 6. + seed) + 0.04 * sin(th * 11. - t * 9.)) * uSkirt * (-s / 0.06);
  // partly inflated fabric: slack folds and wrinkles
  if (infl < 0.999) {
    float wr = 1. - infl;
    p -= n * wr * (0.9 + 0.8 * sin(th * 10. + s * 25. + seed * 7.) * sin(s * 13. + th * 3.)) * sm * 2.2;
    p.y *= 1. - wr * 0.25;
  }
#ifdef FLEET
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.);
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * n);
  vBurnerW = (modelMatrix * instanceMatrix * vec4(0., -2.3, 0., 1.)).xyz;
#else
  vec4 wp = modelMatrix * vec4(p, 1.);
  vN = normalize(mat3(modelMatrix) * n);
#endif
  // envelope lying on the field: fabric settles on the ground
  if (lying > 0.01) {
    float gy = groundY + 0.15 + 0.12 * sin(p.x * 1.7 + seed * 5.) * sin(p.z * 1.3);
    wp.y = max(wp.y, gy);
  }
  vWorld = wp.xyz; vLocal = p; vGU = aGU; vS = s;
#ifdef DEPTH_PASS
  vDepthAlpha = 1.;
#endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */`
${COMMON}
uniform sampler2D uPal;
uniform float uPalette, uPattern, uBurn, uFlameI;
uniform vec3 uBurnerPos;
#ifdef FLEET
varying vec4 vBal;
varying vec3 vBurnerW;
#endif
varying vec3 vWorld, vN, vLocal;
varying vec2 vGU;
varying float vS;
vec3 pal(float p, int i){ return texelFetch(uPal, ivec2(i, int(p)), 0).rgb; }

// returns colour index 0..4 for a gore/height location
int patternIndex(float pat, float g, float u, float s){
  int gi = int(g);
  float gf = g;
  if (pat < 0.5) {
    // hero: saffron crown, chevron band, alternating gores below, plum mouth
    if (s > 0.86) return 1;
    float chev = abs(u - 0.5) * 0.10;
    if (s > 0.62 + chev && s < 0.70 + chev) return 3;
    if (s > 0.70 + chev) return (gi % 2 == 0) ? 0 : 2;
    if (s < 0.14) return 4;
    if (s > 0.55 + chev) return 1;
    return (gi % 4 == 0) ? 2 : ((gi % 2 == 0) ? 0 : 3);
  }
  if (pat < 1.5) return gi % 2 == 0 ? 0 : 1;                                   // alternating gores
  if (pat < 2.5) return int(mod(floor(s * 9.), 4.));                           // horizontal bands
  if (pat < 3.5) { float z = abs(fract(gf * 0.5) - 0.5) * 0.25; return int(mod(floor((s + z) * 7.), 3.)); } // zigzag
  if (pat < 4.5) { float dd = abs(fract(gf) - 0.5) + abs(fract(s * 10.) - 0.5); return dd < 0.5 ? (gi % 2 == 0 ? 0 : 1) : 2; } // harlequin
  if (pat < 5.5) { return s > 0.8 ? 1 : (int(mod(gf * 2., 3.)) ); }            // sunburst rays
  if (pat < 6.5) { return int(mod(gf / 4. + floor(s * 3.), 5.)); }           // patchwork quadrants
  return s > 0.5 ? (gi % 3 == 0 ? 2 : 0) : (gi % 2 == 0 ? 3 : 4);               // split
}

void main(){
  vec3 P = vWorld;
  if (P.y < uClipY) discard;
  vec3 V = normalize(cameraPosition - P);
  vec3 N = normalize(vN);
  bool inside = !gl_FrontFacing;
  float palette = uPalette, pattern = uPattern, burn = uBurn;
#ifdef FLEET
  palette = vBal.x; pattern = vBal.y; burn = vBal.z;
#endif
  float g = floor(vGU.x), u = fract(vGU.x);
  float s = vS;
  bool skirt = vGU.y > 0.5;
  int ci = patternIndex(pattern, g, u, s);
  vec3 fab = pal(palette, ci);
  if (skirt) fab = vec3(0.12, 0.11, 0.10);
  // crown parachute vent: lighter panel with its own seams
  float vent = smoothstep(0.955, 0.965, s);
  fab = mix(fab, pal(palette, 3) * 0.9, vent);

  // seams: vertical at gore edges (load tapes) and horizontal panel seams
  float goreW = 2.0 * 3.14159 * max(length(vLocal.xz), 0.5) / 20.;
  float du = min(u, 1. - u) * goreW;
  float tape = 1. - smoothstep(0.025, 0.045, du);
  float pan = fract(s * 14.);
  float dp = min(pan, 1. - pan) * 21.8 / 14.;
  float pseam = 1. - smoothstep(0.008, 0.02, dp);
  float fine = 1. - smoothstep(0.004, 0.012, abs(fract(u * 2.) - 0.5) * goreW * 0.5);
  vec3 tapeC = vec3(0.78, 0.70, 0.55);
  vec3 alb = mix(fab, tapeC, tape * 0.85);
  alb *= 1. - pseam * 0.35 - fine * 0.12;
  // tapes are raised: bend the normal across them
  vec3 tang = normalize(vec3(-vLocal.z, 0., vLocal.x));
  float side = (u < 0.5 ? 1. : -1.);
  N = normalize(N + tang * side * tape * 0.35);
  // nylon sheen and soft weave
  float weave = texture(uNoise2D, vec2(g + u, s * 20.) * vec2(0.37, 1.3)).g;
  alb *= 0.94 + 0.12 * weave;

  vec3 L = uKeyDir;
  float sh = keyShadow(P, N);
  // fabric translucency: thin gores glow when the light is behind them, seams and tapes stay dark
  float thin = (1. - tape * 0.85) * (1. - pseam * 0.6) * (skirt ? 0.15 : 1.);
  float back = sat(dot(-V, L));
  float ndl = dot(inside ? -N : N, L);
  vec3 col;
  // burner light from inside (r^2 falloff to the fabric)
#ifdef FLEET
  vec3 toB = vBurnerW - P;
#else
  vec3 toB = uBurnerPos - P;
#endif
  float bd = length(toB);
  vec3 flame = vec3(1.0, 0.55, 0.22) * burn * uFlameI;
  float bfall = 1. / (1. + bd * bd * 0.012);
  if (!inside) {
    Surf sf; sf.albedo = alb; sf.N = N; sf.rough = 0.55; sf.spec = 0.35; sf.ao = 1.; sf.wrap = 0.25; sf.sss = 0.;
    col = shadeSurf(sf, P, V, sh);
    // sunlight passing through two layers of fabric toward the viewer
    float through = sat(-ndl) * mix(0.25, 1., back * back) ;
    col += uKeyColor * fab * fab * through * thin * 1.25 * keyHorizon(P) * cloudShadow(P);
    // glow of the burner through the fabric
    col += flame * fab * thin * bfall * 1.6 * (0.4 + 0.6 * (1. - s));
  } else {
    // interior: every sunlit panel glows in its own colour; seams draw dark lines across the dome
    float sunlitPanel = sat(ndl * 1.2 + 0.25);
    vec3 Lin = uKeyColor * fab * thin * sunlitPanel * 1.1 * keyHorizon(P) * cloudShadow(P);
    Lin += ambCube(-N) * fab * thin * 0.9;
    Lin += flame * (alb * 0.9 + fab * thin * 0.4) * bfall * 2.2;
    col = Lin;
  }
  col = applyHaze(col, P);
  gl_FragColor = vec4(col, 1.);
}
`;

export function envelopeMaterial(fleet) {
  return makeMaterial({
    vertex: VERT, fragment: FRAG,
    defines: fleet ? { FLEET: 1 } : {},
    side: THREE.DoubleSide,
    uniforms: {
      uPal: { value: PALETTE_TEX }, uPalette: { value: 0 }, uPattern: { value: 0 }, uBurn: { value: 0 }, uFlameI: { value: 6 },
      uBurnerPos: { value: new THREE.Vector3() }, uBreath: { value: 0 }, uDent: { value: 0 }, uRipple: { value: 0.04 },
      uDentDir: { value: new THREE.Vector3(1, 0, 0) }, uSkirt: { value: 1 }, uLying: { value: 0 }, uGroundY: { value: 0 }, uInflate: { value: 1 },
    },
  });
}
