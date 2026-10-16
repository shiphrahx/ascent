// Physically based sky LUT (Rayleigh + Mie + ozone, planet shadow) and the sky dome:
// sun, cratered moon, stars, Milky Way, 22° halo and sun dogs.
import * as THREE from 'three';
import { U } from '../core/shared.js';
import { fsMaterial, renderFS, makeRT } from '../core/fsq.js';
import { COMMON } from '../glsl/common.js';

const LUT_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform vec3 uSun, uMoon;
uniform float uSunI, uMoonI, uStormL, uHazeL;
const float Re = 6360e3, Ra = 6420e3, Hr = 8000., Hm = 1200.;
const vec3 bR = vec3(5.802e-6, 13.558e-6, 33.1e-6);
const float bMs = 3.996e-6, bMe = 4.44e-6;
const vec3 bO = vec3(0.650e-6, 1.881e-6, 0.085e-6);
vec2 rs(vec3 o, vec3 d, float r){ float b = dot(o, d); float c = dot(o, o) - r*r; float h = b*b - c; if (h < 0.) return vec2(-1.); h = sqrt(h); return vec2(-b - h, -b + h); }
vec3 dens(float h){ return vec3(exp(-h / Hr), exp(-h / Hm) * uHazeL, max(0., 1. - abs(h - 25000.) / 15000.)); }
vec3 trans(vec3 p, vec3 L){
  vec2 pg = rs(p, L, Re);
  if (pg.x > 0.) return vec3(0.);
  float t = rs(p, L, Ra).y;
  float ds = t / 6.;
  vec3 od = vec3(0);
  for (int i = 0; i < 6; i++) { vec3 q = p + L * (float(i) + 0.5) * ds; od += dens(length(q) - Re) * ds; }
  return exp(-(bR * od.x + bMe * od.y + bO * od.z));
}
void main(){
  float az = vUv.x * 6.2831853;
  float el = vUv.y * vUv.y * 1.5707963;
  vec3 d = vec3(sin(az) * cos(el), sin(el), -cos(az) * cos(el));
  vec3 o = vec3(0., Re + 1100., 0.);
  float tmax = rs(o, d, Ra).y;
  float tg = rs(o, d, Re).x; if (tg > 0.) tmax = tg;
  const int N = 16;
  vec3 odv = vec3(0);
  vec3 sR = vec3(0), sM = vec3(0), mR = vec3(0), mM = vec3(0);
  float prev = 0.;
  for (int i = 0; i < N; i++) {
    float f = (float(i) + 1.) / float(N);
    float t1 = tmax * f * f;
    float ds = t1 - prev;
    float tm = (prev + t1) * 0.5;
    prev = t1;
    vec3 p = o + d * tm;
    vec3 de = dens(length(p) - Re);
    odv += de * ds;
    vec3 Tv = exp(-(bR * odv.x + bMe * odv.y + bO * odv.z));
    vec3 Ts = trans(p, uSun);
    sR += de.x * Tv * Ts * ds; sM += de.y * Tv * Ts * ds;
    if (uMoonI > 0.) { vec3 Tm = trans(p, uMoon); mR += de.x * Tv * Tm * ds; mM += de.y * Tv * Tm * ds; }
  }
  float mu = dot(d, uSun), mum = dot(d, uMoon);
  float pR = 3. / (16. * 3.14159) * (1. + mu * mu);
  float g = 0.76;
  float pM = 3. / (8. * 3.14159) * ((1. - g*g) * (1. + mu*mu)) / ((2. + g*g) * pow(1. + g*g - 2.*g*mu, 1.5));
  float pRm = 3. / (16. * 3.14159) * (1. + mum * mum);
  float pMm = 3. / (8. * 3.14159) * ((1. - g*g) * (1. + mum*mum)) / ((2. + g*g) * pow(1. + g*g - 2.*g*mum, 1.5));
  vec3 col = uSunI * (sR * bR * pR + sM * bMs * pM);
  // cheap multiple-scattering lift so twilight never goes dead
  col += uSunI * sR * bR * 0.045;
  col += uMoonI * (mR * bR * pRm + mM * bMs * pMm + mR * bR * 0.05);
  // overcast: flat grey light, a bit brighter toward the hidden sun
  float sunUp = smoothstep(-0.12, 0.25, uSun.y);
  vec3 grey = vec3(0.62, 0.66, 0.72) * (0.08 + 0.92 * sunUp) * (0.55 + 0.45 * smoothstep(-0.1, 0.6, d.y)) * (0.8 + 0.25 * pow(max(mu, 0.), 4.)) * 1.15;
  grey += vec3(0.008, 0.012, 0.02) * uMoonI * 200.;
  col = mix(col, grey, uStormL);
  col += vec3(0.0010, 0.0016, 0.0032) * (0.4 + 0.6 * d.y);
  gl_FragColor = vec4(col, 1.);
}
`;

const DOME_VERT = /* glsl */`
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const DOME_FRAG = /* glsl */`
${COMMON}
varying vec3 vDir;
uniform vec3 uGalPole;
float gauss(float x, float w){ return exp(-x * x / (w * w)); }
vec3 halo22(vec3 d){
  float th = acos(clamp(dot(d, uSunDir), -1., 1.));
  vec3 ring = vec3(gauss(th - 0.3800, 0.006), gauss(th - 0.3850, 0.0075), gauss(th - 0.3905, 0.010));
  ring += vec3(0.5) * gauss(th - 0.40, 0.03) * 0.25;
  // sun dogs: bright spots on the parhelic circle either side of the sun
  float se = asin(clamp(uSunDir.y, -1., 1.));
  float cd = (cos(0.3840) - sin(se) * sin(se)) / max(cos(se) * cos(se), 1e-3);
  float dAz = acos(clamp(cd, -1., 1.));
  float az = atan(d.x, -d.z), saz = atan(uSunDir.x, -uSunDir.z);
  float dl = az - saz; dl = atan(sin(dl), cos(dl));
  float de = asin(clamp(d.y, -1., 1.)) - se;
  vec3 dogs = vec3(0);
  for (int s = -1; s <= 1; s += 2) {
    float x = abs(dl) - dAz;
    if (float(s) * dl < 0.) continue;
    float v = gauss(de, 0.022);
    dogs += vec3(gauss(x + 0.004, 0.010), gauss(x - 0.002, 0.012), gauss(x - 0.010, 0.016)) * v * 2.2;
    dogs += vec3(0.8, 0.85, 1.0) * gauss(x - 0.05, 0.05) * gauss(de, 0.01) * 0.35 * step(0., x);
  }
  // faint parhelic circle
  vec3 circ = vec3(1.) * gauss(de, 0.004) * 0.08;
  return (ring * 0.5 + dogs + circ) * uSunDogs;
}
float craters(vec2 p){
  float c = 0.;
  for (int k = 0; k < 3; k++) {
    float sc = 5. + float(k) * 7.;
    vec2 q = p * sc;
    vec2 i = floor(q), f = fract(q);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(x, y);
      vec2 h = hash22(i + g + float(k) * 13.);
      vec2 r = g + h - f;
      float rad = 0.18 + 0.25 * hash12(i + g + 3.1);
      float dd = length(r) / rad;
      c += (smoothstep(1.0, 0.8, dd) * -0.35 + smoothstep(0.8, 1.0, dd) * smoothstep(1.25, 1.0, dd) * 0.25) * step(0.45, h.x) / (1. + float(k));
    }
  }
  return c;
}
void main(){
  vec3 d = normalize(vDir);
  vec3 dh = normalize(vec3(d.x, max(d.y, 0.0), d.z));
  vec3 col = skyLut(dh);
  float below = sat(-d.y * 12.);
  col *= mix(1., 0.75, below);
  float horizonExt = smoothstep(-0.01, 0.12, d.y);

  // stars and Milky Way
  float starVis = uNight * (1. - uStorm) * horizonExt * (1. - 0.8 * uCloud * 0.);
  if (starVis > 0.001) {
    vec3 sc = vec3(0);
    for (int L = 0; L < 2; L++) {
      float den = L == 0 ? 180. : 420.;
      vec3 p = d * den;
      vec3 cell = floor(p), f = fract(p);
      vec3 h = hash33(cell + float(L) * 71.);
      vec3 sp = 0.15 + h * 0.7;
      float dd = length(f - sp);
      float m = pow(hash13(cell + 7.7 + float(L)), L == 0 ? 14. : 22.);
      float tw = 0.75 + 0.25 * sin(uTime * (2. + 5. * h.z) + h.x * 40.);
      vec3 tint = mix(vec3(1.0, 0.82, 0.65), vec3(0.72, 0.84, 1.0), h.y);
      sc += tint * m * smoothstep(0.11, 0.0, dd) * tw * (L == 0 ? 24. : 12.);
    }
    float b = dot(d, uGalPole);
    float band = gauss(b, 0.20);
    vec3 q = d * 3.;
    float neb = vnoise3(q * 2.) * 0.6 + vnoise3(q * 5.) * 0.3 + vnoise3(q * 11.) * 0.1;
    float dust = smoothstep(0.45, 0.7, vnoise3(q * 3.3 + 2.)) * gauss(b - 0.03, 0.06);
    vec3 mw = mix(vec3(0.55, 0.62, 0.85), vec3(0.95, 0.85, 0.7), gauss(dot(d, normalize(vec3(-0.3, 0.2, 0.9))), 0.6));
    sc += mw * band * neb * (1. - dust * 0.85) * 0.09;
    col += sc * starVis * 0.0012;
  }

  // sun disc with limb darkening
  float cs = dot(d, uSunDir);
  float sr = 0.0105;
  float r = sqrt(max(0., 2. * (1. - cs))) / sr;
  if (r < 1.2) {
    float limb = 1. - 0.55 * (1. - sqrt(max(0., 1. - min(r, 1.) * min(r, 1.))));
    col += uSunColor * smoothstep(1.0, 0.92, r) * limb * 260. * (1. - uStorm * 0.97) * horizonExt;
  }
  // soft corona around the sun (heavily diffused in the storm)
  col += uSunColor * pow(max(cs, 0.), 900.) * 3.0 * (1. - uStorm) * horizonExt;

  // moon: lit hemisphere, maria and craters
  vec3 md = uMoonDir;
  float cm = dot(d, md);
  float mr = 0.0165;
  float rm = sqrt(max(0., 2. * (1. - cm))) / mr;
  if (rm < 1.05 && md.y > -0.05) {
    vec3 right = normalize(cross(md, vec3(0, 1, 0)));
    vec3 upv = cross(right, md);
    vec2 uv = vec2(dot(d, right), dot(d, upv)) / mr;
    float z = sqrt(max(0., 1. - dot(uv, uv)));
    vec3 n = right * uv.x + upv * uv.y - md * z;
    float lit = sat(dot(n, uSunDir) * 4. + 0.1);
    vec2 sph = uv * (1.2 - 0.2 * z);
    float maria = smoothstep(0.45, 0.62, vnoise(sph * 2.2 + 3.) * 0.7 + vnoise(sph * 5.) * 0.3);
    float alb = 0.75 - maria * 0.32 + craters(sph * 0.9) * 0.45 + (vnoise(sph * 24.) - 0.5) * 0.08;
    float edge = smoothstep(1.0, 0.96, rm);
    vec3 mc = vec3(1.0, 0.97, 0.92) * alb * lit * 2.2 * (0.3 + 0.7 * horizonExt);
    mc += vec3(0.02, 0.025, 0.04) * (1. - lit); // earthshine
    col = mix(col, mc + col * 0.3, edge * (1. - uStorm));
  }
  // moon glow
  col += vec3(0.55, 0.65, 0.9) * pow(max(cm, 0.), 600.) * 0.05 * uMoonVis * (1. - uStorm) * horizonExt;
  col += vec3(0.55, 0.65, 0.9) * pow(max(cm, 0.), 40.) * 0.004 * uMoonVis * (1. - uStorm);

  // ice-crystal optics on cold mornings
  if (uSunDogs > 0.001) col += halo22(d) * uSunColor * 0.25 * horizonExt;

  gl_FragColor = vec4(col, 1.);
}
`;

export class SkyDome {
  constructor(renderer) {
    this.renderer = renderer;
    this.lut = makeRT(192, 96, { wrapS: THREE.RepeatWrapping });
    U.uSkyLUT.value = this.lut.texture;
    this.lutMat = fsMaterial(LUT_FRAG, {
      uSun: { value: new THREE.Vector3() }, uMoon: { value: new THREE.Vector3() },
      uSunI: { value: 20 }, uMoonI: { value: 0 }, uStormL: { value: 0 }, uHazeL: { value: 1 },
    });
    const geo = new THREE.SphereGeometry(1, 64, 32);
    this.mat = new THREE.ShaderMaterial({
      uniforms: Object.assign({}, U, { uGalPole: { value: new THREE.Vector3(0.45, 0.35, -0.82).normalize() } }),
      vertexShader: DOME_VERT, fragmentShader: DOME_FRAG,
      side: THREE.BackSide, depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.scale.setScalar(70000);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    this.mesh.layers.enable(2);
  }
  update(sky, camera) {
    const u = this.lutMat.uniforms;
    u.uSun.value.copy(sky.sunDir); u.uMoon.value.copy(sky.moonDir);
    u.uSunI.value = 20;
    u.uMoonI.value = 0.13 * sky.state.moonVis + 0.012;
    u.uStormL.value = Math.min(1, sky.state.storm * 1.05);
    u.uHazeL.value = sky.state.haze;
    renderFS(this.renderer, this.lutMat, this.lut);
    this.mesh.position.copy(camera.position);
  }
}
