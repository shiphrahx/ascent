// One shared wind field: altitude layers with their own heading and speed, plus travelling gusts.
// The gust pattern samples the same baked noise texture the shaders use, so trees, grass,
// smoke, snow and balloons all feel the same gust at the same place.
import * as THREE from 'three';
import { U } from '../core/shared.js';

const D = Math.PI / 180;
// heading: degrees from +x (east) toward +z (south)
export const LAYERS = [
  // in the valleys the cold air drains along them; above the plateau the layers alternate
  { y: -20, hdg: -20, spd: 6.0 },
  { y: 72, hdg: -18, spd: 6.6 },
  { y: 112, hdg: 28, spd: 8.3 },
  { y: 165, hdg: 27, spd: 9.0 },
  { y: 215, hdg: -28, spd: 10.2 },
  { y: 285, hdg: -25, spd: 10.9 },
  { y: 345, hdg: 6, spd: 12.4 },
  { y: 420, hdg: 10, spd: 13.2 },
  { y: 485, hdg: -14, spd: 10.7 },
  { y: 1200, hdg: -16, spd: 12.4 },
];

export class Wind {
  constructor(noiseTex) {
    this.noise = noiseTex.image; // {data,width,height}
    this.offset = new THREE.Vector2();
    this.strength = 1;
    this.storm = 0;
    this.groundDir = new THREE.Vector2(Math.cos(LAYERS[0].hdg * D), Math.sin(LAYERS[0].hdg * D));
    // the top layer carries the clouds
    const top = LAYERS[LAYERS.length - 1];
    this.cloudDir = new THREE.Vector2(Math.cos(top.hdg * D), Math.sin(top.hdg * D));
    this.cloudSpd = top.spd;
    this.t = 0;
  }
  sampleNoise(u, v, ch) {
    const { data, width: w, height: h } = this.noise;
    u = u - Math.floor(u); v = v - Math.floor(v);
    const x = u * w - 0.5, y = v * h - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const g = (xx, yy) => data[((((yy % h) + h) % h) * w + (((xx % w) + w) % w)) * 4 + ch] / 255;
    const a = g(x0, y0), b = g(x0 + 1, y0), c = g(x0, y0 + 1), d = g(x0 + 1, y0 + 1);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }
  gust(x, z) {
    const u = (x - this.offset.x) / 420, v = (z - this.offset.y) / 420;
    const g = this.sampleNoise(u, v, 0) * 0.7 + this.sampleNoise(u * 2.7 + 0.37, v * 2.7 + 0.37, 1) * 0.3;
    const t = Math.max(0, Math.min(1, (g - 0.38) / 0.42));
    return t * t * (3 - 2 * t);
  }
  layerAt(y) {
    let i = 0;
    while (i < LAYERS.length - 2 && LAYERS[i + 1].y < y) i++;
    const a = LAYERS[i], b = LAYERS[i + 1];
    let t = Math.max(0, Math.min(1, (y - a.y) / (b.y - a.y)));
    t = t * t * (3 - 2 * t);
    let dh = b.hdg - a.hdg;
    return { hdg: a.hdg + dh * t, spd: a.spd + (b.spd - a.spd) * t };
  }
  // full velocity at a point, m/s
  at(x, y, z, out = new THREE.Vector3()) {
    const L = this.layerAt(y);
    const g = this.gust(x, z);
    const sw = 0.85 + 0.35 * this.storm;
    const spd = L.spd * sw * (0.82 + 0.42 * g);
    const hdg = (L.hdg + 9 * Math.sin(this.t * 0.07 + x * 0.002) * (0.4 + g)) * D;
    out.set(Math.cos(hdg) * spd, 0, Math.sin(hdg) * spd);
    // gentle vertical eddies, stronger near rough terrain and in gusts
    out.y = 0.25 * Math.sin(this.t * 0.4 + x * 0.01 + z * 0.013) * (0.4 + g);
    return out;
  }
  update(dt, state) {
    this.t += dt;
    this.strength = state.wind;
    this.storm = state.storm;
    const spd = 7 * (0.6 + 0.6 * state.wind);
    this.offset.x += this.groundDir.x * spd * dt;
    this.offset.y += this.groundDir.y * spd * dt;
    U.uGustOffset.value.copy(this.offset);
    // clouds and their shadows sample at xz + offset, so the offset runs against the wind to carry
    // them with it (it used to run with it, and the clouds drifted upwind of the balloons)
    const cs = this.cloudSpd * (0.6 + 0.6 * state.wind) * (1 + 0.5 * this.storm);
    U.uCloudOffset.value.x -= this.cloudDir.x * cs * dt;
    U.uCloudOffset.value.y -= this.cloudDir.y * cs * dt;
    U.uWindDir.value.copy(this.groundDir);
    U.uWindStrength.value = this.strength;
  }
}
