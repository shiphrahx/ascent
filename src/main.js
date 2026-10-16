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
import { defineFacades, sculpt, Landmarks } from './world/landmarks.js';
import { Village } from './world/village.js';
import { River } from './world/river.js';
import { Vegetation } from './world/vegetation.js';
import { Particles } from './fx/particles.js';
import { Birds } from './life/birds.js';
import { Horses } from './life/horses.js';
import { Sound } from './audio/sound.js';
import { Hero } from './balloon/hero.js';
import { Fleet } from './balloon/fleet.js';
import { Crew } from './balloon/crew.js';
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
  const facades = defineFacades();
  sculpt(data, facades);
  data.buildTextures();

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
  const rocks = new Rocks(data, facades);
  scene.add(rocks.group);
  const landmarks = new Landmarks(scene, data, facades);
  rocks.addCollider(landmarks.castle);
  const village = new Village(scene, data, rocks);
  G.village = village;
  const river = new River(scene, renderer);
  const veg = new Vegetation(scene, data, rocks, village);
  G.veg = veg;
  const parts = new Particles(scene, data, village);
  G.parts = parts;
  const horses = new Horses(scene, data, rocks);
  G.rocks = rocks;
  setProgress(0.68); await tick();
  const hero = new Hero(scene, data, rocks, null);
  G.hero = hero;
  new Crew(hero);
  const birds = new Birds(scene, data, facades, hero);
  const tshadow = new TerrainShadow(renderer);
  const shadows = new Shadows(renderer);
  const wind = new Wind(U.uNoise2D.value);
  G.wind = wind;
  hero.flight.wind = wind;
  const fleet = new Fleet(scene, data, rocks, wind);
  fleet.hero = hero; hero.flight.fleet = fleet; G.fleet = fleet;
  const input = new Input(canvas);
  const cams = new Cameras(camera, hero, data, rocks, input);
  cams.fleet = fleet;
  G.cams = cams;
  input.onCamera = m => cams.setMode(m);
  const sound = new Sound();
  input.onMute = () => sound.toggleMute();
  input.onFirstGesture = () => sound.start();
  window.addEventListener('pointerdown', () => sound.start(), { once: true });
  const pipe = new Pipeline(renderer);
  const probe = new Probe(renderer);
  const vol = new Volumetrics(renderer);
  pipe.onResize = (W, H) => { vol.setSize(W, H); river.setSize(W, H); };
  pipe.hooks.volumetrics = dbg.novol ? null : rt => vol.render(rt, camera);
  pipe.hooks.transparent = true;
  let exposure = 1;
  setProgress(0.7); await tick();

  let pr = Math.min(window.devicePixelRatio || 1, 2);
  // high-density displays start a little under native and adapt from there
  pipe.scale = pr > 1.4 ? 0.8 : 1;
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
  if (dbg.at) {
    const f = { church: facades[0], dove1: facades[1], dove2: facades[2] }[dbg.at];
    const dist = parseFloat(dbg.d || 45), up = parseFloat(dbg.up || 12);
    if (f) cams.fixed = (cam) => { cam.position.set(f.x + f.nx * dist + f.tx * dist * 0.3, f.floorY + up, f.z + f.nz * dist + f.tz * dist * 0.3); cam.lookAt(f.x, f.floorY + f.H * 0.4, f.z); };
    else if (dbg.at === 'bridge') cams.fixed = (cam) => { const b = village.bridge; cam.position.set(b.x + Math.cos(b.ang) * 70 + 20, 22, b.z + Math.sin(b.ang) * 70); cam.lookAt(b.x, 6, b.z); };
    else if (dbg.at === 'village') cams.fixed = (cam) => { const c = landmarks.castle; cam.position.set(c.x + 260, c.y + 70, c.z + 180); cam.lookAt(c.x + 60, c.y - 10, c.z + 30); };
    else if (dbg.at === 'orchard') cams.fixed = (cam) => { const o = { x: 560, z: 230 }; cam.position.set(o.x + 90, data.height(o.x + 90, o.z + 60) + 14, o.z + 60); cam.lookAt(o.x, data.height(o.x, o.z) + 2, o.z); };
    else if (dbg.at === 'poplars') cams.fixed = (cam) => { cam.position.set(300, 14, 330); cam.lookAt(270, 10, 200); };
    else if (dbg.at === 'vines') cams.fixed = (cam) => { cam.position.set(780, data.height(780, -60) + 25, -60); cam.lookAt(680, data.height(680, -150), -150); };
    else if (dbg.at === 'horses') cams.fixed = (cam) => { const h = horses.list[0].p; cam.position.set(h.x + 18, data.height(h.x + 18, h.y + 10) + 3, h.y + 10); cam.lookAt(h.x, data.height(h.x, h.y) + 1, h.y); };
    else if (dbg.at === 'birds') cams.fixed = (cam) => { const f = facades[1]; cam.position.set(f.x + f.nx * 120, f.floorY + 50, f.z + f.nz * 120); cam.lookAt(f.x + f.nx * 50, f.floorY + 40, f.z + f.nz * 50); };
    else if (dbg.at === 'castle') cams.fixed = (cam) => { const c = landmarks.castle; cam.position.set(c.x + 160, c.y + 60, c.z + 120); cam.lookAt(c.x, c.y + 25, c.z); };
  }
  if (fixedCam) cams.fixed = (cam) => { cam.position.fromArray(fixedCam); cam.lookAt(new THREE.Vector3().fromArray(fixedLook || [0, 0, 0])); };
  // fast-forward the flight for testing: sim=seconds
  if (dbg.sim) {
    const n = Math.floor(parseFloat(dbg.sim) / 0.1);
    const st0 = sky.update(0, 1);
    for (let i = 0; i < n; i++) { const s = dbg.freeze ? st0 : sky.update(0.1, 1); wind.update(0.1, s); hero.update(0.1, i * 0.1, input, s); fleet.update(0.1, i * 0.1, camera); }
    if (dbg.h !== undefined) sky.cycleT = cycleForHour(parseFloat(dbg.h));
  }

  const clock = new THREE.Clock();
  let time = 0;
  const focus = new THREE.Vector3(), viewC = new THREE.Vector3(), farC = new THREE.Vector3();
  const look = {};
  const loop = { phase: null, fade: 0 };
  window.__dbg = { G, U, sky, setHour: h => { sky.cycleT = cycleForHour(h); }, frames: 0,
    extra: () => ({ fps: +perf.fps.toFixed(1), ms: +perf.ms.toFixed(1), scale: pipe.scale, W: pipe.W, H: pipe.H, exposure: +exposure.toFixed(3), up: probe.up.toArray().map(v => +v.toFixed(4)), key: sky.keyColor.toArray().map(v => +v.toFixed(3)), alt: +hero.flight.p.y.toFixed(1), mode: hero.flight.mode, wp: hero.flight.wp, pos: [Math.round(hero.flight.p.x), Math.round(hero.flight.p.z)], agl: Math.round(hero.flight.p.y - data.height(hero.flight.p.x, hero.flight.p.z)), clr: +hero.flight.clearance.toFixed(1), defl: +hero.deflate.toFixed(2) }) };

  const perf = { acc: 0, n: 0, fps: 60, t: 0, ms: 16 };
  function frame() {
    const rawDt = clock.getDelta();
    const dt = Math.min(0.05, rawDt);
    // adaptive resolution: hold ~50+ fps without visibly dropping quality
    perf.acc += rawDt; perf.n++; perf.t += rawDt;
    if (perf.t > 2) {
      perf.ms = perf.acc / perf.n * 1000; perf.fps = 1000 / perf.ms;
      if (window.__dbg.frames > 120 && !dbg.fixres) {
        const old = pipe.scale;
        if (perf.ms > 21 && pipe.scale > 0.6) pipe.scale = Math.max(0.6, pipe.scale - 0.08);
        else if (perf.ms < 13.5 && pipe.scale < 1) pipe.scale = Math.min(1, pipe.scale + 0.05);
        if (old !== pipe.scale) pipe.setSize(window.innerWidth, window.innerHeight, pr);
      }
      perf.acc = 0; perf.n = 0; perf.t = 0;
    }
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

    hero.update(dt, time, input, st);
    // journey loop: once the envelope is down, fade into morning fog and start again at the launch field
    {
      const F = hero.flight;
      const u = pipe.post.comp.uniforms;
      if (!loop.phase && ((F.mode === 'landed' && hero.deflate >= 1) || F.modeT > 1500)) loop.phase = 'out';
      if (loop.phase === 'out') {
        loop.fade = Math.min(1, loop.fade + dt / 3);
        if (loop.fade >= 1) { F.reset(); hero.deflate = 0; cams.inited = false; cams.shot = null; loop.phase = 'in'; }
      } else if (loop.phase === 'in') {
        loop.fade = Math.max(0, loop.fade - dt / 3.5);
        if (loop.fade <= 0) loop.phase = null;
      }
      // the veil takes the colour of the fog at this hour
      const a = sky.skyAmb;
      u.uFadeColor.value.setRGB(Math.min(1, 0.55 + a.r), Math.min(1, 0.58 + a.g), Math.min(1, 0.64 + a.b));
      u.uFade.value = loop.fade * loop.fade * (3 - 2 * loop.fade);
    }
    cams.update(dt, time);
    fleet.update(dt, time, camera);
    parts.update(dt, st, wind);
    birds.update(dt, time);
    horses.update(dt, time, hero, parts);
    sound.update(dt, st, hero, fleet, cams.mode, camera);
    // cold breath from the crew on each exhale
    if (hero.crew) for (const P of hero.crew.people) {
      P.puffT = (P.puffT || 0) - dt;
      if (P.exhale > 0.55 && P.puffT <= 0 && P.mouthWorld) {
        P.puffT = 0.16;
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(hero.basket.quaternion);
        parts.puff(P.mouthWorld, fwd.multiplyScalar(0.35).add(new THREE.Vector3(hero.flight.v.x * 0.0, 0.05, 0)), 1);
      }
    }
    // heat shimmer above the burner
    {
      const u = pipe.post.comp.uniforms;
      const fl = hero.flameI;
      if (fl > 0.02 && cams.mode !== 1 || fl > 0.02) {
        const a = new THREE.Vector3().copy(hero.burnerWorld).add(new THREE.Vector3(0, -0.6, 0));
        const b = a.clone().add(new THREE.Vector3(0, 2.4, 0));
        const pa = a.clone().project(camera), pb = b.clone().project(camera);
        if (pa.z < 1 && pa.z > -1) {
          const sa = new THREE.Vector2(pa.x * 0.5 + 0.5, pa.y * 0.5 + 0.5), sb = new THREE.Vector2(pb.x * 0.5 + 0.5, pb.y * 0.5 + 0.5);
          const dir = sb.clone().sub(sa); dir.x *= camera.aspect;
          const len = dir.length();
          u.uHeat.value[0].set(sa.x, sa.y, fl * Math.min(1, len * 6), Math.max(0.01, len));
          u.uHeatUp.value[0].copy(dir.normalize());
        } else u.uHeat.value[0].z = 0;
      } else u.uHeat.value[0].z = 0;
    }

    dome.update(sky, camera);
    probe.update(st.snow);
    {
      // auto exposure from sky irradiance and the key light; nights stay darker than days
      const up = probe.up, k = sky.keyColor;
      const B = (0.2126 * up.r + 0.7152 * up.g + 0.0722 * up.b) + (0.2126 * k.r + 0.7152 * k.g + 0.0722 * k.b) * 0.3 * Math.min(1, Math.max(0.15, sky.keyDir.y * 4 + 0.15));
      const e = st.sunElev * 180 / Math.PI;
      const nightDim = 1 - 0.7 * Math.min(1, Math.max(0, (-e - 2) / 12));
      const target = st.grade.exp * 0.55 * nightDim / Math.pow(Math.max(B, 1e-5), 0.74);
      exposure += (target - exposure) * (window.__dbg.frames < 10 ? 1 : Math.min(1, dt * 2.5));
      U.uGlowComp.value = 1 / (1 + 0.14 * exposure);
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
    veg.update(camera);
    if (!dbg.noshadow || window.__dbg.frames < 3) shadows.render(scene, focus, viewC, farC);
    terrain.update(camera);
    if (!dbg.norefl) river.render(scene, camera, st);
    pipe.render(scene, camera, { exposure, bloom: st.grade.bloom, sat: st.grade.sat, con: st.grade.con, sh: st.grade.sh, hi: st.grade.hi }, time);
    window.__dbg.frames++;
    requestAnimationFrame(frame);
  }
  setProgress(1);
  requestAnimationFrame(frame);
  setTimeout(() => loader.classList.add('gone'), 300);
}

boot().catch(e => { console.error(e); });
