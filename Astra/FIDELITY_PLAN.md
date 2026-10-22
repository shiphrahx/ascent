# Astra — Visual Fidelity Plan (target: Unreal Engine 5 look)

Based on a code review plus a 13 s screen recording of the current build (hero balloon chase camera, valley, morning light).

## How to work

- Follow `AGENTS.md`: run from `Astra/`, rebuild `Ascent.html` with `npm run build`, keep the `Co-authored-by: Codex` trailer.
- **One task = one commit.** After each: `npm test`, `npm run test:graphics`, `npm run test:temporal`, and before/after captures from the **same camera and hour**. Look at them yourself before committing.
- **Performance budget:** the Radeon 890M must hold 60 fps at 1440×900 (DPR 1). Nothing may make it slower without a tier switch.
- **Add quality tiers first** (Phase 0) so expensive features can be `high` only.

## What the recording shows (worst first)

1. Terrain reads as **smooth clay or sand dunes**, not layered volcanic tuff. Fairy chimneys look like soft dough.
2. **Flat grey lighting**: low contrast, no warm sun on rock, blue-grey shadows, no bounce light.
3. **Ragged, streaky shadow edges** close up.
4. **Distance has no depth**: far hills fade into the same grey; no blue aerial haze.
5. River is a **flat pale ribbon with hard edges**; snow patches look like **pasted stickers**; trees are **sparse sticks**; all fleet balloons share **one pattern**.
6. About **1 in 3 recorded frames is a duplicate**: the game may be near 20 fps at 2848×1590. Confirm with the in-game timer.

---

## Phase 0 — Tiers and measurement

**0.1 Quality tiers.** Detect GPU like a tier switch: `high` (discrete GPUs), `medium` (integrated, e.g. 890M), `lite` (software). Every later feature declares what it does per tier.

**0.2 Frame pacing test.** Extend `benchmark.mjs` to log every frame's time during a scripted flight that turns left and right along the valley. Report median, p95, p99 and the count of frames over 25 ms. Run at DPR 1 and at the recording's resolution. Record a baseline here.

**0.3 Flicker test.** Capture 5 s at 60 steps/s with the camera sliding slowly; score frame-to-frame luminance change not explained by the smooth trend, over the whole frame and a cliff crop. Record a baseline.

---

## Phase 1 — Landforms (biggest gap)

### 1.1 Tuff terrain, not dunes
File: `src/core.js` (`rawGround` and the river-aligned grid), `src/geology.js`
- Add **strata terracing**: quantise height into bands of 4–12 m with noise-varied thickness, then blend back partially so slopes become ledges and short cliffs.
- Add **drainage erosion**: ridged noise or a cheap flow-accumulation pass at build time, carving V-shaped gullies down every slope into the river.
- Make cliff faces **steep** (near vertical where bands are hard rock) with **talus aprons** at their feet.
- Plateaus: flat caps with sharp rims (mesas), not domes.
- Densify the grid where it's seen most: 2–4 m within ~800 m of the flight path, coarser beyond.

### 1.2 The far landscape
- Replace the 24 km flat plane (240 m segments) with a **real far terrain**: a coarse heightmap with ridged silhouettes, rendered as LOD rings around the camera.
- The 4 km detailed strip must blend into it with no visible seam.

### 1.3 Fairy chimneys and formations
- Sharper, more varied silhouettes: tall cones, mushroom caps with dark basalt tops, multi-headed columns, cones with carved openings.
- Visible **colour bands** and vertical erosion rills.
- **Cluster** them in valleys and along cliff feet (dozens, instanced), not a few isolated ones.

**Phase 1 done when:** from the chase camera, no slope reads as a smooth dome, and captures show ledges, gullies and cliffs at every distance.

---

## Phase 2 — Materials

- **Colour bands** following strata height: cream, pale ochre, pinkish, grey.
- **Triplanar mapping** on steep faces; slope-based blend of rock, soil and dry grass.
- **Macro variation** (large-scale colour noise) so the land isn't one beige.
- Detail normals and roughness that respond to grazing light.
- **Decision for the owner:** the project generates textures procedurally. CC0 photo-scanned textures (e.g. Poly Haven) would raise realism a lot. Ask before switching; if staying procedural, use multi-scale fields and real cavity/AO in the maps.

---

## Phase 3 — Lighting

### 3.1 Sun and sky balance
- Remove the grey wash: the `HemisphereLight` fill plus fixed exposure flatten everything. Use the sky PMREM as the only ambient, and give the sun proper intensity and warm colour at low angles.
- Add **auto exposure** (luminance histogram, clamped), so the scene isn't pinned to fixed exposure values.

### 3.2 Large-scale occlusion and bounce
- Precompute **sky visibility** from the terrain heightmap (horizon angles) so canyons and valley floors darken at large scale. Apply to ambient and reflections.
- Add a cheap **single-bounce** term: a low-res texture of sunlit ground radiance, blurred, added to shaded surfaces facing it. Warm rock light should fill shaded canyon walls.

### 3.3 Terrain shadows past the cascades
- Shadows stop at 1.9 km. Add a **heightmap horizon shadow** (one lookup per pixel) so distant ridges shadow each other, combined with the cascades nearby.

---

## Phase 4 — Shadows

File: `src/lighting.js`
- **Refresh every cascade every frame** on `high` (they refresh at ~10 Hz and ~4.5 Hz now, which steps as the sun moves). On lower tiers, blend old and new maps instead of jumping.
- Fix the **ragged edges**: higher-res near cascades on `high` (4096), and replace `PCFSoftShadowMap` with a proper filter (Poisson PCF with rotated blue noise, or PCSS on `high`). Tune normal bias per cascade.
- Check three's CSM texel snapping holds while the camera moves; test with Phase 0.3.

---

## Phase 5 — Atmosphere

- Replace `FogExp2` (one grey colour) with **height fog + aerial perspective** coloured by the sky model: distance turns blue and lighter, with warm in-scatter toward the sun.
- Shaded valleys should stay cooler in the haze than sunlit slopes.
- Keep the existing clouds (they're the strongest part); make their shadows on the ground move with them.

---

## Phase 6 — Scene details

- **River:** varying width, natural banks, wet dark soil at the edge, depth-based colour (silty olive-brown), soft shoreline, rougher reflections. No hard ribbon edge.
- **Snow:** generate in the shader from slope, aspect (north faces, shaded hollows) and noise, with soft edges and sparkle-free filtering. Remove decal-like patches.
- **Vegetation:** dense poplar lines along the river, orchards and vineyards on terraces, scrub on plateaus, ground-cover scatter near the camera.
- **Fleet balloons:** per-instance palettes and patterns (5+ designs).

---

## Phase 7 — Post

- Remove **FXAA after MSAA + temporal** (it softens the frame).
- Bloom: no threshold, energy-conserving, low intensity.
- Tonemapper: keep AgX or switch to UE5's filmic curve; test both against the same captures.
- Optional on `high`: subtle motion blur, vignette, grain.

---

## Phase 8 — Performance

- Cut draw calls (~1,200 now) by merging and instancing; review the 3.7–4 M triangles for waste.
- Hold 60 fps on the 890M at DPR 1, and 60 fps at high DPI on `high`.
- Check the duplicate-frame stutter from the recording is gone (Phase 0.2).

---

## Final check

- Captures at sunrise, midday, snowstorm, golden hour, sunset and night, matching cameras, with a before/after comparison page in `captures/`.
- Frame pacing and flicker numbers per tier, at the bottom of this file.
- A ranked list of what's still short of the UE look.

---

## Astra implementation log

### Phase 0.1 — quality tiers

- Implemented conservative GPU classification with explicit `?quality=high|medium|lite` overrides. Masked and unknown adapters default to medium; AMD 890M is medium. The tier is fixed for a session, avoiding geometry changes while flying.
- Medium retains the existing 2.8M-pixel budget, 4x MSAA, 2048 cascades, 768 reflection, and 4096-wide cloud cache. High permits 8.3M pixels and a 1024 reflection. Lite uses 2x MSAA, 1024 cascades, 384 reflection at 15 Hz, and a 2048-wide cloud cache with 48 cloud steps. The native CSS-pixel floor remains in every tier.
- Existing performance baselines describe a short fixed view, not the full scripted flight required by 0.2. That measurement and the scene flicker metric in 0.3 are next; no new 60 fps claim is made here.
- Matched review captures: `captures/fidelity-0-before-*` and `captures/fidelity-0-after-*` at the four existing procedural review cameras/hours.
- Validation: GPU classification checks and browser checks for all three tiers passed; `npm test`, `npm run test:graphics`, and `npm run test:temporal` passed. Personally inspected all four before/after views: medium preserves the baseline appearance. The rock camera exposes pre-existing stretched triangles, which will be investigated with landform geometry in Phase 1.

### Phase 0.2 ? frame pacing baseline

- Added a 30 s scripted 960 m flight with alternating camera turns at hour 8.5. Every animation-frame interval, completed application render count, camera, draw calls, triangles, and dynamic quality value is saved. Eight seconds of warm-up precede measurement. Percentiles use linear interpolation.
- Commands: `node benchmark.mjs --flight --tier=medium --tag=phase-0` and the same with `--recording`. Other tiers use `--tier=high|lite`; duration and artifact label use `--seconds=30 --tag=...`.

| Radeon 890M / medium | FPS | Median ms | p95 ms | p99 ms | Frames >25 ms | Samples | Mean draws | Mean triangles |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1440?900 DPR 1 | 63.73 | 16.60 | 25.44 | 33.59 | 153 | 1913 | 1065 | 3318724 |
| 2848?1590 DPR 1 | 33.07 | 33.20 | 41.70 | 41.80 | 720 | 992 | 1205 | 3920289 |

- Native resolution averages above 60 fps but does **not hold** the frame budget: 8.0% of frames exceed 25 ms. Recording resolution is GPU-limited at about 33 fps, with 72.6% exceeding 25 ms. Dynamic quality reaches 0.4 there, but the native-resolution floor prevents it from reducing the 4.53M-pixel framebuffer. This needs resolution-aware tier controls and draw/triangle reduction in Phase 8.
- Both runs had zero observer callbacks without an application render and no page errors. This rules out skipped application renders in this test; it does not establish whether a screen recorder duplicates frames. Headless Chromium presentation cadence can differ from the desktop. Raw rAF timing is not a GPU timer.
- This task changes the harness only; `Ascent.html` is byte-identical to Phase 0.1. Matched review uses `fidelity-0-after-*` versus `fidelity-0-2-after-*`.
- Validation: gameplay, graphics and temporal suites passed. Personally inspected all four matched before/after views; the benchmark-only change preserves the appearance.

### Phase 0.3 ? scene flicker baseline

- `node flicker.mjs --tier=medium --tag=phase-0` renders 301 frames spanning exactly 5 s at 60 steps/s. The camera translates 6 m at hour 8.5, following 30 warm-up frames. Sun, weather, wind and animation time are frozen; hero/fleet and particles are hidden. The harness supplies a deterministic clock to shadow/reflection caches. It never changes production timing.
- Score: RMS of `L[t] - (L[t-1] + L[t+1])/2`, in linear Rec.709 luminance after converting the final sRGB framebuffer. This removes a local linear temporal trend. It is a comparative instability proxy, **not** ground-truth flicker: disocclusions, curved motion and changing fine geometry still contribute. Lower is better for the same camera/content. Full-resolution whole-frame sampling and a fixed top-right cliff crop (1000,300,360,240) are scored separately. GPU readback makes capture timings unsuitable for performance measurement.

| Tier on Radeon 890M, 1440?900 DPR 1 | Whole-frame RMS | Cliff RMS | Scored frames |
|---|---:|---:|---:|
| high | 0.00155842 | 0.00082695 | 299 |
| medium | 0.00154563 | 0.00082698 | 299 |
| lite | 0.00176483 | 0.00083020 | 299 |

- Metric unit tests verify constant frames, a smooth linear luminance trend, alternating flicker, RMS aggregation and crop orientation. All three tier captures completed without page errors. Start/end PNGs and every scored frame are saved with the reports. These are tier comparisons on the same integrated GPU, not performance certification for discrete or software adapters.
- Production build remains byte-identical to Phase 0.1. Matched review uses `fidelity-0-2-after-*` versus `fidelity-0-3-after-*`.
- Validation: gameplay, graphics and temporal suites passed. Personally inspected all four matched review pairs and the flicker start frame; no appearance regression.
