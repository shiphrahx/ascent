// Ambient cube from the sky LUT: six cosine-weighted irradiance values (+x -x +y -y +z -z),
// so every material's fill light matches the sky we actually see, including twilight hues.
// Read back asynchronously to drive auto-exposure.
import * as THREE from 'three';
import { U } from '../core/shared.js';
import { fsMaterial, renderFS, makeRT } from '../core/fsq.js';
import { AsyncReader } from '../core/readback.js';
import { DECL, NOISE, TERRAIN, SHADOW, LIGHT } from '../glsl/common.js';

const FRAG = /* glsl */`
${DECL}
${NOISE}
${TERRAIN}
${SHADOW}
${LIGHT}
varying vec2 vUv;
uniform vec3 uGroundAlbedo;
vec3 faceDir(int i){
  if (i == 0) return vec3(1,0,0); if (i == 1) return vec3(-1,0,0);
  if (i == 2) return vec3(0,1,0); if (i == 3) return vec3(0,-1,0);
  if (i == 4) return vec3(0,0,1); return vec3(0,0,-1);
}
vec3 skyIrr(vec3 n, vec3 groundL){
  vec3 t = abs(n.y) < 0.9 ? normalize(cross(n, vec3(0,1,0))) : vec3(1,0,0);
  vec3 b = cross(n, t);
  vec3 E = vec3(0);
  for (int j = 0; j < 8; j++) for (int i = 0; i < 12; i++) {
    float ct = (float(j) + 0.5) / 8.;            // cos(theta) uniform -> cosine weighting via ct
    float st = sqrt(1. - ct * ct);
    float ph = (float(i) + 0.5) / 12. * 6.2831853;
    vec3 d = normalize(n * ct + (t * cos(ph) + b * sin(ph)) * st);
    vec3 L = d.y > 0. ? skyLut(d) : groundL;
    E += L * ct;
  }
  return E / 96. * 6.2831853; // integral of L cos dω (uniform in cos θ: dω = dcosθ dφ)
}
void main(){
  int i = int(floor(vUv.x * 6.));
  // ground radiance: sunlit/moonlit ground reflecting key plus sky
  vec3 up = skyIrr(vec3(0,1,0), vec3(0));
  vec3 keyIrr = uKeyColor * max(uKeyDir.y, 0.) * 3.14159 / 0.53 * 0.75;
  vec3 groundL = uGroundAlbedo * (up + keyIrr) / 3.14159;
  vec3 E = skyIrr(faceDir(i), groundL);
  gl_FragColor = vec4(E / 3.14159 * 0.53, 1.);
}
`;

export class Probe {
  constructor(renderer) {
    this.renderer = renderer;
    this.rt = makeRT(6, 1, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.mat = fsMaterial(FRAG, Object.assign({}, U, { uGroundAlbedo: { value: new THREE.Color(0.42, 0.37, 0.32) } }));
    // read back to uniforms rather than sampled: every terrain texture unit is spoken for
    this.buf = new Float32Array(24);
    this.reader = new AsyncReader(renderer, this.rt);
    this.frame = 0;
    this.up = new THREE.Color(0.2, 0.25, 0.35);
    this.ok = false;
  }
  update(snow) {
    this.mat.uniforms.uGroundAlbedo.value.setRGB(0.42 + 0.4 * snow, 0.37 + 0.45 * snow, 0.32 + 0.52 * snow);
    renderFS(this.renderer, this.mat, this.rt);
    this.frame++;
    // the first read waits for the answer, so nothing renders unlit; after that it lands a frame or two late
    if (!this.ok) { this.renderer.readRenderTargetPixels(this.rt, 0, 0, 6, 1, this.buf); this.take(); }
    else if (this.reader.poll()) { this.buf.set(this.reader.buf); this.take(); }
  }
  take() {
    this.ok = true;
    const b = this.buf, a = U.uAmb.value;
    for (let i = 0; i < 6; i++) a[i].set(b[i * 4], b[i * 4 + 1], b[i * 4 + 2]);
    this.up.setRGB(b[8], b[9], b[10]);
  }
}
