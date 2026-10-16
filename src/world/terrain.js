// Terrain renderer: instanced LOD chunks displaced from the heightfield textures,
// shaded with banded tuff strata, erosion grooves, soil, snow, frost and wetness.
import * as THREE from 'three';
import { U, WORLD } from '../core/shared.js';
import { COMMON, VCOMMON, ROCK } from '../glsl/common.js';
import { makeMaterial } from '../core/mat.js';

const GRID = 64;

function gridGeometry(n) {
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
  edge(top); edge(bottom.reverse()); edge(left.reverse()); edge(right);
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
void main(){
  vec2 xz = aChunk.xy + position.xz * aChunk.z;
  float h = heightAt(xz);
  h -= position.y * (2.0 + aChunk.z * 0.03);
  vec3 wp = vec3(xz.x, h, xz.y);
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
  float slope = 1. - N.y;

  // detail normals: vertical erosion grooves on steep faces, grain on flats
  float detailFade = 1. - smoothstep(600., 2500., dist);
  vec3 tang = normalize(vec3(-N.z, 0., N.x) + 1e-4);
  float along = dot(P.xz, tang.xz);
  float gro = texture(uNoise2D, vec2(along / 9., P.y / 160.)).r * 0.6 + texture(uNoise2D, vec2(along / 3.1, P.y / 60.)).g * 0.4;
  float steep = smoothstep(0.25, 0.65, slope);
  vec3 gN = tang * (gro - 0.5) * 1.6 * steep * detailFade;
  vec4 nz = texture(uNoise2D, P.xz / 18.);
  vec4 nz2 = texture(uNoise2D, P.xz / 4.3);
  vec3 grain = vec3(nz.g - 0.5, 0., nz2.r - 0.5) * 0.35 * detailFade;
  // strata ledges catch light: tilt normal at band edges
  float b = (P.y + 6. * texture(uNoise2D, P.xz / 900.).r + 2.5 * texture(uNoise2D, P.xz / 140.).g) / 9.5;
  float ledge = smoothstep(0.0, 0.08, fract(b)) * (1. - smoothstep(0.08, 0.2, fract(b)));
  N = normalize(N + gN + grain * (1. - steep) + vec3(0, ledge * 0.9 * steep, 0));

  // --- albedo ---
  float var = nz.r;
  vec3 rock = tuffColor(P.y, rose, P.xz, var);
  vec3 alb = rock;
  float rough = 0.85, spec = 0.12, ao = 1.0;
  // soils on gentle ground
  float flat_ = smoothstep(0.32, 0.12, slope);
  vec3 dryGrass = mix(vec3(0.52, 0.47, 0.30), vec3(0.42, 0.40, 0.26), nz2.g);
  vec3 tuffSoil = mix(vec3(0.60, 0.51, 0.39), vec3(0.50, 0.41, 0.31), nz.g);
  vec3 plowed = mix(vec3(0.42, 0.30, 0.22), vec3(0.50, 0.38, 0.27), nz2.r);
  // furrows in plowed fields
  float ang = at.a * 3.14159;
  vec2 fd = vec2(cos(ang), sin(ang));
  float furrow = 0.5 + 0.5 * sin(dot(P.xz, fd) * 2.4);
  plowed *= 0.8 + 0.3 * furrow;
  vec3 vineSoil = mix(vec3(0.58, 0.42, 0.30), vec3(0.66, 0.50, 0.36), nz.g);
  vec3 soil = tuffSoil;
  soil = mix(soil, dryGrass, smoothstep(0.3, 0.42, soilT) * (1. - smoothstep(0.62, 0.7, soilT)));
  soil = mix(soil, plowed, smoothstep(0.66, 0.72, soilT) * (1. - smoothstep(0.9, 0.98, soilT)));
  soil = mix(soil, vineSoil, smoothstep(0.92, 0.98, soilT));
  float soilAmt = flat_ * smoothstep(0.1, 0.25, soilT + 0.12 * (1. - slope));
  // plateau tops get patchy dry grass over pale tuff
  soilAmt = max(soilAmt, flat_ * smoothstep(0.55, 0.75, texture(uNoise2D, P.xz / 70.).r) * 0.85);
  alb = mix(alb, soil, soilAmt);
  // base of cliffs: darker scree and AO in crevices
  ao = mix(0.55, 1., smoothstep(0.25, 0.65, gro)) * mix(1., 0.85, steep);
  ao *= 1. - 0.25 * smoothstep(0.3, 0.0, slope) * smoothstep(0.35, 0.6, slope + 0.2) ;

  // river bank: wet dark silt, pebbles
  vec3 silt = mix(vec3(0.36, 0.33, 0.28), vec3(0.48, 0.44, 0.38), nz2.r);
  alb = mix(alb, silt, smoothstep(0.1, 0.6, water));
  float wetBank = smoothstep(0.0, 0.5, water);

  // volcano and far ranges: darker andesite, snowfields
  float far = 1. - coreMask(P.xz);
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
  vec3 col = shadeSurf(s, P, V, sh);
  // frost and snow glitter: tiny facets flashing toward the light
  vec2 gcell = floor(P.xz * 9.);
  float gl = hash12(gcell + floor(uTime * 0.0));
  float facing = pow(sat(dot(reflect(-V, vec3(0,1,0)), uKeyDir)), 6.);
  float sparkle = step(0.996, gl) * (frost + snow * 0.6) * (0.3 + facing * 3.) * (1. - smoothstep(60., 400., dist));
  col += uKeyColor * sparkle * sh * 2.5;
  // cave and village windows are separate geometry; terrain only darkens in deep cracks
  col = applyHaze(col, P);
  gl_FragColor = vec4(col, 1.);
}
`;

export class Terrain {
  constructor(data) {
    this.data = data;
    U.uHeightCore.value = data.texH;
    U.uHeightOuter.value = data.texHO;
    U.uNormCore.value = data.texN;
    U.uNormOuter.value = data.texNO;
    U.uAttrCore.value = data.texA;
    this.mat = makeMaterial({ vertex: VERT, fragment: FRAG, shadow: false });
    this.group = new THREE.Group();
    // LOD levels: chunk grids with GRID, GRID/2, GRID/4, GRID/8 quads
    this.levels = [];
    for (let l = 0; l < 4; l++) {
      const geo = gridGeometry(GRID >> l);
      const maxInst = 1600;
      const inst = new THREE.InstancedBufferAttribute(new Float32Array(maxInst * 4), 4);
      inst.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aChunk', inst);
      const ig = new THREE.InstancedBufferGeometry();
      ig.index = geo.index; ig.attributes = geo.attributes; ig.instanceCount = 0;
      const mesh = new THREE.Mesh(ig, this.mat);
      mesh.frustumCulled = false;
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
  }

  // pick LOD per chunk by projected density; call once per camera before rendering
  update(camera, lodBias = 1) {
    this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._m);
    const counts = [0, 0, 0, 0];
    const cp = camera.position;
    for (const c of this.chunks) {
      if (!this._frustum.intersectsBox(c.box)) continue;
      c.box.clampPoint(cp, this._v);
      const d = this._v.distanceTo(cp);
      // spacing of a vertex at this LOD vs. distance
      let l;
      if (c.core) l = d < 450 * lodBias ? 0 : d < 1100 * lodBias ? 1 : d < 2400 * lodBias ? 2 : 3;
      else l = c.s <= 640 ? (d < 3000 ? 1 : 2) : (d < 9000 ? 0 : d < 20000 ? 1 : 2);
      const L = this.levels[l];
      const k = counts[l]++;
      const a = L.inst.array;
      a[k * 4] = c.x; a[k * 4 + 1] = c.z; a[k * 4 + 2] = c.s; a[k * 4 + 3] = 0;
    }
    for (let l = 0; l < 4; l++) {
      const L = this.levels[l];
      L.geo.instanceCount = counts[l];
      L.inst.needsUpdate = true;
      L.inst.clearUpdateRanges?.();
    }
  }
}
