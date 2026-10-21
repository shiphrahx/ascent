// Large-scale sky visibility and bent normals for the core terrain, from the heightmap, once at load.
// For every texel, horizons are found along 8 slices through it (16 directions, out to ~750 m) and
// the cosine-weighted visible sky is integrated per slice as GTAO does. Canyon floors and the feet
// of cliffs darken at the scale of the valley, not just in the 2 m creases SSAO can see; the bent
// normal points the ambient lookup at the open sky.
// Stored as rgb: how far the bent normal leans away from the ground's own normal (0.5 = not at all),
// a: visibility.
import * as THREE from 'three';
import { U, WORLD } from '../core/shared.js';
import { fsMaterial, renderFS, makeRT } from '../core/fsq.js';
import { DECL, NOISE, TERRAIN } from '../glsl/common.js';

const FRAG = /* glsl */`
${DECL}
${NOISE}
${TERRAIN}
varying vec2 vUv;
uniform vec4 uBounds;
uniform float uStep0, uGrow;
uniform int uSlices, uSteps;
// highest elevation angle seen from P along dir
float horizon(vec2 xz, float h0, vec2 dir){
  float tmax = -4., t = uStep0;
  for (int k = 0; k < 24; k++) {
    if (k >= uSteps) break;
    tmax = max(tmax, (heightAt(xz + dir * t) - h0) / t);
    t *= uGrow;
  }
  return atan(tmax);
}
void main(){
  vec2 xz = uBounds.xy + vUv * uBounds.zw;
  float h0 = heightAt(xz) + 0.5;
  vec3 n = normalAt(xz);
  float vis = 0.;
  vec3 bent = vec3(0.);
  for (int i = 0; i < 8; i++) {
    if (i >= uSlices) break;
    float a = (float(i) + 0.5) * 3.14159265 / float(uSlices);
    vec2 d = vec2(cos(a), sin(a));
    // the normal in this slice's plane (up, d): its length and its angle from up toward +d
    vec2 np = vec2(dot(n.xz, d), n.y);
    float ln = length(np), g = atan(np.x, np.y);
    // horizons as signed angles from up, clamped to the normal's own hemisphere
    float t2 = min(1.5707963 - horizon(xz, h0, d), g + 1.5707963);
    float t1 = max(-(1.5707963 - horizon(xz, h0, -d)), g - 1.5707963);
    float v = ln * 0.25 * (-cos(2. * t1 - g) + cos(g) + 2. * t1 * sin(g) - cos(2. * t2 - g) + cos(g) + 2. * t2 * sin(g));
    vis += v;
    float m = (t1 + t2) * 0.5;
    bent += vec3(d.x * sin(m), cos(m), d.y * sin(m)) * v;
  }
  vis /= float(uSlices);
  bent = length(bent) > 1e-4 ? normalize(bent) : n;
  gl_FragColor = vec4((bent - n) * 0.5 + 0.5, clamp(vis, 0., 1.));
}
`;

export class TerrainAO {
  constructor(renderer, tier = 'high') {
    const C = WORLD.core;
    // high matches the heightmap; the 890M and software rasterisers get a coarser, shorter search
    const w = tier === 'high' ? 2048 : tier === 'medium' ? 1024 : 512;
    this.rt = makeRT(w, w / 2, { type: THREE.UnsignedByteType });
    const mat = fsMaterial(FRAG, Object.assign({}, U, {
      uBounds: { value: new THREE.Vector4(C.minX, C.minZ, C.sizeX, C.sizeZ) },
      uStep0: { value: 2.5 }, uGrow: { value: tier === 'lite' ? 1.6 : tier === 'medium' ? 1.45 : 1.35 },
      uSlices: { value: tier === 'lite' ? 4 : 8 }, uSteps: { value: tier === 'lite' ? 12 : tier === 'medium' ? 16 : 20 },
    }));
    renderFS(renderer, mat, this.rt);
    mat.dispose();
    U.uTerrAO.value = this.rt.texture;
    // software rasterisers skip it: two more fetches a pixel is real money there
    U.uSkyVis.value = tier === 'lite' ? 0 : 1;
  }
}
