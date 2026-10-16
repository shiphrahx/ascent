// Burner flame: blue roots, white-hot core, orange tongues licking upward; additive HDR.
import * as THREE from 'three';
import { VCOMMON } from '../glsl/common.js';
import { U } from '../core/shared.js';

function flameGeo(seg = 18, rows = 26) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * Math.PI * 2;
      pos.push(Math.cos(a), v, Math.sin(a));
      uv.push(i / seg, v);
    }
  }
  const W = seg + 1;
  for (let j = 0; j < rows; j++) for (let i = 0; i < seg; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
export const FLAME_GEO = flameGeo();

const VERT = /* glsl */`
${VCOMMON}
uniform float uI, uLen, uWid, uSeed;
uniform vec3 uBend;
varying vec2 vUv;
varying float vI;
varying vec3 vW, vNrm;
#ifdef FLEET
attribute vec4 aFlame; // x intensity, y seed
#endif
void main(){
  float I = uI, seed = uSeed;
#ifdef FLEET
  I = aFlame.x; seed = aFlame.y;
#endif
  float v = position.y;
  float t = uTime;
  float L = mix(0.25, uLen, I) * (0.92 + 0.08 * sin(t * 23. + seed * 7.));
  float prof = (0.06 + 0.55 * pow(sin(3.14159 * pow(v, 0.55)), 1.2) * (1. - 0.35 * v)) * uWid * mix(0.5, 1., I);
  float lick = sin(v * 9. - t * 18. + atan(position.z, position.x) * 2. + seed) * 0.12 + sin(v * 15. - t * 27. + seed * 3.) * 0.08;
  vec3 p = vec3(position.x * prof * (1. + lick * v), v * L, position.z * prof * (1. + lick * v));
  // turbulent wander and lean with relative wind
  p.x += (sin(t * 11. + v * 5. + seed) * 0.06 + sin(t * 17. - v * 7.) * 0.04) * v * L * 0.3;
  p.z += (cos(t * 13. + v * 4. + seed) * 0.06) * v * L * 0.3;
  p += uBend * v * v * L;
#ifdef FLEET
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.);
#else
  vec4 wp = modelMatrix * vec4(p, 1.);
#endif
  vUv = uv; vI = I; vW = wp.xyz;
  vNrm = normalize(mat3(modelMatrix) * vec3(position.x, 0.2, position.z));
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const FRAG = /* glsl */`
${VCOMMON}
uniform float uBright;
varying vec2 vUv;
varying float vI;
varying vec3 vW, vNrm;
void main(){
  if (vI < 0.01) discard;
  float v = vUv.y;
  vec3 V = normalize(cameraPosition - vW);
  float edge = pow(abs(dot(normalize(vNrm), V)), 0.6);
  float n = texture(uNoise2D, vec2(vUv.x * 2. + uTime * 0.3, v * 0.9 - uTime * 2.4)).r;
  float n2 = texture(uNoise2D, vec2(vUv.x * 4. - uTime * 0.5, v * 1.7 - uTime * 3.7)).g;
  float tongues = smoothstep(v * 0.95 - 0.05, v * 0.95 + 0.25, n * 0.75 + n2 * 0.45);
  vec3 blue = vec3(0.12, 0.30, 1.0) * 3.0;
  vec3 white = vec3(1.0, 0.92, 0.75) * 9.0;
  vec3 orange = vec3(1.0, 0.42, 0.08) * 6.0;
  vec3 red = vec3(0.9, 0.16, 0.03) * 2.0;
  vec3 c = v < 0.1 ? mix(blue * 0.6, blue, v / 0.1) : (v < 0.28 ? mix(blue, white, smoothstep(0.1, 0.28, v)) : (v < 0.6 ? mix(white, orange, smoothstep(0.28, 0.6, v)) : mix(orange, red, smoothstep(0.6, 1., v))));
  float a = edge * (v < 0.3 ? 1. : tongues) * smoothstep(1.0, 0.75, v) * smoothstep(0.0, 0.04, v);
  a *= mix(0.4, 1., vI);
  gl_FragColor = vec4(c * a * uBright, 1.);
}
`;

export function flameMaterial(fleet = false) {
  return new THREE.ShaderMaterial({
    uniforms: Object.assign({}, U, { uI: { value: 0 }, uLen: { value: 3.2 }, uWid: { value: 0.3 }, uSeed: { value: Math.random() * 10 }, uBend: { value: new THREE.Vector3() }, uBright: { value: 1 } }),
    vertexShader: VERT, fragmentShader: FRAG,
    defines: fleet ? { FLEET: 1 } : {},
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

export function makeFlame(len = 3.2, wid = 0.3, bright = 1) {
  const m = flameMaterial();
  m.uniforms.uLen.value = len; m.uniforms.uWid.value = wid; m.uniforms.uBright.value = bright;
  const mesh = new THREE.Mesh(FLAME_GEO, m);
  mesh.frustumCulled = false;
  mesh.layers.set(4);
  mesh.renderOrder = 10;
  return mesh;
}
