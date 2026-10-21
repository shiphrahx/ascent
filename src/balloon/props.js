// Shared prop material (object-space procedural surfaces) and small geometry helpers.
// Material ids: 0 wicker, 1 leather, 2 steel, 3 quilted cover, 4 rubber hose, 5 rope,
// 6 wood, 7 brass, 8 suede upright cover, 9 cloth, 10 skin, 11 hair/wool, 12 boots, 13 camera body, 14 knit
import * as THREE from 'three';
import { VCOMMON, COMMON } from '../glsl/common.js';
import { makeMaterial } from '../core/mat.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const VERT = /* glsl */`
${VCOMMON}
attribute float aMat;
attribute vec3 aCol;
attribute vec2 aUV2;
varying vec3 vWorld, vN, vObj, vCol;
varying float vMat, vSeed;
varying vec2 vUV2;
#ifdef DEPTH_PASS
varying float vDepthAlpha;
#endif
#ifdef SKINNED_PARTS
uniform mat4 uBones[24];
attribute float aBone;
#endif
void main(){
  vec4 lp = vec4(position, 1.);
  vec3 ln = normal;
#ifdef SKINNED_PARTS
  mat4 B = uBones[int(aBone)];
  lp = B * lp; ln = mat3(B) * ln;
#endif
  vSeed = 0.;
#ifdef USE_INSTANCING
  lp = instanceMatrix * lp; ln = mat3(instanceMatrix) * ln;
  vSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
#endif
  vec4 wp = modelMatrix * lp;
  vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * ln); vObj = position; vMat = aMat; vCol = aCol; vUV2 = aUV2;
#ifdef DEPTH_PASS
  vDepthAlpha = 1.;
#endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */`
${COMMON}
uniform vec3 uLocalLightPos, uLocalLightCol;
varying vec3 vWorld, vN, vObj, vCol;
varying float vMat, vSeed;
varying vec2 vUV2;
void main(){
  vec3 P = vWorld;
  if (P.y < uClipY) discard;
  vec3 V = normalize(cameraPosition - P);
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  float m = floor(vMat + 0.5);
  vec3 alb = vCol;
  float rough = 0.8, spec = 0.1, ao = 1., sss = 0.;
  vec2 uv = vUV2;
  if (m == 0.) {
    // wicker: vertical stakes with horizontal weavers passing over and under
    float row = uv.y / 0.022;
    float ri = floor(row);
    float stake = uv.x / 0.055;
    float over = mod(ri + floor(stake), 2.);
    float rf = fract(row), sf = fract(stake);
    float bump = sin(rf * 3.14159) * (0.6 + 0.4 * sin(sf * 3.14159 + over * 3.14159));
    float gap = smoothstep(0.0, 0.12, rf) * smoothstep(1.0, 0.88, rf);
    float var = texture(uNoise2D, vec2(ri * 0.173, uv.x * 0.3)).r;
    alb = mix(vec3(0.46, 0.30, 0.15), vec3(0.66, 0.47, 0.25), var) * (0.55 + 0.45 * gap) * (0.85 + 0.25 * bump);
    vec3 T = normalize(cross(N, vec3(0, 1, 0)) + 1e-4);
    N = normalize(N + vec3(0, 1, 0) * (rf - 0.5) * 0.8 * gap + T * (sf - 0.5) * 0.25);
    ao = 0.6 + 0.4 * gap;
    rough = 0.75; spec = 0.15;
  } else if (m == 1.) {
    // leather trim: suede with stitching and scuffs
    float n = texture(uNoise2D, vObj.xz * 3. + vObj.y).r;
    alb = mix(vec3(0.22, 0.12, 0.06), vec3(0.34, 0.19, 0.09), n);
    float stitch = step(0.5, fract(uv.x * 30.)) * (1. - smoothstep(0.004, 0.009, abs(fract(uv.y) - 0.5) * 0.08));
    alb = mix(alb, vec3(0.75, 0.68, 0.55), stitch * 0.6);
    rough = 0.6; spec = 0.25;
  } else if (m == 2.) {
    alb = vec3(0.30, 0.31, 0.33) * (0.85 + 0.2 * texture(uNoise2D, vObj.xy * 4.).r);
    rough = 0.22; spec = 1.6;
  } else if (m == 3.) {
    // quilted cylinder cover: diamond stitch pattern
    float a = atan(vObj.z - vCol.z * 0., vObj.x) ;
    vec2 q = vec2(uv.x * 9., uv.y * 7.);
    vec2 d = abs(fract(vec2(q.x + q.y, q.x - q.y) * 0.5) - 0.5);
    float seam = 1. - smoothstep(0.02, 0.06, min(d.x, d.y));
    alb = vCol * (1. - seam * 0.45);
    N = normalize(N + (vec3(d.x, 0., d.y) - 0.25) * 0.3 * (1. - seam));
    ao = 1. - seam * 0.3; rough = 0.8; spec = 0.15;
  } else if (m == 4.) {
    alb = vec3(0.05, 0.05, 0.055); rough = 0.45; spec = 0.4;
  } else if (m == 5.) {
    float tw = sin((uv.x * 60. + uv.y * 6.283 * 3.)) * 0.5 + 0.5;
    alb = mix(vec3(0.55, 0.47, 0.34), vec3(0.75, 0.68, 0.52), tw); ao = 0.75 + 0.25 * tw;
  } else if (m == 6.) {
    alb = mix(vec3(0.30, 0.20, 0.12), vec3(0.42, 0.30, 0.18), texture(uNoise2D, vec2(vObj.x * 0.5, vObj.z * 8.)).r);
  } else if (m == 7.) {
    alb = vec3(0.75, 0.55, 0.22); rough = 0.3; spec = 1.0;
  } else if (m == 8.) {
    alb = vCol * (0.9 + 0.15 * texture(uNoise2D, vObj.xy * 6.).r); rough = 0.85;
  } else if (m == 9.) {
    // coat cloth: soft weave
    float w = texture(uNoise2D, vObj.xy * 9. + vObj.z * 3.).g;
    alb = vCol * (0.85 + 0.25 * w); rough = 0.9; sss = 0.05;
  } else if (m == 10.) {
    alb = vCol; rough = 0.6; spec = 0.2; sss = 0.35;
  } else if (m == 11.) {
    float w = texture(uNoise2D, vObj.xy * 14. + vObj.z * 5.).g;
    alb = vCol * (0.75 + 0.4 * w); rough = 0.95;
  } else if (m == 12.) {
    alb = vCol; rough = 0.5; spec = 0.35;
  } else if (m == 13.) {
    alb = vCol; rough = 0.35; spec = 0.8;
  } else if (m == 14.) {
    // knit: ribbed rows
    float r = sin(vObj.y * 180.) * 0.5 + 0.5;
    alb = vCol * (0.75 + 0.3 * r); rough = 0.95;
  }
  vec3 emit = vec3(0);
  if (m >= 15. && m <= 16.) {
    // tuff ashlar masonry in world space: coursed blocks, recessed mortar
    vec3 aN = abs(N);
    float hcoord = aN.x > aN.z ? P.z : P.x;
    float vcoord = P.y;
    if (m == 16. || aN.y > 0.7) { hcoord = P.x; vcoord = P.z; }
    float row = floor(vcoord / 0.32);
    float hb = hcoord / 0.55 + hash12(vec2(row, 3.1)) * 2.;
    float bi = floor(hb);
    vec2 f = vec2(fract(hb), fract(vcoord / 0.32));
    float mortar = smoothstep(0.0, 0.06, min(f.x, 1. - f.x)) * smoothstep(0.0, 0.1, min(f.y, 1. - f.y));
    float bv = hash12(vec2(bi, row));
    vec3 stone = mix(vec3(0.70, 0.60, 0.46), vec3(0.80, 0.70, 0.55), bv);
    stone = mix(stone, vec3(0.62, 0.48, 0.36), step(0.85, bv) * 0.6);
    stone *= 0.85 + 0.2 * texture(uNoise2D, P.xz * 0.7 + P.y * 0.3).r;
    alb = mix(vec3(0.42, 0.37, 0.32), stone, mortar) * vCol;
    ao = 0.65 + 0.35 * mortar;
    N = normalize(N + (vec3(f.x - 0.5, f.y - 0.5, 0.) * 0.15) * mortar);
    if (m == 16.) {
      // flat roofs: packed earth over slabs, a little straw
      alb = mix(vec3(0.46, 0.38, 0.30), vec3(0.56, 0.47, 0.37), texture(uNoise2D, P.xz * 0.4).r) * vCol;
      ao = 1.;
    }
    rough = 0.85;
  } else if (m == 17.) {
    float plank = fract(vObj.x * 6. + vObj.z * 6.);
    alb = mix(vec3(0.20, 0.12, 0.07), vec3(0.30, 0.19, 0.11), smoothstep(0.1, 0.3, plank) * texture(uNoise2D, vObj.xy * vec2(2., 0.3)).r) * vCol;
  } else if (m == 18.) {
    // windows: dark glass by day, warm lamplight after dusk in most houses
    alb = vec3(0.03, 0.035, 0.04); rough = 0.3; spec = 0.35;
    float lit = step(0.32, fract(vSeed * 13.7 + floor(vObj.x * 3. + vObj.z * 3.) * 0.31)) * smoothstep(0.3, 0.75, uNight);
    float flick = 0.9 + 0.1 * sin(uTime * 5. + vSeed * 40.);
    emit = vec3(1.0, 0.55, 0.22) * lit * flick * 2.6;
  }
  // snow settles on the basket rim and shoulders
  float snow = uSnow * smoothstep(0.6, 0.9, N.y) * (m == 1. || m == 0. || m == 9. || m >= 15. ? 1. : 0.5) * step(0.35, texture(uNoise2D, vObj.xz * 5.).r + uSnow * 0.4);
  if (m >= 15. && m <= 16.) { alb *= 1. - 0.3 * uWet * (1. - snow); }
  alb = mix(alb, vec3(0.92, 0.94, 0.98), snow);
  Surf s; s.albedo = alb; s.N = N; s.rough = rough; s.spec = spec; s.ao = ao; s.wrap = 0.3; s.sss = sss;
  float sh = keyShadow(P, N);
  vec3 col = shadeSurf(s, P, V, sh);
  // burner light
  vec3 tl = uLocalLightPos - P;
  float d2 = dot(tl, tl);
  col += alb * uLocalLightCol * (max(dot(N, tl * inversesqrt(d2)), 0.) * 0.8 + 0.2) / (1. + d2 * 1.5);
  col += emit;
  col = applyHaze(col, P);
  gl_FragColor = vec4(col, litAlpha(col));
}
`;

export function propMaterial(skinned) {
  const uniforms = { uLocalLightPos: { value: new THREE.Vector3() }, uLocalLightCol: { value: new THREE.Color(0, 0, 0) } };
  if (skinned) uniforms.uBones = { value: Array.from({ length: 24 }, () => new THREE.Matrix4()) };
  return makeMaterial({ vertex: VERT, fragment: FRAG, side: THREE.DoubleSide, uniforms, defines: skinned ? { SKINNED_PARTS: 1 } : {} });
}

// tag a geometry with material id, colour and default uv2 (and optional bone)
export function tag(g, mat, col = [1, 1, 1], uvFn = null, bone = 0) {
  g = g.index ? g.toNonIndexed() : g;
  const n = g.attributes.position.count;
  const m = new Float32Array(n).fill(mat);
  const c = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const b = new Float32Array(n).fill(bone);
  const p = g.attributes.position;
  for (let i = 0; i < n; i++) {
    c[i * 3] = col[0]; c[i * 3 + 1] = col[1]; c[i * 3 + 2] = col[2];
    if (uvFn) { const r = uvFn(p.getX(i), p.getY(i), p.getZ(i), i); uv[i * 2] = r[0]; uv[i * 2 + 1] = r[1]; }
    else if (g.attributes.uv) { uv[i * 2] = g.attributes.uv.getX(i); uv[i * 2 + 1] = g.attributes.uv.getY(i); }
  }
  g.setAttribute('aMat', new THREE.BufferAttribute(m, 1));
  g.setAttribute('aCol', new THREE.BufferAttribute(c, 3));
  g.setAttribute('aUV2', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aBone', new THREE.BufferAttribute(b, 1));
  if (!g.attributes.normal) g.computeVertexNormals();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'aMat', 'aCol', 'aUV2', 'aBone'].includes(k)) g.deleteAttribute(k);
  return g;
}
export function merge(list) {
  const g = mergeGeometries(list, false);
  g.computeBoundingSphere();
  return g;
}

export function tube(points, radius, seg = 24, rseg = 8, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed, 'centripetal');
  return new THREE.TubeGeometry(curve, seg, radius, rseg, closed);
}
export function cyl(r0, r1, h, seg = 16, x = 0, y = 0, z = 0, open = false) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 1, open);
  g.translate(x, y + h / 2, z);
  return g;
}
