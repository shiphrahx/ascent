// Heightfield generation: volcanic plateau, terraced tuff valleys, rose fins, castle hill,
// river channel, vineyard terraces, fields, volcano and far ranges.
import * as THREE from 'three';
import { WORLD } from '../core/shared.js';
import { simplex2, fbm2, ridged2 } from '../core/noise.js';
import { VALLEYS, SITES, VOLCANO, RIVER } from './layout.js';

const tick = () => new Promise(r => setTimeout(r, 0));
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp01 = x => Math.max(0, Math.min(1, x));

export function plateau(x, z) {
  const r = Math.hypot(x, z);
  let h = 84 + 11 * fbm2(x / 1100, z / 1100, 4) + 4 * fbm2(x / 260, z / 260, 3);
  h += 18 * smooth(700, 1300, Math.abs(z)) * (0.6 + 0.4 * simplex2(x / 900, 3.3));
  // dendritic gullies across the plateau surface
  const g = ridged2(x / 420 + 7, z / 420 - 3, 4);
  h -= 16 * Math.pow(g, 4);
  // rolling uplands and far ranges outside the core
  if (r > 2500) {
    h += 40 * fbm2(x / 4200, z / 4200, 4) * smooth(2500, 9000, r);
    if (r > 15000) h += 650 * smooth(15000, 30000, r) * Math.pow(ridged2(x / 7000, z / 7000, 5), 1.6);
    if (r > 8000) h += 180 * smooth(8000, 20000, r) * (0.5 + 0.5 * fbm2(x / 5200, z / 5200, 4));
  }
  return h;
}

function volcano(x, z) {
  const V = VOLCANO;
  let best = 0;
  const cone = (cx, cz, peak, R, seed) => {
    const dx = x - cx, dz = z - cz;
    const r = Math.hypot(dx, dz);
    if (r > R) return 0;
    const a = Math.atan2(dz, dx);
    const u = r / R;
    let h = peak * Math.pow(1 - u, 1.75);
    // radial erosion ridges
    const rid = ridged2(Math.cos(a) * 3.2 + seed, Math.sin(a) * 3.2 + r / 2600, 4);
    h += 280 * (rid - 0.45) * Math.sin(Math.PI * Math.min(1, u * 1.4)) * (1 - u);
    h += 60 * fbm2(dx / 900, dz / 900, 3) * (1 - u);
    // summit crater
    h -= 120 * Math.exp(-Math.pow(r / 380, 2)) * (peak > 2000 ? 1 : 0.4);
    return h;
  };
  best = Math.max(best, cone(V.x, V.z, V.peak, V.R, 0));
  best = Math.max(best, cone(V.x + 3200, V.z + 1600, 1650, 5200, 9));
  best = Math.max(best, cone(V.x - 3800, V.z + 900, 1100, 4200, 17));
  return best;
}

export function outerHeight(x, z) {
  const p = plateau(x, z);
  const v = volcano(x, z);
  return v > 0 ? Math.max(p, p * 0.3 + v) : p;
}

// distance to polyline with arc length and side, evaluated on a coarse grid
function polyField(pts, nx, nz, x0, z0, cell, maxD) {
  const dist = new Float32Array(nx * nz).fill(1e9);
  const along = new Float32Array(nx * nz);
  const side = new Int8Array(nx * nz);
  let acc = 0;
  for (let s = 0; s < pts.length - 1; s++) {
    const ax = pts[s][0], az = pts[s][1], bx = pts[s + 1][0], bz = pts[s + 1][1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz, L = Math.sqrt(L2);
    const minX = Math.min(ax, bx) - maxD, maxX = Math.max(ax, bx) + maxD;
    const minZ = Math.min(az, bz) - maxD, maxZ = Math.max(az, bz) + maxD;
    const i0 = Math.max(0, Math.floor((minX - x0) / cell)), i1 = Math.min(nx - 1, Math.ceil((maxX - x0) / cell));
    const j0 = Math.max(0, Math.floor((minZ - z0) / cell)), j1 = Math.min(nz - 1, Math.ceil((maxZ - z0) / cell));
    for (let j = j0; j <= j1; j++) {
      const pz = z0 + j * cell;
      for (let i = i0; i <= i1; i++) {
        const px = x0 + i * cell;
        let t = ((px - ax) * dx + (pz - az) * dz) / L2;
        t = Math.max(0, Math.min(1, t));
        const qx = ax + dx * t - px, qz = az + dz * t - pz;
        const d = Math.sqrt(qx * qx + qz * qz);
        const k = j * nx + i;
        if (d < dist[k]) { dist[k] = d; along[k] = acc + t * L; side[k] = (dx * (pz - az) - dz * (px - ax)) > 0 ? 1 : -1; }
      }
    }
    acc += L;
  }
  return { dist, along, side, length: acc };
}

function sampleCoarse(arr, nx, nz, fx, fz) {
  const i = Math.max(0, Math.min(nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(nz - 2, Math.floor(fz)));
  const tx = Math.max(0, Math.min(1, fx - i)), tz = Math.max(0, Math.min(1, fz - j));
  const a = arr[j * nx + i], b = arr[j * nx + i + 1], c = arr[(j + 1) * nx + i], d = arr[(j + 1) * nx + i + 1];
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
}

function smin(a, b, k) { const h = clamp01(0.5 + 0.5 * (b - a) / k); return b + (a - b) * h - k * h * (1 - h); }

export class TerrainData {
  async generate(progress) {
    const C = WORLD.core, O = WORLD.outer;
    const nx = C.resX, nz = C.resZ, cell = C.sizeX / nx;
    // coarse distance fields (every 4 texels)
    const cnx = nx / 4 + 1, cnz = nz / 4 + 1, ccell = cell * 4;
    const fields = VALLEYS.map(v => polyField(v.pts, cnx, cnz, C.minX, C.minZ, ccell, v.floorHalf + Math.max(v.wallL, v.wallR) + 160));
    const riverF = polyField(RIVER, cnx, cnz, C.minX, C.minZ, ccell, 120);
    progress(0.08); await tick();

    const H = new Float32Array(nx * nz);
    const A = new Uint8Array(nx * nz * 4);
    const valleyT = new Float32Array(nx * nz);      // 0 floor .. 1 plateau, min over valleys
    const valleyId = new Uint8Array(nx * nz);
    const riverD = new Float32Array(nx * nz);
    const castle = SITES.castle;

    for (let j = 0; j < nz; j++) {
      const z = C.minZ + (j + 0.5) * cell;
      const fz = (z - C.minZ) / ccell;
      for (let i = 0; i < nx; i++) {
        const x = C.minX + (i + 0.5) * cell;
        const fx = (x - C.minX) / ccell;
        const k = j * nx + i;
        const P = plateau(x, z);
        let h = P;
        let rose = 0, minT = 1, vid = 255;
        const warp = 20 * (ridged2(x / 85, z / 85, 3) - 0.55) + 7 * simplex2(x / 21, z / 21) + 3 * simplex2(x / 7, z / 7);
        for (let v = 0; v < VALLEYS.length; v++) {
          const V = VALLEYS[v], F = fields[v];
          let d = sampleCoarse(F.dist, cnx, cnz, fx, fz);
          const maxW = V.floorHalf + Math.max(V.wallL, V.wallR);
          if (d > maxW + 60) continue;
          d += warp * (V.id === 'river' ? 0.4 : 1);
          const s = sampleCoarse(F.along, cnx, cnz, fx, fz);
          const sd = F.side[Math.min(cnz - 1, Math.round(fz)) * cnx + Math.min(cnx - 1, Math.round(fx))];
          const W = sd > 0 ? V.wallR : V.wallL;
          const fl = V.floor0 + (V.floor1 - V.floor0) * clamp01(s / F.length) + 2.2 * fbm2(x / 120, z / 120, 3);
          const t = clamp01((d - V.floorHalf) / W);
          const n = V.steps, tt = t * n, ti = Math.floor(tt), fr = tt - ti;
          let st = (Math.min(ti, n - 1) + (ti >= n ? 1 : smooth(0.42, 1.0, fr))) / n;
          st = st * 0.72 + t * 0.28;
          let hv = fl + (P - fl) * st;
          if (V.fins) {
            const g = ((s / 38 + 0.35 * simplex2(x / 140, z / 140)) % 1 + 1) % 1;
            const ridge = Math.pow(1 - Math.abs(2 * g - 1), 0.55);
            const band = Math.pow(Math.sin(Math.PI * clamp01(t * 1.05)), 0.6);
            hv -= 30 * (1 - ridge) * band * (0.7 + 0.3 * simplex2(s / 90, sd));
          }
          if (hv < h) h = smin(h, hv, 5);
          if (t < minT) { minT = t; vid = v; }
          rose = Math.max(rose, V.rose * clamp01(1.3 - t * 0.4) * smooth(maxW + 60, maxW - 20, d));
        }
        // castle hill rising out of the plateau, gently terraced where the village sits
        const cd = Math.hypot(x - castle.x, z - castle.z) + 12 * simplex2(x / 60, z / 60);
        if (cd < castle.r * 1.6) {
          const base = Math.max(h, 70);
          let hill = base + castle.rise * Math.pow(smooth(castle.r * 1.45, 0, cd), 1.4);
          const terr = 3.2;
          const q = hill / terr;
          const stepped = (Math.floor(q) + smooth(0.6, 1.0, q - Math.floor(q))) * terr;
          hill = hill + (stepped - hill) * 0.55 * smooth(40, 90, cd) * smooth(castle.r * 1.5, castle.r * 1.1, cd);
          h = Math.max(h, hill);
          if (cd < castle.r * 1.3) { minT = Math.max(minT, 0.6); }
        }
        // river channel
        const rd = sampleCoarse(riverF.dist, cnx, cnz, fx, fz) + 2.5 * simplex2(x / 30, z / 30);
        riverD[k] = rd;
        if (rd < 28) {
          const bed = WORLD.riverY - 1.1 - 0.9 * (1 - Math.pow(Math.min(1, rd / 9), 2));
          const bank = WORLD.riverY + 0.25 + (h - WORLD.riverY - 0.25) * smooth(9, 26, rd);
          h = rd < 9 ? Math.min(h, bed + (bank - bed) * smooth(7.5, 9, rd)) : Math.min(h, bank);
        }
        // vineyard terraces
        const vin = SITES.vineyard;
        const vd = Math.hypot(x - vin.x, z - vin.z) + 25 * simplex2(x / 150, z / 150);
        const vmask = smooth(vin.r, vin.r * 0.7, vd);
        if (vmask > 0) {
          const step = 3.0, q = h / step, fq = q - Math.floor(q);
          const stepped = (Math.floor(q) + smooth(0.72, 1.0, fq)) * step;
          h = h + (stepped - h) * vmask;
        }
        // flatten launch and landing fields
        for (const site of [SITES.launch, SITES.landing]) {
          const sdist = Math.hypot(x - site.x, z - site.z);
          const m = smooth(site.r, site.r * 0.55, sdist + 15 * simplex2(x / 80, z / 80));
          if (m > 0) h = h + (site.y + 0.6 * fbm2(x / 50, z / 50, 2) - h) * m;
        }
        // blend to outer terrain at the core border
        const edge = Math.min(x - C.minX, C.minX + C.sizeX - x, z - C.minZ, C.minZ + C.sizeZ - z);
        const em = smooth(0, 360, edge);
        if (em < 1) { const ho = outerHeight(x, z); h = ho + (h - ho) * em; minT = 1 - (1 - minT) * em; rose *= em; }

        H[k] = h;
        valleyT[k] = minT; valleyId[k] = vid;
        // attributes
        const ai = k * 4;
        A[ai] = clamp01(rose + 0.12 * simplex2(x / 300, z / 300)) * 255;
        let soil = 0.18 * smooth(0.0, 0.6, simplex2(x / 90, z / 90) * 0.5 + 0.5);
        if (minT < 0.12) soil = 0.4 + 0.1 * simplex2(x / 40, z / 40);
        if (rd < 220 && rd > 10) {
          // floodplain patchwork of fields and meadow
          const fxid = Math.floor((x * 0.8 + z * 0.6) / 70), fzid = Math.floor((-x * 0.6 + z * 0.8) / 46);
          const hsh = Math.abs(Math.sin(fxid * 127.1 + fzid * 311.7) * 43758.5) % 1;
          soil = hsh > 0.45 ? 0.72 : 0.42;
          A[ai + 3] = hsh * 255;
        }
        if (vmask > 0.4) soil = 1.0;
        const om = smooth(SITES.orchard.r, SITES.orchard.r * 0.75, Math.hypot(x - SITES.orchard.x, z - SITES.orchard.z));
        if (om > 0.3) soil = 0.55;
        for (const site of [SITES.launch, SITES.landing]) if (Math.hypot(x - site.x, z - site.z) < site.r * 0.75) soil = 0.46;
        A[ai + 1] = clamp01(soil) * 255;
        A[ai + 2] = clamp01(smooth(14, 7, rd)) * 255;
      }
      if ((j & 31) === 0) { progress(0.08 + 0.6 * j / nz); await tick(); }
    }
    this.H = H; this.A = A; this.valleyT = valleyT; this.valleyId = valleyId; this.riverD = riverD;
    this.nx = nx; this.nz = nz; this.cell = cell;

    // outer heightfield (coarse, covers volcano and far ranges)
    const onx = O.resX, onz = O.resZ, ocell = O.sizeX / onx;
    const HO = new Float32Array(onx * onz);
    for (let j = 0; j < onz; j++) {
      const z = O.minZ + (j + 0.5) * ocell;
      for (let i = 0; i < onx; i++) {
        const x = O.minX + (i + 0.5) * ocell;
        const inCore = x > C.minX + 1 && x < C.minX + C.sizeX - 1 && z > C.minZ + 1 && z < C.minZ + C.sizeZ - 1;
        HO[j * onx + i] = inCore ? this.heightCore(x, z) : outerHeight(x, z);
      }
      if ((j & 63) === 0) { progress(0.68 + 0.22 * j / onz); await tick(); }
    }
    this.HO = HO; this.onx = onx; this.onz = onz; this.ocell = ocell;
    this.buildTextures();
    progress(0.95);
  }

  heightCore(x, z) {
    const C = WORLD.core;
    const fx = (x - C.minX) / this.cell - 0.5, fz = (z - C.minZ) / this.cell - 0.5;
    return sampleCoarse(this.H, this.nx, this.nz, fx, fz);
  }
  inCore(x, z) {
    const C = WORLD.core;
    return x > C.minX && x < C.minX + C.sizeX && z > C.minZ && z < C.minZ + C.sizeZ;
  }
  height(x, z) {
    if (this.inCore(x, z)) return this.heightCore(x, z);
    const O = WORLD.outer;
    return sampleCoarse(this.HO, this.onx, this.onz, (x - O.minX) / this.ocell - 0.5, (z - O.minZ) / this.ocell - 0.5);
  }
  normal(x, z, out = new THREE.Vector3()) {
    const e = 2.5;
    const hx = this.height(x + e, z) - this.height(x - e, z);
    const hz = this.height(x, z + e) - this.height(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }
  sampleArr(arr, x, z) {
    const C = WORLD.core;
    if (!this.inCore(x, z)) return arr === this.valleyT ? 1 : 0;
    const i = Math.floor((x - C.minX) / this.cell), j = Math.floor((z - C.minZ) / this.cell);
    return arr[j * this.nx + i];
  }
  attr(x, z, ch) {
    const C = WORLD.core;
    if (!this.inCore(x, z)) return 0;
    const i = Math.floor((x - C.minX) / this.cell), j = Math.floor((z - C.minZ) / this.cell);
    return this.A[(j * this.nx + i) * 4 + ch] / 255;
  }

  buildTextures() {
    const mk = (data, w, h, fmt, type, filter) => {
      const t = new THREE.DataTexture(data, w, h, fmt, type);
      t.minFilter = t.magFilter = filter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.generateMipmaps = false; t.needsUpdate = true; return t;
    };
    this.texH = mk(this.H, this.nx, this.nz, THREE.RedFormat, THREE.FloatType, THREE.NearestFilter);
    this.texHO = mk(this.HO, this.onx, this.onz, THREE.RedFormat, THREE.FloatType, THREE.NearestFilter);
    const nrm = (H, w, h, cell) => {
      const out = new Uint8Array(w * h * 4);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const l = H[j * w + Math.max(0, i - 1)], r = H[j * w + Math.min(w - 1, i + 1)];
        const u = H[Math.max(0, j - 1) * w + i], d = H[Math.min(h - 1, j + 1) * w + i];
        let nx = -(r - l), ny = 2 * cell, nz = -(d - u);
        const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
        const k = (j * w + i) * 4;
        out[k] = (nx * 0.5 + 0.5) * 255; out[k + 1] = (ny * 0.5 + 0.5) * 255; out[k + 2] = (nz * 0.5 + 0.5) * 255; out[k + 3] = 255;
      }
      return out;
    };
    this.texN = mk(nrm(this.H, this.nx, this.nz, this.cell), this.nx, this.nz, THREE.RGBAFormat, THREE.UnsignedByteType, THREE.LinearFilter);
    this.texNO = mk(nrm(this.HO, this.onx, this.onz, this.ocell), this.onx, this.onz, THREE.RGBAFormat, THREE.UnsignedByteType, THREE.LinearFilter);
    this.texA = mk(this.A, this.nx, this.nz, THREE.RGBAFormat, THREE.UnsignedByteType, THREE.LinearFilter);
  }
}
