// Single-bounce light off the ground, the part of UE's Lumen look that a sky cube can't give: warm
// tuff light filling shaded canyon walls, chimney undersides and the underside of the balloon.
// A 512x256 map over the core holds what each patch of ground sends back up (its albedo times the
// sun that reaches it, plus the sky it sees), in the same units as the ambient cube; its mip chain
// is the blur. Rebuilt as the sun moves; it's cheap.
import * as THREE from 'three';
import { U, WORLD } from '../core/shared.js';
import { fsMaterial, renderFS } from '../core/fsq.js';
import { DECL, NOISE, TERRAIN, SHADOW, ROCK } from '../glsl/common.js';

const FRAG = /* glsl */`
${DECL}
${NOISE}
${TERRAIN}
${SHADOW}
${ROCK}
varying vec2 vUv;
uniform vec4 uBounds;
void main(){
  vec2 xz = uBounds.xy + vUv * uBounds.zw;
  vec3 P = vec3(xz.x, heightAt(xz), xz.y);
  vec3 N = normalAt(xz);
  vec4 at = attrAt(xz);
  // the ground's colour, roughly as the terrain shader paints it: banded tuff on slopes, dry grass
  // and soil on the flats, silt by the river, snow when it's lying
  float slope = 1. - N.y;
  float flat_ = smoothstep(0.32, 0.12, slope);
  float soilAmt = flat_ * smoothstep(0.1, 0.25, at.g + 0.12 * (1. - slope));
  vec3 rock = tuffColor(P.y, at.r, xz, 0.5) * 0.85;
  vec3 soil = mix(vec3(0.50, 0.42, 0.32), vec3(0.42, 0.39, 0.26), smoothstep(0.3, 0.42, at.g));
  vec3 alb = mix(rock, soil, soilAmt);
  alb = mix(alb, vec3(0.40, 0.37, 0.32), smoothstep(0.1, 0.6, at.b));
  alb = mix(alb, vec3(0.88, 0.90, 0.94), sat(uSnow * flat_ * 1.2));
  float sh = keyHorizon(P) * terrainShadow(P + N * 2.5) * cloudShadow(P);
  vec4 ao = texture(uTerrAO, coreUV(xz));
  // the probe counts a reflected key light at 0.75 of the direct (see world/probe.js); kept the same
  // so this can stand in for the ambient cube's ground term
  vec3 R = alb * (uKeyColor * max(dot(N, uKeyDir), 0.) * sh * 0.75 + uAmb[2] * ao.a);
  gl_FragColor = vec4(R, 1.);
}
`;

export class Bounce {
  constructor(renderer, tier = 'high') {
    this.renderer = renderer;
    const C = WORLD.core;
    this.rt = new THREE.WebGLRenderTarget(512, 256, {
      type: THREE.HalfFloatType, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
      generateMipmaps: true, depthBuffer: false,
    });
    this.mat = fsMaterial(FRAG, Object.assign({}, U, { uBounds: { value: new THREE.Vector4(C.minX, C.minZ, C.sizeX, C.sizeZ) } }));
    U.uBounce.value = this.rt.texture;
    U.uBounceOn.value = tier === 'lite' ? 0 : 1;
    this.every = tier === 'high' ? 1 : 4;
    this.n = 0;
  }
  update() {
    if (!U.uBounceOn.value || this.n++ % this.every) return;
    // three rebuilds the mips after drawing into a target that asks for them
    renderFS(this.renderer, this.mat, this.rt);
  }
}
