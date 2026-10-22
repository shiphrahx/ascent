import * as THREE from 'three';
import tuffURL from '../assets/materials/procedural/tuff-albedo.png';
import soilURL from '../assets/materials/procedural/soil-albedo.png';
import tuffSurfaceURL from '../assets/materials/procedural/tuff-surface.png';
import soilSurfaceURL from '../assets/materials/procedural/soil-surface.png';
import masonryURL from '../assets/materials/procedural/masonry-albedo.png';
import masonrySurfaceURL from '../assets/materials/procedural/masonry-surface.png';

// Data URLs are bundled into the standalone HTML; startup waits for decoding.
const pending=[];
function texture(url,color=true){
 const map=new THREE.Texture();
 map.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;
 map.wrapS=map.wrapT=THREE.RepeatWrapping;
 map.anisotropy=16;
 map.minFilter=THREE.LinearMipmapLinearFilter;
 pending.push(new Promise((resolve,reject)=>{
  const image=new Image();
  image.onload=()=>{map.image=image;map.needsUpdate=true;resolve();};
  image.onerror=()=>reject(new Error('Embedded material texture could not be decoded'));
  image.src=url;
 }));
 return map;
}
export const tuffAlbedo=texture(tuffURL);
export const soilAlbedo=texture(soilURL);
export const tuffSurface=texture(tuffSurfaceURL,false),soilSurface=texture(soilSurfaceURL,false);
export const masonryAlbedo=texture(masonryURL),masonrySurface=texture(masonrySurfaceURL,false);
tuffAlbedo.name='Cappadocia tuff albedo';soilAlbedo.name='Valley soil albedo';
tuffSurface.name='Tuff roughness / height / cavity';soilSurface.name='Soil roughness / height / cavity';
masonryAlbedo.name='Cut tuff masonry albedo';masonrySurface.name='Masonry roughness / height / cavity';
export const materialAssets={tuff:tuffAlbedo,soil:soilAlbedo,tuffSurface,soilSurface,masonry:masonryAlbedo,masonrySurface};
export const materialsReady=Promise.all(pending);
