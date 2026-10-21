// CPU-side noise used for terrain generation, placement and baked noise textures.
import * as THREE from 'three';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Simplex 2D / 3D after Stefan Gustavson, table-driven.
const grad3 = new Float32Array([1,1,0,-1,1,0,1,-1,0,-1,-1,0,1,0,1,-1,0,1,1,0,-1,-1,0,-1,0,1,1,0,-1,1,0,1,-1,0,-1,-1]);
const perm = new Uint8Array(512);
const permMod12 = new Uint8Array(512);
(function () {
  const r = mulberry32(1337);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; permMod12[i] = perm[i] % 12; }
})();

const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
export function simplex2(xin, yin) {
  let n0 = 0, n1 = 0, n2 = 0;
  const s = (xin + yin) * F2;
  const i = Math.floor(xin + s), j = Math.floor(yin + s);
  const t = (i + j) * G2;
  const x0 = xin - (i - t), y0 = yin - (j - t);
  let i1, j1;
  if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
  const ii = i & 255, jj = j & 255;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 >= 0) { const g = permMod12[ii + perm[jj]] * 3; t0 *= t0; n0 = t0 * t0 * (grad3[g] * x0 + grad3[g + 1] * y0); }
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 >= 0) { const g = permMod12[ii + i1 + perm[jj + j1]] * 3; t1 *= t1; n1 = t1 * t1 * (grad3[g] * x1 + grad3[g + 1] * y1); }
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 >= 0) { const g = permMod12[ii + 1 + perm[jj + 1]] * 3; t2 *= t2; n2 = t2 * t2 * (grad3[g] * x2 + grad3[g + 1] * y2); }
  return 70 * (n0 + n1 + n2);
}

const F3 = 1 / 3, G3 = 1 / 6;
export function simplex3(xin, yin, zin) {
  let n0, n1, n2, n3;
  const s = (xin + yin + zin) * F3;
  const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
  const t = (i + j + k) * G3;
  const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
  let i1, j1, k1, i2, j2, k2;
  if (x0 >= y0) {
    if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
    else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
  } else {
    if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
    else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
    else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
  }
  const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
  const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
  const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
  const ii = i & 255, jj = j & 255, kk = k & 255;
  let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
  if (t0 < 0) n0 = 0; else { const g = permMod12[ii + perm[jj + perm[kk]]] * 3; t0 *= t0; n0 = t0 * t0 * (grad3[g] * x0 + grad3[g + 1] * y0 + grad3[g + 2] * z0); }
  let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
  if (t1 < 0) n1 = 0; else { const g = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3; t1 *= t1; n1 = t1 * t1 * (grad3[g] * x1 + grad3[g + 1] * y1 + grad3[g + 2] * z1); }
  let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
  if (t2 < 0) n2 = 0; else { const g = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3; t2 *= t2; n2 = t2 * t2 * (grad3[g] * x2 + grad3[g + 1] * y2 + grad3[g + 2] * z2); }
  let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
  if (t3 < 0) n3 = 0; else { const g = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3; t3 *= t3; n3 = t3 * t3 * (grad3[g] * x3 + grad3[g + 1] * y3 + grad3[g + 2] * z3); }
  return 32 * (n0 + n1 + n2 + n3);
}

export function fbm2(x, y, oct = 5, lac = 2.0, gain = 0.5) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * simplex2(x * f + i * 17.3, y * f - i * 9.1); n += a; a *= gain; f *= lac; }
  return s / n;
}
export function ridged2(x, y, oct = 5) {
  let a = 1, f = 1, s = 0, n = 0, w = 1;
  for (let i = 0; i < oct; i++) {
    let v = 1 - Math.abs(simplex2(x * f + i * 31.7, y * f + i * 11.3));
    v *= v; v *= w; w = Math.min(1, v * 1.6);
    s += a * v; n += a; a *= 0.5; f *= 2.03;
  }
  return s / n;
}
export function fbm3(x, y, z, oct = 4) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * simplex3(x * f, y * f, z * f); n += a; a *= 0.5; f *= 2.0; }
  return s / n;
}

// Tileable value noise on a lattice of size p, for baked textures.
function tileHash(ix, iy, iz, p, seed) {
  ix = ((ix % p) + p) % p; iy = ((iy % p) + p) % p; iz = ((iz % p) + p) % p;
  let h = (ix * 374761393 + iy * 668265263 + iz * 1274126177 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function smooth(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function tileValue3(x, y, z, p, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = smooth(x - ix), fy = smooth(y - iy), fz = smooth(z - iz);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => tileHash(ix + dx, iy + dy, iz + dz, p, seed);
  return l(l(l(c(0,0,0), c(1,0,0), fx), l(c(0,1,0), c(1,1,0), fx), fy),
           l(l(c(0,0,1), c(1,0,1), fx), l(c(0,1,1), c(1,1,1), fx), fy), fz);
}
function tileWorley3(x, y, z, p, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let d = 9;
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = ix + dx, cy = iy + dy, cz = iz + dz;
    const px = cx + tileHash(cx, cy, cz, p, seed), py = cy + tileHash(cx, cy, cz, p, seed + 7), pz = cz + tileHash(cx, cy, cz, p, seed + 13);
    const ex = px - x, ey = py - y, ez = pz - z;
    const dd = ex * ex + ey * ey + ez * ez;
    if (dd < d) d = dd;
  }
  return Math.sqrt(d);
}

// RGBA 2D tileable noise: r,g = value fbm at two scales, b = worley, a = white hash.
// Blue noise by largest void: start with one point and keep adding the empty texel furthest from
// everything placed so far (lowest gaussian energy, wrapping round). The order a texel was filled in
// is its value, so any threshold of it is evenly spread. Good enough for dither and rotations.
function blueNoise(n = 64) {
  const N = n * n, E = new Float32Array(N), rank = new Float32Array(N).fill(-1);
  const R = 6, sig = 1.9, K = [];
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) K.push([dx, dy, Math.exp(-(dx * dx + dy * dy) / (2 * sig * sig))]);
  let p = 0;
  for (let k = 0; k < N; k++) {
    if (k > 0) { let m = Infinity; for (let i = 0; i < N; i++) if (rank[i] < 0 && E[i] < m) { m = E[i]; p = i; } }
    rank[p] = k / N;
    const px = p % n, py = (p / n) | 0;
    for (const [dx, dy, w] of K) E[((py + dy + n) % n) * n + ((px + dx + n) % n)] += w;
  }
  return rank;
}

export function makeNoise2D(size = 256) {
  const bn = blueNoise(64);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    let a = 0, amp = 0.5, f = 8;
    for (let o = 0; o < 5; o++) { a += amp * tileValue3(u * f, v * f, 0.5, f, 3 + o); amp *= 0.5; f *= 2; }
    let b = 0; amp = 0.5; f = 32;
    for (let o = 0; o < 3; o++) { b += amp * tileValue3(u * f, v * f, 2.5, f, 11 + o); amp *= 0.5; f *= 2; }
    const w = 1 - Math.min(1, tileWorley3(u * 16, v * 16, 0.5, 16, 21) * 1.15);
    const i = (y * size + x) * 4;
    data[i] = Math.min(255, a / 0.97 * 255);
    data[i + 1] = Math.min(255, b / 0.875 * 255);
    data[i + 2] = w * 255;
    // alpha: tiled blue noise, for per-pixel rotations and jitter that the temporal pass averages well
    data[i + 3] = bn[(y & 63) * 64 + (x & 63)] * 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true;
  return t;
}

// 3D tileable cloud noise: r = perlin-worley base, g,b,a = worley fbm detail octaves.
export function makeNoise3D(size = 64) {
  const data = new Uint8Array(size * size * size * 4);
  for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, w = z / size;
    let pn = 0, amp = 0.5, f = 4;
    for (let o = 0; o < 4; o++) { pn += amp * tileValue3(u * f, v * f, w * f, f, 40 + o); amp *= 0.5; f *= 2; }
    pn = pn / 0.9375;
    const w1 = 1 - tileWorley3(u * 4, v * 4, w * 4, 4, 50);
    const w2 = 1 - tileWorley3(u * 8, v * 8, w * 8, 8, 51);
    const w3 = 1 - tileWorley3(u * 16, v * 16, w * 16, 16, 52);
    const wf = Math.max(0, Math.min(1, w1 * 0.625 + w2 * 0.25 + w3 * 0.125));
    // remap perlin by worley (perlin-worley)
    const pw = Math.max(0, Math.min(1, (pn - (1 - wf)) / (1 - (1 - wf) + 1e-4) * 0.5 + pn * 0.5));
    const i = ((z * size + y) * size + x) * 4;
    data[i] = pw * 255;
    data[i + 1] = Math.max(0, Math.min(1, w2 * 0.7 + w3 * 0.3)) * 255;
    data[i + 2] = Math.max(0, Math.min(1, w3)) * 255;
    data[i + 3] = pn * 255;
  }
  const t = new THREE.Data3DTexture(data, size, size, size);
  t.format = THREE.RGBAFormat;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.unpackAlignment = 1; t.needsUpdate = true;
  return t;
}
