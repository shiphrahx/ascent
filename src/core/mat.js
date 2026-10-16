// Material factory: every lit material gets a matching depth-only twin for the shadow pass.
import * as THREE from 'three';
import { U } from './shared.js';

const DEPTH_FRAG = /* glsl */`
varying float vDepthAlpha;
void main(){ if (vDepthAlpha < 0.5) discard; gl_FragColor = vec4(1.0); }
`;

export const casters = [];

export function makeMaterial(o) {
  const uniforms = Object.assign({}, U, o.uniforms || {});
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: o.vertex,
    fragmentShader: o.fragment,
    defines: Object.assign({}, o.defines || {}),
    side: o.side ?? THREE.FrontSide,
    transparent: !!o.transparent,
    blending: o.blending ?? THREE.NormalBlending,
    depthWrite: o.depthWrite ?? true,
    depthTest: o.depthTest ?? true,
  });
  if (o.shadow !== false) {
    mat.userData.depthMat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: o.vertex,
      fragmentShader: DEPTH_FRAG,
      defines: Object.assign({ DEPTH_PASS: 1 }, o.defines || {}),
      side: o.shadowSide ?? THREE.DoubleSide,
    });
  }
  return mat;
}

export function addCaster(mesh) {
  if (mesh.material.userData.depthMat) {
    casters.push(mesh);
    mesh.layers.enable(1);
  }
  return mesh;
}

// Snippet: shaders that support the depth pass write vDepthAlpha (1 = solid).
export const DEPTH_VARY = /* glsl */`
#ifdef DEPTH_PASS
varying float vDepthAlpha;
#endif
`;
