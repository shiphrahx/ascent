// Fullscreen-triangle helper for screen passes.
import * as THREE from 'three';

const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const mesh = new THREE.Mesh(geo, null);
mesh.frustumCulled = false;
const scene = new THREE.Scene();
scene.add(mesh);

export const FSQ_VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export function fsMaterial(frag, uniforms = {}, opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms, vertexShader: opts.vertex || FSQ_VERT, fragmentShader: frag,
    depthTest: false, depthWrite: false,
    blending: opts.blending ?? THREE.NoBlending,
    transparent: opts.blending !== undefined,
    defines: opts.defines || {},
    ...(opts.extra || {}),
  });
}

export function renderFS(renderer, material, target) {
  mesh.material = material;
  renderer.setRenderTarget(target);
  renderer.render(scene, cam);
}

export function makeRT(w, h, o = {}) {
  const rt = new THREE.WebGLRenderTarget(w, h, {
    type: o.type ?? THREE.HalfFloatType,
    format: o.format ?? THREE.RGBAFormat,
    minFilter: o.minFilter ?? THREE.LinearFilter,
    magFilter: o.magFilter ?? THREE.LinearFilter,
    depthBuffer: !!o.depth,
    stencilBuffer: false,
    samples: o.samples || 0,
    wrapS: o.wrapS ?? THREE.ClampToEdgeWrapping,
    wrapT: o.wrapT ?? THREE.ClampToEdgeWrapping,
    generateMipmaps: false,
  });
  if (o.depthTexture) {
    rt.depthTexture = new THREE.DepthTexture(w, h);
    rt.depthTexture.type = o.depthType ?? THREE.FloatType;
    rt.depthTexture.format = THREE.DepthFormat;
    rt.depthTexture.minFilter = rt.depthTexture.magFilter = THREE.NearestFilter;
  }
  return rt;
}
