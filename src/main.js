// Entry: boot, world generation behind a graphic loader, then the frame loop.
import * as THREE from 'three';
import { U, G, WORLD } from './core/shared.js';
import { makeNoise2D, makeNoise3D } from './core/noise.js';
import { Sky, cycleForHour } from './world/time.js';
import { SkyDome } from './world/skydome.js';
import { TerrainData } from './world/terrainGen.js';
import { Terrain } from './world/terrain.js';
import { TerrainShadow } from './world/terrainShadow.js';
import { Shadows } from './world/shadows.js';
import { Wind } from './world/wind.js';
import { Pipeline } from './core/pipeline.js';
import { Probe } from './world/probe.js';
import { Volumetrics } from './fx/volumetrics.js';
import { Rocks } from './world/rocks.js';
import { Hero } from './balloon/hero.js';
import { Input } from './core/input.js';
import { Cameras } from './core/cameras.js';

const canvas = document.getElementById('view');
const loadFill = document.getElementById('loadFill');
const loader = document.getElementById('loader');
const setProgress = p => { const h = 102 * Math.max(0, Math.min(1, p)); loadFill.setAttribute('y', 106 - h); loadFill.setAttribute('height', h); };
const tick = () => new Promise(r => setTimeout(r, 0));

function parseHash() {
  const o = {};
  for (const kv of location.hash.replace(/^#/, '').split('&')) {
    if (!kv) continue;
    const [k, v] = kv.split('=');
    o[k] = v === undefined ? true : decodeURIComponent(v);
  }
  return o;
}

async function boot() {
  const dbg = parseHash();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false });
  renderer.autoClear = false;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  G.renderer = renderer;
  setProgress(0.02); await tick();

  U.uNoise2D.value = makeNoise2D(256);
  setProgress(0.05); await tick();
  U.uNoise3D.value = makeNoise3D(64);
  setProgress(0.1); await tick();

  const data = new TerrainData();
  await data.generate(p => setProgress(0.1 + p * 0.55));
  G.terrainData = data;

  const scene = new THREE.Scene();
  G.scene = scene;
  const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 90000);
  G.camera = camera;

  const sky = new Sky();
  G.sky = sky;
  const dome = new SkyDome(renderer);
  scene.add(dome.mesh);
  const terrain = new Terrain(data);
  scene.add(terrain.group);
  const rocks = new Rocks(data);
  scene.add(rocks.group);
  G.rocks = rocks;
  setProgress(0.68); await tick();
  const hero = new Hero(scene, data, rocks, null);
  G.hero = hero;
  const tshadow = new TerrainShadow(renderer);
  const shadows = new Shadows(renderer);
  const wind = new Wind(U.uNoise2D.value);
  G.wind = wind;
  hero.flight.wind = wind;
  const input = new Input(canvas);
  const cams = new Cameras(camera, hero, data, rocks, input);
  G.cams = cams;
  input.onCamera = m => cams.setMode(m);
  const pipe = new Pipeline(renderer);
  const probe = new Probe(renderer);
  const vol = new Volumetrics(renderer);
  pipe.onResize = (W, H) => vol.setSize(W, H);
  pipe.hooks.volumetrics = rt => vol.render(rt, camera);
  let exposure = 1;
  setProgress(0.7); await tick();

  let pr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    pipe.setSize(w, h, pr);
  };
  window.addEventListener('resize', resize);
  resize();

  if (dbg.h !== undefined) sky.cycleT = cycleForHour(parseFloat(dbg.h));
  const fixedCam = dbg.cam ? dbg.cam.split(',').map(Number) : null;
  const fixedLook = dbg.look ? dbg.look.split(',').map(Number) : null;
  if (dbg.snow !== undefined) sky.snowCover = parseFloat(dbg.snow);
  if (dbg.mode !== undefined) cams.setMode(+dbg.mode);
  if (fixedCam) cams.fixed = (cam) => { cam.position.fromArray(fixedCam); cam.lookAt(new THREE.Vector3().fromArray(fixedLook || [0, 0, 0])); };
  // fast-forward the flight for testing: sim=seconds
  if (dbg.sim) {
    const n = Math.floor(parseFloat(dbg.sim) / 0.1);
    const st0 = sky.update(0, 1);
    for (let i = 0; i < n; i++) { const s = dbg.freeze ? st0 : sky.update(0.1, 1); wind.update(0.1, s); hero.update(0.1, i * 0.1, input, s); }
    if (dbg.h !== undefined) sky.cycleT = cycleForHour(parseFloat(dbg.h));
  }

  const clock = new THREE.Clock();
  let time = 0;
  const focus = new THREE.Vector3(), viewC = new THREE.Vector3(), farC = new THREE.Vector3();
  const look = {};
  window.__dbg = { G, U, sky, setHour: h => { sky.cycleT = cycleForHour(h); }, frames: 0,
    extra: () => ({ exposure: +exposure.toFixed(3), up: probe.up.toArray().map(v => +v.toFixed(4)), key: sky.keyColor.toArray().map(v => +v.toFixed(3)), alt: +hero.flight.p.y.toFixed(1), mode: hero.flight.mode, wp: hero.flight.wp }) };

  function frame() {
    const dt = Math.min(0.05, clock.getDelta());
    time += dt;
    const freeze = !!dbg.freeze;
    const st = sky.update(freeze ? 0 : dt, input.fast ? 14 : 1);
    wind.update(dt, st);
    U.uTime.value = time;
    U.uSunDir.value.copy(sky.sunDir); U.uMoonDir.value.copy(sky.moonDir);
    U.uKeyDir.value.copy(sky.keyDir); U.uKeyColor.value.copy(sky.keyColor);
    U.uKeyElev.value = st.keyElev; U.uKeyIsSun.value = st.keyIsSun;
    U.uSunColor.value.copy(sky.sunColor);
    U.uSkyAmb.value.copy(sky.skyAmb); U.uGroundAmb.value.copy(sky.groundAmb);
    U.uHaze.value = st.haze; U.uValleyFog.value = st.valleyFog; U.uSnow.value = st.snow;
    U.uFrost.value = st.frost; U.uWet.value = st.wet; U.uStorm.value = st.storm; U.uNight.value = st.night;
    U.uCloud.value = st.cloud; U.uPillars.value = st.pillars; U.uDiamond.value = st.diamondDust;
    U.uSunDogs.value = st.sunDogs; U.uMoonVis.value = st.moonVis; U.uSunVis.value = st.sunVis;
    U.uCloudOffset.value.x += dt * 9; U.uCloudOffset.value.y -= dt * 3;
    U.uCloudBase.value = 1500 - 520 * st.storm; U.uCloudTop.value = 2600 - 250 * st.storm;

    const fast = input.fast ? 14 : 1;
    hero.update(dt, time, input, st);
    cams.update(dt, time);

    dome.update(sky, camera);
    probe.update(st.snow);
    {
      // auto exposure from sky irradiance and the key light; nights stay darker than days
      const up = probe.up, k = sky.keyColor;
      const B = (0.2126 * up.r + 0.7152 * up.g + 0.0722 * up.b) + (0.2126 * k.r + 0.7152 * k.g + 0.0722 * k.b) * 0.3;
      const e = st.sunElev * 180 / Math.PI;
      const nightDim = 1 - 0.8 * Math.min(1, Math.max(0, (-e - 2) / 12));
      const target = st.grade.exp * 0.55 * nightDim / Math.pow(Math.max(B, 1e-5), 0.74);
      exposure += (target - exposure) * (window.__dbg.frames < 10 ? 1 : Math.min(1, dt * 2.5));
    }
    tshadow.update(window.__dbg.frames < 2);
    // cascades: basket detail, the area the camera looks at, wide for far balloons
    focus.copy(hero.basket.position).add(new THREE.Vector3(0, 3, 0));
    if (camera.position.distanceTo(focus) > 140) focus.copy(camera.position);
    camera.getWorldDirection(viewC).multiplyScalar(500).add(camera.position);
    viewC.lerp(camera.position, 0.45);
    viewC.y = Math.max(viewC.y, data.height(viewC.x, viewC.z));
    farC.copy(viewC);
    rocks.update(camera);
    shadows.render(scene, focus, viewC, farC);
    terrain.update(camera);
    pipe.render(scene, camera, { exposure, bloom: st.grade.bloom, sat: st.grade.sat, con: st.grade.con, sh: st.grade.sh, hi: st.grade.hi }, time);
    window.__dbg.frames++;
    requestAnimationFrame(frame);
  }
  setProgress(1);
  requestAnimationFrame(frame);
  setTimeout(() => loader.classList.add('gone'), 300);
}

boot().catch(e => { console.error(e); });
