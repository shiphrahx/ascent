// "Shadow height" maps: for each ground texel, the height above which the key light is visible.
// One texture lookup then gives terrain-scale shadows to every material and the volumetrics.
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
uniform float uMaxDist, uStep0, uGrow;
void main(){
  vec2 xz = uBounds.xy + vUv * uBounds.zw;
  vec3 L = uKeyDir;
  float lh = length(L.xz);
  vec2 dir = L.xz / max(lh, 1e-4);
  float tanE = L.y / max(lh, 1e-4);
  float hs = -1e4;
  float t = uStep0;
  for (int i = 0; i < 72; i++) {
    if (t > uMaxDist) break;
    float h = heightAt(xz + dir * t) - t * tanE;
    hs = max(hs, h);
    t *= uGrow;
  }
  gl_FragColor = vec4(hs, 0., 0., 1.);
}
`;

export class TerrainShadow {
  constructor(renderer) {
    this.renderer = renderer;
    const C = WORLD.core, O = WORLD.outer;
    this.core = makeRT(1024, 512, { format: THREE.RedFormat, type: THREE.HalfFloatType });
    this.outer = makeRT(512, 512, { format: THREE.RedFormat, type: THREE.HalfFloatType });
    this.core.texture.minFilter = this.core.texture.magFilter = THREE.LinearFilter;
    U.uTerrShadow.value = this.core.texture;
    U.uTerrShadowOuter.value = this.outer.texture;
    this.matCore = fsMaterial(FRAG, Object.assign({}, U, {
      uBounds: { value: new THREE.Vector4(C.minX, C.minZ, C.sizeX, C.sizeZ) },
      uMaxDist: { value: 9000 }, uStep0: { value: 7 }, uGrow: { value: 1.105 },
    }));
    this.matOuter = fsMaterial(FRAG, Object.assign({}, U, {
      uBounds: { value: new THREE.Vector4(O.minX, O.minZ, O.sizeX, O.sizeZ) },
      uMaxDist: { value: 40000 }, uStep0: { value: 200 }, uGrow: { value: 1.08 },
    }));
    this.last = new THREE.Vector3(9, 9, 9);
    this.frame = 0;
  }
  update(force) {
    // only recompute when the light has moved a little
    const L = U.uKeyDir.value;
    if (!force && L.distanceToSquared(this.last) < 1e-7) return;
    this.last.copy(L);
    this.frame++;
    renderFS(this.renderer, this.matCore, this.core);
    if (force || (this.frame & 3) === 0) renderFS(this.renderer, this.matOuter, this.outer);
  }
}
