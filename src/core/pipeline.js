// Frame pipeline: sky LUT -> terrain shadow heights -> cascades -> HDR scene -> volumetrics -> transparents -> post.
import * as THREE from 'three';
import { U, G } from './shared.js';
import { makeRT } from './fsq.js';
import { Post } from '../post/post.js';

export class Pipeline {
  constructor(renderer) {
    this.renderer = renderer;
    this.post = new Post(renderer);
    this.scale = 1;
    this.main = null;
    this.hooks = { volumetrics: null, transparent: null };
  }
  setSize(w, h, pr) {
    this.pr = pr;
    const W = Math.max(2, Math.floor(w * pr * this.scale)), H = Math.max(2, Math.floor(h * pr * this.scale));
    if (this.main && this.main.width === W && this.main.height === H) return;
    if (this.main) this.main.dispose();
    this.main = makeRT(W, H, { depth: true, depthTexture: true });
    this.post.setSize(W, H);
    this.W = W; this.H = H;
    this.onResize && this.onResize(W, H);
  }
  render(scene, camera, look, time) {
    const r = this.renderer;
    camera.layers.set(0);
    r.setRenderTarget(this.main);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, false);
    r.render(scene, camera);
    if (this.hooks.volumetrics) this.hooks.volumetrics(this.main);
    if (this.hooks.transparent) {
      r.setRenderTarget(this.main);
      camera.layers.set(4);
      r.render(scene, camera);
      camera.layers.set(0);
    }
    this.post.render(this.main.texture, look, time);
  }
}
