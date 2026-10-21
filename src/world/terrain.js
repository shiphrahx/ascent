// Terrain renderer: instanced LOD chunks displaced from the heightfield textures,
// shaded with banded tuff strata, erosion grooves, soil, snow, frost and wetness.
import * as THREE from 'three';
import { U, WORLD } from '../core/shared.js';
import { COMMON, VCOMMON, ROCK } from '../glsl/common.js';
import { makeMaterial } from '../core/mat.js';

const GRID = 64;
// Shadow-casting ground for the near slice. On high it sits on the same 2.5 m lattice as the nearest
// visible LOD, with the same diagonals, so the ground shadows itself exactly where it's drawn; a
// coarser copy self-shadowed in bands. Lower tiers trade that for a lighter grid.
const SHADOW_GRID = { high: { size: 900, step: 2.5 }, medium: { size: 1600, step: 5 }, lite: { size: 1100, step: 10 } };

function gridGeometry(n, skirts = true) {
  // (n+1)^2 grid plus a skirt ring that drops down to hide LOD cracks
  const pos = [], idx = [];
  const v = (x, z, skirt) => { pos.push(x / n, skirt, z / n); return pos.length / 3 - 1; };
  const g = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) g.push(v(i, j, 0));
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
    if ((i + j) & 1) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b);
  }
  const edge = (list) => {
    const s = list.map(k => v(pos[k * 3] * n, pos[k * 3 + 2] * n, 1));
    for (let k = 0; k < list.length - 1; k++) idx.push(list[k], s[k], list[k + 1], list[k + 1], s[k], s[k + 1]);
  };
  const top = [], bottom = [], left = [], right = [];
  for (let i = 0; i <= n; i++) { top.push(i); bottom.push(n * (n + 1) + i); left.push(i * (n + 1)); right.push(i * (n + 1) + n); }
  // the shadow grid has none: hanging past its edge over lower ground, a skirt cast a straight wall of shadow
  if (skirts) { edge(top); edge(bottom.reverse()); edge(left.reverse()); edge(right); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}

const VERT = /* glsl */`
${VCOMMON}
attribute vec4 aChunk; // originX, originZ, size, unused
varying vec3 vWorld;
varying float vSkirt;
#ifdef DEPTH_PASS
varying float vDepthAlpha;
#endif
// Near the camera the weathered relief the fragment shader bumps in becomes real geometry, so cliff
// faces get a broken silhouette and their own small shadows: the two broad octaves of tuffRelief,
// full on steep faces and a quarter on the flats (things stand on the flats, placed on the smooth
// heights). Faded by distance from the main camera, also in the shadow pass, so the shadow grid
// moves with it.
float reliefVS(vec3 P, vec3 N){
  vec3 w = pow(abs(N), vec3(4.)); w /= (w.x + w.y + w.z);
  float h = 0.;
  for (int i = 0; i < 2; i++) {
    float s = i == 0 ? 24. : 7.5, o = float(i) * 0.37;
    vec4 a = textureLod(uNoise2D, vec2(P.z, P.y * 0.45) / s + o, 0.) * w.x + textureLod(uNoise2D, P.xz / s + o, 0.) * w.y
      + textureLod(uNoise2D, vec2(P.x, P.y * 0.45) / s + o, 0.) * w.z;
    h += (a.r - 0.5 - a.b * a.b * 0.3) * s * 0.07;
  }
  return h;
}
void main(){
  vec2 xz = aChunk.xy + position.xz * aChunk.z;
  float h = heightAt(xz);
  h -= position.y * (2.0 + aChunk.z * 0.03);
  vec3 wp = vec3(xz.x, h, xz.y);
  if (uTerrDisp > 0.5) {
    float near = 1. - smoothstep(90., 150., distance(wp, uShadowEye));
    if (near > 0.) {
      vec3 n = normalAt(xz);
      wp += n * reliefVS(wp, n) * mix(0.25, 1., smoothstep(0.25, 0.65, 1. - n.y)) * near;
    }
  }
  vWorld = wp; vSkirt = position.y;
#ifdef DEPTH_PASS
  vDepthAlpha = 1.;
#endif
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FRAG = /* glsl */`
${COMMON}
${ROCK}
varying vec3 vWorld;
varying float vSkirt;

void main(){
  vec3 P = vWorld;
  if (P.y < uClipY) discard;
  vec3 V = normalize(cameraPosition - P);
  float dist = length(cameraPosition - P);
  vec3 N = normalAt(P.xz);
  vec4 at = attrAt(P.xz);
  float rose = at.r, soilT = at.g, water = at.b;
  // classify by the steeper of the smooth normal and the actual triangle, so soil never paints a cliff
  vec3 Ng = normalize(cross(dFdx(P), dFdy(P)));
  if (Ng.y < 0.) Ng = -Ng;
  float slope = 1. - min(N.y, mix(N.y, Ng.y, 0.7));

  // erosion grooves still drive the crevice darkening below
  float detailFade = 1. - smoothstep(600., 2500., dist);
  vec3 tang = normalize(vec3(-N.z, 0., N.x) + 1e-4);
  float along = dot(P.xz, tang.xz);
  float gro = texture(uNoise2D, vec2(along / 9., P.y / 160.)).r * 0.6 + texture(uNoise2D, vec2(along / 3.1, P.y / 60.)).g * 0.4;
  float steep = smoothstep(0.25, 0.65, slope);
  vec4 nz = texture(uNoise2D, P.xz / 18.);
  vec4 nz2 = texture(uNoise2D, P.xz / 4.3);
  // mid-scale weathered relief; the photo textures carry everything below a couple of metres
  float px = length(fwidth(P));
  vec3 dPx = dFdx(P), dPy = dFdy(P);
  float cav;
  float relief = tuffRelief(P, N, px, 2, dPx, dPy, cav);
  vec3 N0 = N;
  N = bumpNormal(N, P, relief * mix(0.22, 1., steep));
  // strata ledges catch light: tilt normal at band edges
  float b = (P.y + 6. * texture(uNoise2D, P.xz / 900.).r + 2.5 * texture(uNoise2D, P.xz / 140.).g) / 9.5;
  float ledge = smoothstep(0.0, 0.08, fract(b)) * (1. - smoothstep(0.08, 0.2, fract(b)));
  N = normalize(N + vec3(0, ledge * 0.9 * steep * detailFade, 0));

  // beyond the core the plateau is farmed too: the same patchwork, made up procedurally
  float farM = 1. - coreMask(P.xz);
  vec2 fpP = vec2(dot(P.xz, vec2(0.95, 0.31)) / 130., dot(P.xz, vec2(-0.31, 0.95)) / 85.);
  if (farM > 0.) {
    vec2 fpO = vec2(dot(P.xz, vec2(0.95, 0.31)) / 170., dot(P.xz, vec2(-0.31, 0.95)) / 110.);
    float hs = hash12(floor(fpO) + 17.);
    float sT = hs < 0.32 ? 0.72 : hs < 0.62 ? 0.42 : hs < 0.8 ? 0.36 : 0.15;
    float fieldsHere = farM * (1. - smoothstep(350., 700., P.y));
    soilT = mix(soilT, sT, fieldsHere);
    at.a = mix(at.a, fract(hs * 7.3), fieldsHere);
    fpP = mix(fpP, fpO, farM);
  }
  // --- albedo ---
  // Every photo texture is used as detail around the hand-picked palette: divided by its own mean,
  // half its hue kept. The strata and field colours stay; the grain, cracks and pebbles are real.
  float var = nz.r;
  float rough = 0.85, spec = 0.12, ao = 1.0;
  // soils on gentle ground
  float flat_ = smoothstep(0.32, 0.12, slope);
  float soilAmt = flat_ * smoothstep(0.1, 0.25, soilT + 0.12 * (1. - slope));
  // plateau tops get patchy dry grass over pale tuff
  soilAmt = max(soilAmt, flat_ * smoothstep(0.55, 0.75, texture(uNoise2D, P.xz / 70.).r) * 0.85);
  // a texture that contributes nothing isn't sampled; this stands in for it (its own mean, flat, mid height)
  MatS none; none.alb = vec3(0.); none.dn = vec3(0.); none.h = 0.5;
  MatS rk = none; rk.alb = vec3(0.44, 0.26, 0.125);
  if (soilAmt < 0.999) rk = matBiplanar(L_TUFF, P, N0, 4.2, dPx, dPy);
  vec3 rkD = rk.alb / vec3(0.44, 0.26, 0.125);
  vec3 rock = tuffColor(P.y, rose, P.xz, var) * mix(vec3(1), mix(vec3(luma(rkD)), rkD, 0.4), 0.65);
  vec3 alb = rock;
  vec3 groundDn = vec3(0);
  float groundH = 0.5;
  if (soilAmt > 0.001) {
    float rep = texture(uNoise2D, P.xz / 23.).r;
    float wGrass = smoothstep(0.3, 0.42, soilT) * (1. - smoothstep(0.62, 0.7, soilT));
    float wPlow = smoothstep(0.66, 0.72, soilT) * (1. - smoothstep(0.9, 0.98, soilT));
    float wVine = smoothstep(0.92, 0.98, soilT);
    MatS st = none, so = none, pl = none;
    st.alb = vec3(0.22, 0.18, 0.105); so.alb = vec3(0.27, 0.15, 0.07); pl.alb = vec3(0.10, 0.06, 0.03);
    if (wGrass * (1. - wPlow) * (1. - wVine) > 0.002) st = matTop(L_STEPPE, P, 3.4, dPx, dPy, rep);
    if ((1. - wGrass) * (1. - wPlow) * (1. - wVine) + wVine > 0.002) so = matTop(L_SOIL, P, 2.6, dPx, dPy, rep);
    if (wPlow * (1. - wVine) > 0.002) pl = matTop(L_PLOWED, P, 3.0, dPx, dPy, rep);
    vec3 stD = st.alb / vec3(0.22, 0.18, 0.105), soD = so.alb / vec3(0.27, 0.15, 0.07), plD = pl.alb / vec3(0.10, 0.06, 0.03);
    vec3 dryGrass = mix(vec3(0.52, 0.47, 0.30), vec3(0.42, 0.40, 0.26), nz2.g) * mix(vec3(luma(stD)), stD, 0.6);
    vec3 tuffSoil = mix(vec3(0.60, 0.51, 0.39), vec3(0.50, 0.41, 0.31), nz.g) * mix(vec3(luma(soD)), soD, 0.35);
    vec3 plowed = mix(vec3(0.42, 0.30, 0.22), vec3(0.50, 0.38, 0.27), nz2.r) * mix(vec3(luma(plD)), plD, 0.5);
    // furrows in plowed fields, faded out before they're too fine to resolve (that was the checkerboard)
    float ang = at.a * 3.14159;
    vec2 fd = vec2(cos(ang), sin(ang));
    float fph = dot(P.xz, fd) * 7.8;
    float fFade = 1. - smoothstep(0.6, 1.6, fwidth(fph));
    float furrow = 0.5 + 0.5 * sin(fph);
    plowed *= 1. + (0.16 * furrow - 0.08) * fFade;
    vec3 plDn = pl.dn + vec3(fd.x, 0., fd.y) * cos(fph) * 0.3 * fFade;
    vec3 vineSoil = mix(vec3(0.58, 0.42, 0.30), vec3(0.66, 0.50, 0.36), nz.g) * mix(vec3(luma(soD)), soD, 0.35);
    vec3 soil = tuffSoil;
    soil = mix(soil, dryGrass, wGrass);
    soil = mix(soil, plowed, wPlow);
    soil = mix(soil, vineSoil, wVine);
    groundDn = mix(mix(mix(so.dn, st.dn, wGrass), plDn, wPlow), so.dn, wVine);
    groundH = mix(mix(mix(so.h, st.h, wGrass), pl.h, wPlow), so.h, wVine);
    // field margins: darker strips of stubble and stones along every plot edge
    vec2 ff = abs(fract(fpP) - 0.5);
    float edgeW = 0.012 + dist * 0.000012;
    float margin = (1. - smoothstep(0.5 - edgeW * 1.6, 0.5 - edgeW * 0.6, max(ff.x, ff.y))) ;
    soil *= 1. - 0.22 * (1. - margin) * smoothstep(0.3, 0.4, soilT);
    // scrubby dark cushions in patches on the uncultivated ground
    float scrub = smoothstep(0.55, 0.75, texture(uNoise2D, P.xz / 46.).g) * (1. - smoothstep(0.3, 0.4, soilT) * 0.7);
    soil = mix(soil, vec3(0.27, 0.26, 0.18) * (0.8 + 0.4 * nz2.r) * luma(stD), scrub * 0.55);
    // dirt tracks winding across the plateau and valley floors
    float rn = texture(uNoise2D, P.xz / 2900. + 0.21).r - 0.5;
    float rn2 = texture(uNoise2D, P.xz / 1700. + 0.63).g - 0.5;
    float rw = fwidth(rn) * 1.2 + 0.0008;
    float road = max(1. - smoothstep(rw * 0.5, rw * 1.5, abs(rn)), 1. - smoothstep(rw * 0.5, rw * 1.5, abs(rn2)) * 0.8);
    soil = mix(soil, vec3(0.70, 0.62, 0.50) * (0.9 + 0.2 * nz2.g) * mix(1., luma(soD), 0.7), road * 0.75);
    // where soil meets rock, the higher of the two surfaces wins
    soilAmt = sat(soilAmt + (groundH - rk.h) * 0.8 * soilAmt * (1. - soilAmt) * 4.);
    alb = mix(alb, soil, soilAmt);
  }
  N = normalize(N + mix(rk.dn * 0.9, groundDn * 0.8, soilAmt) * detailFade);
  // base of cliffs: darker scree and AO in crevices
  ao = mix(0.55, 1., smoothstep(0.25, 0.65, gro)) * mix(1., 0.85, steep);
  ao *= 1. - 0.25 * smoothstep(0.3, 0.0, slope) * smoothstep(0.35, 0.6, slope + 0.2) ;
  // pits and hollows in the relief and the scanned surfaces hold shade
  ao *= 1. - sat(cav) * mix(0.1, 0.55, steep);
  ao *= mix(0.6 + 0.4 * rk.h, 0.75 + 0.25 * groundH, soilAmt);

  // river bank: wet dark silt, pebbles
  vec3 silt = mix(vec3(0.36, 0.33, 0.28), vec3(0.48, 0.44, 0.38), nz2.r);
  alb = mix(alb, silt, smoothstep(0.1, 0.6, water));
  float wetBank = smoothstep(0.0, 0.5, water);

  // volcano and far ranges: darker andesite, snowfields
  float far = farM;
  vec3 andes = mix(vec3(0.48, 0.42, 0.40), vec3(0.62, 0.55, 0.50), nz.r);
  alb = mix(alb, mix(andes, alb, smoothstep(600., 200., P.y)), far * smoothstep(250., 700., P.y));

  // --- snow ---
  float snowLine = smoothstep(1250., 1900., P.y + 300. * (texture(uNoise2D, P.xz / 6000.).r - 0.5));
  float gullySnow = smoothstep(700., 1300., P.y) * smoothstep(0.55, 0.75, texture(uNoise2D, P.xz / 1500.).r + slope * 0.2);
  float permanent = max(snowLine, gullySnow) * far;
  // old patches on north-facing slopes and plateau hollows in late winter
  float northFace = sat(-N.z * 1.6) * smoothstep(0.62, 0.78, texture(uNoise2D, P.xz / 260.).r);
  float flatness = smoothstep(0.55, 0.15, slope);
  float freshCov = uSnow * flatness * (0.75 + 0.25 * nz.r);
  // melting leaves sunny faces first; shaded and north faces keep snow longest
  float sunFacing = sat(dot(N, normalize(vec3(uSunDir.x, 0.6, uSunDir.z))));
  float meltBias = (1. - uSnow) * sunFacing;
  float snow = max(permanent, max(northFace * 0.85 * flatness * (1. - 0.6 * sunFacing), freshCov));
  snow = smoothstep(0.35 + meltBias * 0.4, 0.6 + meltBias * 0.3, snow + 0.25 * (nz2.g - 0.5));
  snow *= 1. - water;
  vec3 snowC = vec3(0.92, 0.94, 0.98);
  alb = mix(alb, snowC, snow);
  rough = mix(rough, 0.45, snow); spec = mix(spec, 0.5, snow);

  // --- wetness: melting snow darkens rock and soil ---
  float wet = max(uWet * flatness * (1. - snow) * 0.9 + uWet * 0.4, wetBank * 0.8);
  alb *= 1. - 0.38 * wet;
  rough = mix(rough, 0.25, wet * 0.8); spec = mix(spec, 0.7, wet * 0.8);

  // --- frost ---
  float frost = uFrost * (1. - snow) * smoothstep(0.7, 0.3, slope) * (0.6 + 0.4 * nz.r);
  float sunWarm = terrainShadow(P) * smoothstep(0.08, 0.25, uKeyDir.y) * uKeyIsSun;
  frost *= 1. - sunWarm * 0.7;
  alb = mix(alb, vec3(0.80, 0.84, 0.90), frost * 0.25);

  Surf s;
  s.albedo = alb; s.N = N; s.rough = rough; s.spec = spec; s.ao = ao; s.wrap = 0.12; s.sss = 0.;
  float sh = keyShadow(P, N);
  gHag = 0.;
  vec3 col = shadeSurf(s, P, V, sh);
  // frost and snow glitter: tiny facets flashing toward the light
  vec2 gcell = floor(P.xz * 9.);
  float gl = hash12(gcell + floor(uTime * 0.0));
  float facing = pow(sat(dot(reflect(-V, vec3(0,1,0)), uKeyDir)), 6.);
  float sparkle = step(0.996, gl) * (frost + snow * 0.6) * (0.3 + facing * 3.) * (1. - smoothstep(60., 400., dist));
  col += uKeyColor * sparkle * sh * 2.5;
  // cave and village windows are separate geometry; terrain only darkens in deep cracks
  col = applyHaze(col, P);
  gl_FragColor = vec4(col, litAlpha(col));
}
`;

export class Terrain {
  constructor(data, tier = 'high') {
    this.data = data;
    this.sg = SHADOW_GRID[tier] || SHADOW_GRID.high;
    U.uHeightCore.value = data.texH;
    U.uHeightOuter.value = data.texHO;
    U.uNormCore.value = data.texN;
    U.uNormOuter.value = data.texNO;
    U.uAttrCore.value = data.texA;
    this.mat = makeMaterial({ vertex: VERT, fragment: FRAG, shadow: false });
    this.group = new THREE.Group();
    // LOD levels: chunk grids with GRID*2 (high only, near the camera, for the displaced relief),
    // GRID, GRID/2, GRID/4, GRID/8 quads
    this.levels = [];
    this.fine = tier === 'high';
    U.uTerrDisp.value = this.fine ? 1 : 0;
    for (let l = 0; l < 5; l++) {
      const geo = gridGeometry((GRID * 2) >> l);
      const maxInst = 1600;
      const inst = new THREE.InstancedBufferAttribute(new Float32Array(maxInst * 4), 4);
      inst.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aChunk', inst);
      const ig = new THREE.InstancedBufferGeometry();
      ig.index = geo.index; ig.attributes = geo.attributes; ig.instanceCount = 0;
      const mesh = new THREE.Mesh(ig, this.mat);
      mesh.frustumCulled = false;
      // the ground has the heaviest shader: draw it after the chimneys, buildings and balloons
      // so everything standing on it has already claimed its pixels in the depth buffer
      mesh.renderOrder = 50;
      mesh.layers.enable(2);
      this.group.add(mesh);
      this.levels.push({ geo: ig, inst, mesh });
    }
    // chunk lists: core chunks (160m) and outer chunks (2560m)
    const C = WORLD.core, O = WORLD.outer;
    this.chunks = [];
    const cs = 160;
    for (let z = C.minZ; z < C.minZ + C.sizeZ; z += cs) for (let x = C.minX; x < C.minX + C.sizeX; x += cs) this.chunks.push({ x, z, s: cs, core: true });
    const os = 2560;
    for (let z = O.minZ; z < O.minZ + O.sizeZ; z += os) for (let x = O.minX; x < O.minX + O.sizeX; x += os) {
      const inside = x >= C.minX && x + os <= C.minX + C.sizeX && z >= C.minZ && z + os <= C.minZ + C.sizeZ;
      if (inside) continue;
      // outer chunks overlapping the core are subdivided so they never cover it
      if (x + os > C.minX && x < C.minX + C.sizeX && z + os > C.minZ && z < C.minZ + C.sizeZ) {
        const sub = 640;
        for (let zz = z; zz < z + os; zz += sub) for (let xx = x; xx < x + os; xx += sub) {
          const ov = xx + sub > C.minX && xx < C.minX + C.sizeX && zz + sub > C.minZ && zz < C.minZ + C.sizeZ;
          if (!ov) this.chunks.push({ x: xx, z: zz, s: sub, core: false });
        }
        continue;
      }
      this.chunks.push({ x, z, s: os, core: false });
    }
    // chunk bounding heights for culling
    for (const c of this.chunks) {
      let lo = 1e9, hi = -1e9;
      for (let j = 0; j <= 4; j++) for (let i = 0; i <= 4; i++) {
        const h = data.height(c.x + c.s * i / 4, c.z + c.s * j / 4);
        lo = Math.min(lo, h); hi = Math.max(hi, h);
      }
      const pad = c.core ? 30 : 400;
      c.box = new THREE.Box3(new THREE.Vector3(c.x, lo - pad, c.z), new THREE.Vector3(c.x + c.s, hi + pad, c.z + c.s));
    }
    this._frustum = new THREE.Frustum();
    this._m = new THREE.Matrix4();
    this._v = new THREE.Vector3();

    // Shadow-only copy of the ground under the near slice. The view chunks are culled to the camera,
    // so cliffs behind us would never cast; this grid covers the slice and reaches up-sun of it. Past
    // it, ridges shadow through the coarse terrain shadow, which every receiver always takes.
    const sg = gridGeometry(Math.round(this.sg.size / this.sg.step), false);
    const sinst = new THREE.InstancedBufferAttribute(new Float32Array(4), 4);
    sinst.setUsage(THREE.DynamicDrawUsage);
    sg.setAttribute('aChunk', sinst);
    const sig = new THREE.InstancedBufferGeometry();
    sig.index = sg.index; sig.attributes = sg.attributes; sig.instanceCount = 1;
    const smat = new THREE.ShaderMaterial({ uniforms: this.mat.uniforms, vertexShader: VERT, fragmentShader: 'void main(){ gl_FragColor = vec4(1.); }', defines: { DEPTH_PASS: 1 }, side: THREE.DoubleSide });
    this.shadowMesh = new THREE.Mesh(sig, smat);
    this.shadowMesh.frustumCulled = false;
    this.shadowMesh.layers.set(5);
    this.shadowInst = sinst;
    this.group.add(this.shadowMesh);
  }
  // cover the near slice (centre c, half-size half) and reach up-sun of it, snapped to every other
  // lattice point so the grid's diagonals line up with the visible ground's
  setShadowCenter(c, half, L) {
    const { size, step } = this.sg;
    const lh = Math.hypot(L.x, L.z) || 1, push = Math.max(0, size / 2 - half);
    const x = c.x + L.x / lh * push, z = c.z + L.z / lh * push, q = step * 2;
    const a = this.shadowInst.array;
    a[0] = Math.round((x - size / 2) / q) * q;
    a[1] = Math.round((z - size / 2) / q) * q;
    a[2] = Math.round(size / step) * step; a[3] = 0;
    this.shadowInst.needsUpdate = true;
  }

  // pick LOD per chunk by projected density; call once per camera before rendering
  update(camera, lodBias = 1) {
    this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._m);
    const counts = [0, 0, 0, 0, 0];
    const cp = camera.position;
    // nearest chunks first, so the ground in front hides the ground behind before it's shaded
    const vis = this._vis || (this._vis = []);
    vis.length = 0;
    for (const c of this.chunks) {
      if (!this._frustum.intersectsBox(c.box)) continue;
      c.box.clampPoint(cp, this._v);
      c.d = this._v.distanceTo(cp);
      vis.push(c);
    }
    vis.sort((a, b) => a.d - b.d);
    for (const c of vis) {
      const d = c.d;
      // spacing of a vertex at this LOD vs. distance
      let l;
      if (c.core) l = this.fine && d < 130 ? 0 : d < 700 * lodBias ? 1 : d < 1600 * lodBias ? 2 : d < 3200 * lodBias ? 3 : 4;
      else l = c.s <= 640 ? (d < 2500 * lodBias ? 2 : d < 6000 * lodBias ? 3 : 4) : (d < 6000 * lodBias ? 2 : d < 16000 * lodBias ? 3 : 4);
      const L = this.levels[l];
      const k = counts[l]++;
      const a = L.inst.array;
      a[k * 4] = c.x; a[k * 4 + 1] = c.z; a[k * 4 + 2] = c.s; a[k * 4 + 3] = 0;
    }
    for (let l = 0; l < 5; l++) {
      const L = this.levels[l];
      L.geo.instanceCount = counts[l];
      L.inst.needsUpdate = true;
      L.inst.clearUpdateRanges?.();
    }
  }
}
