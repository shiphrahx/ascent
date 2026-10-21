// River: a ribbon of water with planar reflections (rendered from a mirrored camera),
// ripples that run with the flow, the shallow bed showing through, and thin ice at the edges.
import * as THREE from 'three';
import { U, WORLD } from '../core/shared.js';
import { COMMON, VCOMMON, WIND } from '../glsl/common.js';
import { makeRT } from '../core/fsq.js';
import { RIVER } from './layout.js';

const VERT = /* glsl */`
${VCOMMON}
attribute vec2 aFlow;   // flow direction (xz)
attribute vec2 aRiver;  // x: across -1..1, y: distance along
varying vec3 vWorld;
varying vec2 vFlow, vRiver;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.);
  vWorld = wp.xyz; vFlow = aFlow; vRiver = aRiver;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const FRAG = /* glsl */`
${COMMON}
${WIND}
uniform sampler2D tReflect;
uniform mat4 uTexMat;
uniform float uIce, uReflOn;
varying vec3 vWorld;
varying vec2 vFlow, vRiver;
vec2 flowN(vec2 p, float spd, float sc){
  vec2 f = normalize(vFlow + 1e-4);
  vec2 side = vec2(-f.y, f.x);
  vec2 q = vec2(dot(p, side), dot(p, f));
  float t = uTime * spd;
  vec2 a = texture(uNoise2D, (q + vec2(0., -t)) / sc).rg - 0.5;
  vec2 b = texture(uNoise2D, (q * 1.7 + vec2(3.1, -t * 1.6)) / sc).gr - 0.5;
  vec2 n = a + b * 0.6;
  return n.x * side + n.y * f;
}
void main(){
  vec3 P = vWorld;
  vec3 V = normalize(cameraPosition - P);
  float dist = length(cameraPosition - P);
  // ripples: running with the current, plus wind-stirred catspaws in gusts
  vec2 n = flowN(P.xz, 0.9, 7.) * 0.26 + flowN(P.xz, 1.6, 2.2) * 0.14 + flowN(P.xz * 1.37 + 11.3, 2.4, 0.83) * 0.08 * (1. - smoothstep(20., 120., dist));
  float gust = gustAt(P.xz);
  n += (texture(uNoise2D, (P.xz - uGustOffset * 1.3) / 3.).rg - 0.5) * gust * 0.5 * uWindStrength;
  n *= mix(1., 0.35, smoothstep(80., 600., dist));
  vec3 N = normalize(vec3(n.x, 1., n.y));
  // ice along the banks on cold days: ragged edge, cracks, a frosty skin
  float across = abs(vRiver.x);
  float edgeN = texture(uNoise2D, P.xz / 6.).r * 0.25 + texture(uNoise2D, P.xz / 1.7).g * 0.12;
  float ice = smoothstep(0.62, 0.7, across + edgeN - (1. - uIce) * 0.45) * step(0.01, uIce);
  // reflection
  vec4 rc = uTexMat * vec4(P, 1.);
  vec2 ruv = rc.xy / rc.w + N.xz * 0.035;
  // without the mirrored pass (lite mode) the sky stands in for the reflection
  vec3 refl = uReflOn > 0.5 ? texture(tReflect, ruv).rgb : skyLut(reflect(-V, N)) * 0.9;
  float cosT = max(dot(N, V), 0.);
  float F = 0.02 + 0.98 * pow(1. - cosT, 5.);
  // The Kizilirmak is silty: the bed vanishes within half a metre and the water itself scatters a
  // dull olive-brown. Light slips under the shallows at the bank, so the edge isn't a hard line.
  float depth = max(0., P.y - heightAt(P.xz));
  vec3 bed = mix(vec3(0.34, 0.30, 0.24), vec3(0.45, 0.40, 0.33), texture(uNoise2D, P.xz / 2.).r);
  bed *= 0.75 + 0.35 * texture(uNoise2D, P.xz * 1.3).b;
  vec3 absorb = exp(-depth * vec3(2.6, 2.9, 3.6));
  float shL = keyShadow(P, vec3(0, 1, 0));
  Surf sb; sb.albedo = bed; sb.N = vec3(0, 1, 0); sb.rough = 1.; sb.spec = 0.; sb.ao = 1.; sb.wrap = 0.; sb.sss = 0.;
  vec3 bedLit = shadeSurf(sb, P, V, shL) * absorb;
  vec3 silt = vec3(0.16, 0.14, 0.09);
  vec3 scatter = (ambCube(vec3(0, 1, 0)) * 0.8 + uKeyColor * max(uKeyDir.y, 0.) * shL * 0.5) * silt * (1. - absorb);
  float shallow = smoothstep(0.0, 0.35, depth);
  vec3 col = mix(bedLit + scatter, refl, F * mix(0.35, 1., shallow));
  // sun glint
  vec3 H = normalize(uKeyDir + V);
  float gl = pow(max(dot(N, H), 0.), 600.) * 60. + pow(max(dot(N, H), 0.), 80.) * 0.6;
  col += uKeyColor * gl * keyShadow(P, vec3(0, 1, 0)) * (1. - ice);
  // ice: translucent pale blue sheet with dark cracks
  if (ice > 0.) {
    vec2 cp = P.xz * 0.9;
    float cr = texture(uNoise2D, cp / 4.).b;
    float crack = smoothstep(0.86, 0.95, cr);
    vec3 iceC = mix(vec3(0.72, 0.8, 0.86), vec3(0.88, 0.92, 0.96), texture(uNoise2D, cp).r);
    iceC *= 1. - crack * 0.45;
    Surf si; si.albedo = iceC; si.N = normalize(vec3(n.x * 0.1, 1., n.y * 0.1)); si.rough = 0.25; si.spec = 0.9; si.ao = 1.; si.wrap = 0.2; si.sss = 0.2;
    vec3 icol = shadeSurf(si, P, V, keyShadow(P, vec3(0, 1, 0)));
    icol = mix(icol, refl, 0.12 + 0.2 * F);
    col = mix(col, icol, ice * 0.92);
  }
  // snow resting on the ice
  col = mix(col, vec3(0.9, 0.93, 0.97) * (ambCube(vec3(0,1,0)) + uKeyColor * max(uKeyDir.y, 0.)) , ice * uSnow * 0.8);
  col = applyHaze(col, P);
  gl_FragColor = vec4(col, 1.);
}
`;

export class River {
  constructor(scene, renderer) {
    this.renderer = renderer;
    // ribbon along the river centreline
    const pos = [], flow = [], riv = [], idx = [];
    let along = 0;
    const W = 13;
    for (let i = 0; i < RIVER.length; i++) {
      const a = RIVER[Math.max(0, i - 1)], b = RIVER[Math.min(RIVER.length - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      const fx = dx / l, fz = dz / l;
      if (i > 0) along += Math.hypot(RIVER[i][0] - RIVER[i - 1][0], RIVER[i][1] - RIVER[i - 1][1]);
      for (let k = 0; k <= 8; k++) {
        const s = -1 + k / 4;
        pos.push(RIVER[i][0] - fz * s * W, WORLD.riverY, RIVER[i][1] + fx * s * W);
        flow.push(fx, fz); riv.push(s, along);
      }
    }
    for (let i = 0; i < RIVER.length - 1; i++) for (let k = 0; k < 8; k++) {
      const a = i * 9 + k, b = a + 1, c = a + 9, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
    g.setAttribute('aRiver', new THREE.Float32BufferAttribute(riv, 2));
    g.setIndex(idx);
    g.computeBoundingBox(); g.computeBoundingSphere();
    this.box = g.boundingBox.clone().expandByScalar(5);
    this.mat = new THREE.ShaderMaterial({
      uniforms: Object.assign({}, U, { tReflect: { value: null }, uTexMat: { value: new THREE.Matrix4() }, uIce: { value: 1 }, uReflOn: { value: 1 } }),
      vertexShader: VERT, fragmentShader: FRAG,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.reflect = true;
    this.rcam = new THREE.PerspectiveCamera();
    this.rcam.layers.set(2);
    this.rt = null;
    this._v = new THREE.Vector3(); this._t = new THREE.Vector3(); this._r = new THREE.Matrix4(); this._f = new THREE.Frustum(); this._m = new THREE.Matrix4();
  }
  setSize(W, H) {
    if (this.rt) this.rt.dispose();
    this.rt = makeRT(Math.max(2, Math.floor(W / 2)), Math.max(2, Math.floor(H / 2)), { depth: true });
    this.frame = 0;
    this.mat.uniforms.tReflect.value = this.rt.texture;
  }
  // mirrored camera render; skipped when the river is out of view
  render(scene, camera, st) {
    this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._f.setFromProjectionMatrix(this._m);
    this.visible = this._f.intersectsBox(this.box);
    this.mesh.visible = this.visible;
    // ice is thickest after cold nights and through the storm, thins in the afternoon sun
    this.mat.uniforms.uIce.value = Math.min(1, st.frost * 0.9 + st.snow * 0.6 + st.night * 0.5 + 0.15);
    this.mat.uniforms.uReflOn.value = this.reflect ? 1 : 0;
    if (!this.visible || !this.reflect) return;
    // the reflection only needs refreshing every other frame
    if ((this.frame++ & 1) && this.rendered) return;
    this.rendered = true;
    const y = WORLD.riverY;
    const cam = camera, rc = this.rcam;
    this._v.copy(cam.position); this._v.y = 2 * y - this._v.y;
    this._r.extractRotation(cam.matrixWorld);
    this._t.set(0, 0, -1).applyMatrix4(this._r).add(cam.position);
    this._t.y = 2 * y - this._t.y;
    rc.position.copy(this._v);
    rc.up.set(0, 1, 0).applyMatrix4(this._r); rc.up.y = -rc.up.y;
    rc.lookAt(this._t);
    rc.near = cam.near; rc.far = cam.far;
    rc.projectionMatrix.copy(cam.projectionMatrix);
    rc.projectionMatrixInverse.copy(cam.projectionMatrixInverse);
    rc.updateMatrixWorld();
    const tm = this.mat.uniforms.uTexMat.value;
    tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    tm.multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);
    const r = this.renderer;
    U.uClipY.value = y - 0.1;
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, false);
    r.render(scene, rc);
    U.uClipY.value = -1e9;
  }
}
