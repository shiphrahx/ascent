// Fine relief for the core, high only, built once at load on the GPU: the 2.5 m heightmap's shape at
// 1.25 m, with the erosion a heightmap that coarse can't hold. Strata ledges (the same bands the
// tuff is painted with), gullies running down the faces, and scree aprons banked against the feet of
// the cliffs. From a balloon, cliffs between 150 m and a kilometre are most of the frame, and they
// read as smooth slopes with texture on them without it.
//
// Stored where the core normals were (uNormCore): rgb the fine normal, a the height change (0.5 is
// none, square-root coded over ±16 m), so the lit shaders, already at the texture unit limit, need no new map. Mipmapped:
// the terrain's vertex shader takes coarser mips toward each LOD switch, so the detail fades into the
// next LOD's instead of popping.
import * as THREE from 'three';
import { U, WORLD } from '../core/shared.js';
import { fsMaterial, renderFS, makeRT } from '../core/fsq.js';
import { DECL, NOISE, TERRAIN } from '../glsl/common.js';

const HEAD = /* glsl */`
${DECL}
${NOISE}
${TERRAIN}
varying vec2 vUv;
uniform vec4 uBounds;
`;

// pass 1: the height change in metres. On a steep face a heightmap can only move the surface
// sideways by raising or lowering it, so gullies and ledges are worked out as how far in or out the
// face should sit and turned into height through the slope.
const DETAIL = HEAD + /* glsl */`
float steepAt(vec2 xz){ return smoothstep(0.3, 0.7, 1. - normalAt(xz).y); }
// Catmull-Rom through the core heightmap: the bilinear surface left 2.5 m facets on every cliff
float cr(float a, float b, float c, float d, float t){ return b + 0.5 * t * (c - a + t * (2. * a - 5. * b + 4. * c - d + t * (3. * (b - c) + d - a))); }
float bicubicH(vec2 xz){
  ivec2 sz = textureSize(uHeightCore, 0), mx = sz - 1;
  vec2 p = coreUV(xz) * vec2(sz) - 0.5, f = fract(p);
  ivec2 i = ivec2(floor(p));
  float r[4];
  for (int j = 0; j < 4; j++) {
    float v[4];
    for (int k = 0; k < 4; k++) v[k] = texelFetch(uHeightCore, clamp(i + ivec2(k - 1, j - 1), ivec2(0), mx), 0).r;
    r[j] = cr(v[0], v[1], v[2], v[3], f.x);
  }
  return cr(r[0], r[1], r[2], r[3], f.y);
}
void main(){
  vec2 xz = uBounds.xy + vUv * uBounds.zw;
  float h = heightAt(xz);
  vec3 N = normalAt(xz);
  float steep = smoothstep(0.3, 0.7, 1. - N.y);
  float tanS = min(sqrt(max(1. - N.y * N.y, 0.)) / max(N.y, 0.05), 5.);
  // smooth the facets away where the heightmap's own shape is all there is
  float d = (bicubicH(xz) - h) * coreMask(xz);
  // ledges: the harder of the 9.5 m strata (as ROCK's tuffColor bands them) stand a metre and a half
  // proud of the face, the softer ones are cut back
  float b = (h + 6. * texture(uNoise2D, xz / 900.).r + 2.5 * texture(uNoise2D, xz / 140.).g) / 9.5;
  float f = fract(b), hard = step(0.5, hash12(vec2(floor(b), 5.3)));
  float out_ = (hard * 1.5 - (1. - hard) * 0.8) * smoothstep(0., 0.12, f) * smoothstep(1., 0.8, f);
  // gullies: ridged noise across the face and stretched down it, runnels about 14 m apart, 2.5 m deep
  vec2 w = abs(N.xz); w /= w.x + w.y + 1e-4;
  float g = texture(uNoise2D, vec2(xz.y / 14., h / 80.)).r * w.x + texture(uNoise2D, vec2(xz.x / 14., h / 80.) + 0.37).r * w.y;
  out_ -= smoothstep(0.5, 0.95, 1. - abs(2. * g - 1.)) * 2.5;
  d += out_ * tanS * steep;
  // talus: scree piles up at its angle of rest (about 37 degrees) against the cliff above
  vec2 dn = N.xz / max(length(N.xz), 1e-3);
  float fill = 0.;
  for (int k = 1; k <= 6; k++) {
    float t = float(k) * 2.5;
    vec2 q = xz - dn * t;
    fill = max(fill, (heightAt(q) - t * 0.75 - 1. - h) * steepAt(q));
  }
  d += min(fill, 4.) * 0.6 * (1. - steep);
  gl_FragColor = vec4(clamp(d, -15.9, 15.9), 0., 0., 1.);
}
`;

// pass 2: normals of the fine surface, and the height change packed alongside
const PACK = HEAD + /* glsl */`
uniform highp sampler2D tDetail;
uniform float uCell;
float fineH(ivec2 q){
  ivec2 mx = textureSize(tDetail, 0) - 1;
  q = clamp(q, ivec2(0), mx);
  vec2 xz = uBounds.xy + (vec2(q) + 0.5) * uCell;
  return heightAt(xz) + texelFetch(tDetail, q, 0).r;
}
void main(){
  ivec2 q = ivec2(gl_FragCoord.xy);
  vec3 n = normalize(vec3(fineH(q - ivec2(1, 0)) - fineH(q + ivec2(1, 0)), 2. * uCell, fineH(q - ivec2(0, 1)) - fineH(q + ivec2(0, 1))));
  // the height change, square-root coded over ±16 m: fine where it's small, room for deep gullies
  float d = texelFetch(tDetail, q, 0).r;
  gl_FragColor = vec4(n * 0.5 + 0.5, 0.5 + 0.5 * sign(d) * sqrt(abs(d) / 16.));
}
`;

export class TerrainFine {
  constructor(renderer) {
    const C = WORLD.core, w = C.resX * 2, h = C.resZ * 2;
    const bounds = { value: new THREE.Vector4(C.minX, C.minZ, C.sizeX, C.sizeZ) };
    const detail = makeRT(w, h, { type: THREE.FloatType, format: THREE.RedFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    const m1 = fsMaterial(DETAIL, Object.assign({}, U, { uBounds: bounds }));
    renderFS(renderer, m1, detail);
    this.rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.UnsignedByteType, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
      generateMipmaps: true, depthBuffer: false, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
    });
    const m2 = fsMaterial(PACK, Object.assign({}, U, { uBounds: bounds, tDetail: { value: detail.texture }, uCell: { value: C.sizeX / w } }));
    renderFS(renderer, m2, this.rt);
    m1.dispose(); m2.dispose(); detail.dispose();
    U.uNormCore.value = this.rt.texture;
    U.uTerrFine.value = 1;
  }
}
