// Day cycle, celestial positions, weather schedule and the per-hour look.
import * as THREE from 'three';

const DEG = Math.PI / 180;
const LAT = 38.64 * DEG;   // Göreme
const DEC = -8.5 * DEG;    // late February

// [startHour, durationSeconds] — hours advance non-linearly so dawn and dusk get screen time.
const PHASES = [
  [4.70, 36],   // pre-dawn
  [6.05, 72],   // sunrise
  [7.45, 46],   // morning
  [9.75, 74],   // snowstorm
  [12.65, 52],  // clear cold afternoon
  [15.35, 56],  // golden hour
  [16.95, 54],  // sunset
  [17.78, 40],  // blue hour
  [18.65, 80],  // moonlit night
  [28.70, 0],   // == 4.70 next day
];
export const CYCLE = PHASES.reduce((s, p) => s + p[1], 0);

export function hourAt(cycleT) {
  let t = ((cycleT % CYCLE) + CYCLE) % CYCLE;
  for (let i = 0; i < PHASES.length - 1; i++) {
    const [h0, d] = PHASES[i];
    if (t <= d) return (h0 + (PHASES[i + 1][0] - h0) * (t / d)) % 24;
    t -= d;
  }
  return PHASES[0][0];
}
// rate of hours per second at a given cycle time (used for integrating snow/melt)
function hoursPerSecond(cycleT) {
  let t = ((cycleT % CYCLE) + CYCLE) % CYCLE;
  for (let i = 0; i < PHASES.length - 1; i++) {
    const [h0, d] = PHASES[i];
    if (t <= d) return (PHASES[i + 1][0] - h0) / d;
    t -= d;
  }
  return 0.03;
}
// find the cycle time for a given hour (for debug jumps)
export function cycleForHour(h) {
  let acc = 0;
  for (let i = 0; i < PHASES.length - 1; i++) {
    let h0 = PHASES[i][0], h1 = PHASES[i + 1][0];
    let hh = h; if (hh < PHASES[0][0]) hh += 24;
    if (hh >= h0 && hh <= h1) return acc + (hh - h0) / (h1 - h0) * PHASES[i][1];
    acc += PHASES[i][1];
  }
  return 0;
}

function celestial(hourAngle, dec, out) {
  // altitude/azimuth for observer at LAT
  const sinAlt = Math.sin(LAT) * Math.sin(dec) + Math.cos(LAT) * Math.cos(dec) * Math.cos(hourAngle);
  const alt = Math.asin(sinAlt);
  const cosAz = (Math.sin(dec) - Math.sin(alt) * Math.sin(LAT)) / (Math.cos(alt) * Math.cos(LAT));
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (Math.sin(hourAngle) > 0) az = 2 * Math.PI - az;
  out.set(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt));
  return alt;
}

// Atmospheric transmittance of direct light for a given elevation (radians).
function transmittance(elev, out, haze = 1) {
  const ed = Math.max(-2, elev / DEG);
  const m = 1 / (Math.max(0.0, Math.sin(Math.max(elev, -0.035))) + 0.15 * Math.pow(ed + 3.885, -1.253));
  const tr = [0.0464, 0.108, 0.265], tm = 0.055 * haze, to = [0.0045, 0.013, 0.0006];
  out.setRGB(Math.exp(-(tr[0] + tm + to[0]) * m), Math.exp(-(tr[1] + tm + to[1]) * m), Math.exp(-(tr[2] + tm + to[2]) * m));
  return out;
}

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// keyframed look, by hour (wraps). Colours are linear. Exposures and shadow tints sit 0.72^(1/contrast)
// below what they were tuned at: that's where the tone curve's old input scale went (post/post.js),
// so UE's curve runs at its own defaults and each hour comes out as bright as before.
const KEYS = [
  // h, exposure, shadowTint, highTint, sat, contrast, bloom
  { h: 0.0, exp: 0.729, sh: [0.0073, 0.0146, 0.0365], hi: [0.80, 0.92, 1.12], sat: 0.72, con: 1.04, bloom: 0.9 },
  { h: 4.7, exp: 0.729, sh: [0.0087, 0.0160, 0.0401], hi: [0.82, 0.92, 1.10], sat: 0.78, con: 1.04, bloom: 0.9 },
  { h: 6.0, exp: 0.734, sh: [0.0088, 0.0161, 0.0440], hi: [0.95, 0.92, 1.05], sat: 0.95, con: 1.06, bloom: 1.0 },
  { h: 6.6, exp: 0.738, sh: [0.0074, 0.0148, 0.0406], hi: [1.12, 0.98, 0.84], sat: 1.12, con: 1.08, bloom: 1.15 },
  { h: 7.4, exp: 0.738, sh: [0.0059, 0.0118, 0.0295], hi: [1.08, 1.00, 0.88], sat: 1.10, con: 1.08, bloom: 1.0 },
  { h: 9.0, exp: 0.738, sh: [0.0044, 0.0089, 0.0192], hi: [1.02, 1.00, 0.97], sat: 1.04, con: 1.08, bloom: 0.8 },
  { h: 13.0, exp: 0.705, sh: [0.0030, 0.0060, 0.0150], hi: [1.02, 1.00, 0.97], sat: 1.08, con: 1.14, bloom: 0.7 },
  { h: 15.6, exp: 0.738, sh: [0.0074, 0.0074, 0.0192], hi: [1.10, 0.99, 0.86], sat: 1.14, con: 1.08, bloom: 0.95 },
  { h: 16.9, exp: 0.738, sh: [0.0148, 0.0059, 0.0295], hi: [1.14, 0.94, 0.86], sat: 1.22, con: 1.08, bloom: 1.15 },
  { h: 17.5, exp: 0.734, sh: [0.0176, 0.0073, 0.0440], hi: [1.08, 0.90, 1.00], sat: 1.20, con: 1.06, bloom: 1.2 },
  { h: 18.2, exp: 0.731, sh: [0.0088, 0.0132, 0.0512], hi: [0.88, 0.92, 1.12], sat: 1.06, con: 1.05, bloom: 1.1 },
  { h: 19.5, exp: 0.729, sh: [0.0073, 0.0146, 0.0365], hi: [0.80, 0.92, 1.12], sat: 0.74, con: 1.04, bloom: 0.9 },
  { h: 24.0, exp: 0.729, sh: [0.0073, 0.0146, 0.0365], hi: [0.80, 0.92, 1.12], sat: 0.72, con: 1.04, bloom: 0.9 },
];
function sampleKeys(h, keys) {
  let i = 0; while (i < keys.length - 2 && keys[i + 1].h < h) i++;
  const a = keys[i], b = keys[i + 1];
  const t = smooth(0, 1, (h - a.h) / (b.h - a.h));
  const mix3 = (x, y) => [lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)];
  return { exp: lerp(a.exp, b.exp, t), sh: mix3(a.sh, b.sh), hi: mix3(a.hi, b.hi), sat: lerp(a.sat, b.sat, t), con: lerp(a.con, b.con, t), bloom: lerp(a.bloom, b.bloom, t) };
}
// piecewise linear over hour with wrap
function curve(h, pts) {
  for (let i = 0; i < pts.length - 1; i++) {
    if (h >= pts[i][0] && h <= pts[i + 1][0]) {
      const t = smooth(0, 1, (h - pts[i][0]) / (pts[i + 1][0] - pts[i][0]));
      return lerp(pts[i][1], pts[i + 1][1], t);
    }
  }
  return pts[pts.length - 1][1];
}

export class Sky {
  constructor() {
    this.cycleT = 0;
    this.hour = 4.7;
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.keyDir = new THREE.Vector3(0, 1, 0);
    this.sunColor = new THREE.Color();
    this.moonColor = new THREE.Color(0.55, 0.68, 1.0);
    this.keyColor = new THREE.Color();
    this.skyAmb = new THREE.Color();
    this.groundAmb = new THREE.Color();
    this.snowCover = 0.0;
    this.wetness = 0.0;
    this.state = {};
    this._c = new THREE.Color();
  }

  update(dt, timeScale = 1) {
    const sdt = dt * timeScale;
    this.cycleT = (this.cycleT + sdt) % CYCLE;
    const h = this.hour = hourAt(this.cycleT);
    const s = this.state;

    // --- celestial ---
    const ha = (h - 12) * 15 * DEG;
    const sunAlt = celestial(ha, DEC, this.sunDir);
    // a waning gibbous moon trails the anti-sun point, so it lights the night and lingers into pre-dawn
    const moonAlt = celestial(ha + Math.PI + 0.12, 10.5 * DEG, this.moonDir);
    s.sunElev = sunAlt; s.moonElev = moonAlt;

    // --- weather schedule ---
    s.storm = smooth(9.75, 10.55, h) * (1 - smooth(11.9, 12.65, h));
    s.cloud = curve(h, [[0, .22], [4.7, .28], [6.0, .34], [7.4, .40], [9.2, .52], [10.3, 1.0], [12.0, 1.0], [12.9, .30], [14.0, .16], [15.4, .26], [16.9, .44], [17.8, .40], [19.0, .22], [24, .22]]);
    s.frost = curve(h, [[0, .9], [6.6, 1.0], [7.8, .75], [9.5, .05], [12.7, 0], [16.9, 0], [18.0, .3], [20.0, .75], [24, .9]]);
    s.wind = curve(h, [[0, .45], [5.0, .5], [7.5, .6], [9.6, .9], [10.6, 2.3], [11.8, 2.3], [12.8, 1.1], [15.5, .9], [17.5, .7], [20, .5], [24, .45]]);
    s.diamondDust = curve(h, [[0, .35], [5.5, .5], [6.6, .95], [8.4, .75], [9.6, 0], [17.9, 0], [19.5, .3], [24, .35]]);
    s.sunDogs = curve(h, [[0, 0], [6.3, 0], [6.7, 1], [8.6, .85], [9.4, 0], [24, 0]]) * smooth(0.5 * DEG, 3 * DEG, sunAlt);
    s.pillars = curve(h, [[0, 1], [5.6, .9], [6.2, 0], [18.3, 0], [19.2, .9], [24, 1]]);
    s.haze = curve(h, [[0, 1.2], [6.0, 1.35], [7.5, 1.15], [9.0, 0.8], [10.3, 3.2], [12.0, 3.2], [12.9, 0.6], [15.0, 0.65], [16.9, 1.1], [18.0, 1.1], [24, 1.2]]);
    s.hour = h;

    // snow accumulation and melt, integrated in game hours
    const hps = hoursPerSecond(this.cycleT) * sdt;
    const sunUp = smooth(4 * DEG, 20 * DEG, sunAlt);
    this.snowCover = Math.min(1, this.snowCover + s.storm * 0.95 * hps);
    const melt = (1 - s.storm) * sunUp * 0.21 * hps;
    this.snowCover = Math.max(0, this.snowCover - melt);
    this.wetness = Math.max(0, Math.min(1, this.wetness + melt * 2.2 + s.storm * 0.25 * hps - (sunUp * 0.06 + 0.02) * hps));
    s.snow = this.snowCover; s.wet = this.wetness;

    // --- key light ---
    transmittance(sunAlt, this.sunColor, 1 + s.storm * 2);
    const sunVis = smooth(-6.5 * DEG, 0.4 * DEG, sunAlt);
    const moonUp = smooth(-1 * DEG, 6 * DEG, moonAlt);
    const moonVis = moonUp * smooth(-2 * DEG, -6 * DEG, sunAlt);
    s.night = 1 - smooth(-9 * DEG, -1 * DEG, sunAlt);
    const stormDim = 1 - s.storm * 0.86;
    const cloudDim = 1 - Math.max(0, s.cloud - 0.5) * 0.9;
    // whichever of sun and moon is brighter is the key; they cross over in the blue hour
    const sunKey = (this.sunColor.r * 0.3 + this.sunColor.g * 0.6 + this.sunColor.b * 0.1) * 3.4 * sunVis;
    const moonKey = 0.045 * moonVis * 0.65;
    if (sunKey >= moonKey) {
      this.keyDir.copy(this.sunDir);
      // keep a sliver above horizon for shadow projection
      if (this.keyDir.y < 0.02) { this.keyDir.y = 0.02; this.keyDir.normalize(); }
      this.keyColor.copy(this.sunColor).multiplyScalar(3.4 * sunVis * stormDim * cloudDim);
      s.keyIsSun = 1; s.keyElev = sunAlt;
    } else {
      this.keyDir.copy(this.moonDir);
      if (this.keyDir.y < 0.05) { this.keyDir.y = 0.05; this.keyDir.normalize(); }
      this.keyColor.copy(this.moonColor).multiplyScalar(0.045 * moonVis * stormDim * cloudDim);
      s.keyIsSun = 0; s.keyElev = moonAlt;
    }

    // --- ambient: sky dome irradiance, approximated by sun elevation ---
    const e = sunAlt / DEG;
    const dayAmb = smooth(-12, 12, e);
    const twi = smooth(-14, -2, e) * (1 - smooth(-1, 10, e));
    const sk = this.skyAmb, gr = this.groundAmb;
    sk.setRGB(0.20, 0.27, 0.42).multiplyScalar(0.2 + 0.8 * smooth(-2, 30, e)).multiplyScalar(dayAmb * 1.25);
    // twilight glow is violet-blue
    sk.r += twi * 0.05; sk.g += twi * 0.055; sk.b += twi * 0.11;
    // moonlit night
    const night = 1 - dayAmb;
    sk.r += night * 0.012 * (0.4 + moonVis); sk.g += night * 0.018 * (0.4 + moonVis); sk.b += night * 0.034 * (0.4 + moonVis);
    // overcast: brighter flatter grey sky, dimmer sun
    const st = s.storm;
    sk.lerp(this._c.setRGB(0.30, 0.33, 0.38).multiplyScalar(0.3 + 0.7 * dayAmb), st * 0.85);
    gr.copy(sk).multiplyScalar(0.35);
    gr.r += this.keyColor.r * 0.05 * (s.keyIsSun); gr.g += this.keyColor.g * 0.04 * s.keyIsSun; gr.b += this.keyColor.b * 0.03 * s.keyIsSun;
    gr.lerp(this._c.setRGB(0.32, 0.33, 0.36), this.snowCover * 0.35 * dayAmb);

    // --- look ---
    const look = sampleKeys(h, KEYS);
    // exposure compensates for the huge range between noon and moonlight
    const brightness = Math.max(1e-4, this.keyColor.r * 0.3 + this.keyColor.g * 0.6 + this.keyColor.b * 0.1) * 0.25 + (sk.r + sk.g + sk.b) / 3;
    s.exposure = look.exp * Math.min(7.0, 0.62 / Math.pow(brightness, 0.8));
    s.grade = look;
    // storm grade pulls everything to soft cool grey
    if (st > 0) {
      const con0 = look.con;
      look.sat = lerp(look.sat, 0.62, st); look.con = lerp(look.con, 0.96, st);
      // the exposures carry the tone curve's old input scale as 0.72^(1/contrast) (see KEYS)
      look.exp *= Math.pow(0.72, 1 / look.con - 1 / con0);
      for (let i = 0; i < 3; i++) {
        look.sh[i] = lerp(look.sh[i], [0.0213, 0.0249, 0.0320][i], st);
        look.hi[i] = lerp(look.hi[i], [0.96, 1.0, 1.05][i], st);
      }
      look.bloom = lerp(look.bloom, 1.2, st);
    }
    s.sunVis = sunVis; s.moonVis = moonVis;
    return s;
  }
}
