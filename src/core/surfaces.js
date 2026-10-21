// Photo-scanned ground materials (CC0, Poly Haven), embedded in the page as JPEG data URLs and
// decoded at boot into two texture arrays shared by every material:
//   uSurfAlb : albedo (sRGB, a soft dose of AO baked in)
//   uSurfNH  : OpenGL normal xy in rg, height in b
// Layers: 0 tuff (sandstone_cracks), 1 steppe (grass_path_2), 2 soil (gravelly_sand), 3 plowed (brown_mud_dry).
import * as THREE from 'three';
import { U, G } from './shared.js';
import tuffAlb from '../assets/tuff_alb.jpg';
import tuffNH from '../assets/tuff_nh.jpg';
import steppeAlb from '../assets/steppe_alb.jpg';
import steppeNH from '../assets/steppe_nh.jpg';
import soilAlb from '../assets/soil_alb.jpg';
import soilNH from '../assets/soil_nh.jpg';
import plowedAlb from '../assets/plowed_alb.jpg';
import plowedNH from '../assets/plowed_nh.jpg';

const N = 1024;

async function pixels(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, N, N);
  return g.getImageData(0, 0, N, N).data;
}

async function arrayTexture(urls, srgb) {
  const data = new Uint8Array(N * N * 4 * urls.length);
  for (let i = 0; i < urls.length; i++) data.set(await pixels(urls[i]), i * N * N * 4);
  const t = new THREE.DataArrayTexture(data, N, N, urls.length);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  // as much anisotropy as the GPU has: from the balloon nearly all the ground is seen at a slant
  t.generateMipmaps = true; t.anisotropy = G.renderer ? G.renderer.capabilities.getMaxAnisotropy() : 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export async function loadSurfaces() {
  U.uSurfAlb.value = await arrayTexture([tuffAlb, steppeAlb, soilAlb, plowedAlb], true);
  U.uSurfNH.value = await arrayTexture([tuffNH, steppeNH, soilNH, plowedNH], false);
}
