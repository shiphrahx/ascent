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

### Phase 0.2 - frame pacing baseline

- Added a 30 s scripted 960 m flight with alternating camera turns at hour 8.5. Every animation-frame interval, completed application render count, camera, draw calls, triangles, and dynamic quality value is saved. Eight seconds of warm-up precede measurement. Percentiles use linear interpolation.
- Commands: `node benchmark.mjs --flight --tier=medium --tag=phase-0` and the same with `--recording`. Other tiers use `--tier=high|lite`; duration and artifact label use `--seconds=30 --tag=...`.

| Radeon 890M / medium | FPS | Median ms | p95 ms | p99 ms | Frames >25 ms | Samples | Mean draws | Mean triangles |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1440 x 900 DPR 1 | 63.73 | 16.60 | 25.44 | 33.59 | 153 | 1913 | 1065 | 3318724 |
| 2848 x 1590 DPR 1 | 33.07 | 33.20 | 41.70 | 41.80 | 720 | 992 | 1205 | 3920289 |

- Native resolution averages above 60 fps but does **not hold** the frame budget: 8.0% of frames exceed 25 ms. Recording resolution is GPU-limited at about 33 fps, with 72.6% exceeding 25 ms. Dynamic quality reaches 0.4 there, but the native-resolution floor prevents it from reducing the 4.53M-pixel framebuffer. This needs resolution-aware tier controls and draw/triangle reduction in Phase 8.
- Both runs had zero observer callbacks without an application render and no page errors. This rules out skipped application renders in this test; it does not establish whether a screen recorder duplicates frames. Headless Chromium presentation cadence can differ from the desktop. Raw rAF timing is not a GPU timer.
- This task changes the harness only; `Ascent.html` is byte-identical to Phase 0.1. Matched review uses `fidelity-0-after-*` versus `fidelity-0-2-after-*`.
- Validation: gameplay, graphics and temporal suites passed. Personally inspected all four matched before/after views; the benchmark-only change preserves the appearance.

### Phase 0.3 - scene flicker baseline

- `node flicker.mjs --tier=medium --tag=phase-0` renders 301 frames spanning exactly 5 s at 60 steps/s. The camera translates 6 m at hour 8.5, following 30 warm-up frames. Sun, weather, wind and animation time are frozen; hero/fleet and particles are hidden. The harness supplies a deterministic clock to shadow/reflection caches. It never changes production timing.
- Score: RMS of `L[t] - (L[t-1] + L[t+1])/2`, in linear Rec.709 luminance after converting the final sRGB framebuffer. This removes a local linear temporal trend. It is a comparative instability proxy, **not** ground-truth flicker: disocclusions, curved motion and changing fine geometry still contribute. Lower is better for the same camera/content. Full-resolution whole-frame sampling and a fixed top-right cliff crop (1000,300,360,240) are scored separately. GPU readback makes capture timings unsuitable for performance measurement.

| Tier on Radeon 890M, 1440 x 900 DPR 1 | Whole-frame RMS | Cliff RMS | Scored frames |
|---|---:|---:|---:|
| high | 0.00155842 | 0.00082695 | 299 |
| medium | 0.00154563 | 0.00082698 | 299 |
| lite | 0.00176483 | 0.00083020 | 299 |

- Metric unit tests verify constant frames, a smooth linear luminance trend, alternating flicker, RMS aggregation and crop orientation. All three tier captures completed without page errors. Start/end PNGs and every scored frame are saved with the reports. These are tier comparisons on the same integrated GPU, not performance certification for discrete or software adapters.
- Production build remains byte-identical to Phase 0.1. Matched review uses `fidelity-0-2-after-*` versus `fidelity-0-3-after-*`.
- Validation: gameplay, graphics and temporal suites passed. Personally inspected all four matched review pairs and the flicker start frame; no appearance regression.

### Phase 1.1 - layered terrain

- Shared deterministic strata fields create 4-12 m beds with short cliff transitions and longer ledges; drainage cuts V-shaped, branching channels toward the valley. Ridge cross-sections now have talus aprons, escarpments and broad caps.
- High uses a 4 m grid within 800 m of the river corridor. Medium/lite preserve the original grid (8 m along the river; 1-8 m across its banks, then 20 m farther out). Their denser prototype regressed flight performance, so that cost is restricted to high. All grids are fixed for a session and collision samples the same triangles. High ridge grids are 2.4-3.2 m across and 4 m along. Medium/lite retain 3.5-4.7 m across, with 5 m rows on the closest pair and 7.5 m on the outer four; this removes distant geometry to pay for the new visible cliff faces. The 2-4 m target is therefore high-only until the integrated-GPU budget allows it.
- Investigation corrected the earlier stretched-geometry diagnosis: the old rock review camera was **2.48 m inside a ridge**, bypassing the production camera collision solver. Its near-plane intersections produced the giant diagonal faces. The review eye is now at y=145, and every pose asserts terrain clearance. Village review coordinates are also fixed in world space so changed terrain height cannot move the comparison camera. Both old and new builds are recaptured with these corrected identical poses.
- Medium/lite repeated rock remnants use 48 sides and 28 vertical rings; high keeps 64/36. Citadel geometry retains 64/48 in every tier. This reduces repeated distant geometry while preserving the largest close landmark.

| Paired 30 s native flight, medium | FPS | Median ms | p95 ms | p99 ms | Frames >25 ms | Mean triangles |
|---|---:|---:|---:|---:|---:|---:|
| Phase 0 build | 43.27 | 16.80 | 49.90 | 58.40 | 470/1298 | 3422428 |
| Layered terrain | 48.43 | 16.70 | 41.80 | 58.20 | 432/1453 | 2977107 |

- The final paired run improves average pacing and reduces rendered triangles by about 13%. The unchanged baseline varied from 43 to 77 fps across this session, so these results do not certify a sustained 60 fps; the strict budget remains open. Reports retain all samples, settings and camera positions. Earlier prototypes were rejected for increasing cost.
- Final medium flicker baseline for the changed geometry: whole-frame RMS 0.00155580, cliff RMS 0.00091137. The cliff score rises with the new geometric edges; it is not comparable as an isolated shadow-filter regression because the content changed. Phase 4 will compare against this landform baseline.
- Validation: landform field tests, all three tier browser checks, gameplay, graphics, and temporal suites passed. The matched corrected-camera review was inspected: the ridge silhouettes now show escarpments and plateaus, and the old near-plane artifacts are absent. Far landscape, chimney design, materials and lighting still need their later phases.

### Phase 1.2 - far landscape

- Replaced the 24 km coarse plane and four separate backdrop meshes with a continuous procedural height field rendered in four camera-centred LOD rings. The regional northern escarpments remain recognizable while relief now extends in every direction.
- High bakes a 2049-square height field and starts at 32 m mesh spacing; medium uses 1025 and 64 m; lite uses 513 and 128 m. Outer spacing is capped at 128 m (256 m on lite) to preserve distant silhouettes. The rings require four draws per view, with fixed buffers and no per-frame CPU mesh generation.
- Before a ring changes its origin, fine vertices converge to the adjacent coarse triangular surface. World-aligned sampling keeps terrain stationary. A border follows the exact detailed-strip vertices and overlaps the coarse field to close cracks. Tests measure the border overlap and render both sides of an origin change at an identical camera pose.

| Far terrain tier | Height field | Ring triangles | Border overlap range (m) | Origin-shift image RMS |
|---|---:|---:|---:|---:|
| high | 2049 squared | 180224 | 7.26 to 60.40 | 0 |
| medium | 1025 squared | 137216 | 7.26 to 61.06 | 0 |
| lite | 513 squared | 57344 | 7.26 to 58.25 | 0 |

- All three tiers pass finite-height, border-overlap and identical-camera ring-shift checks. Lite retains 128 m spacing through its first three rings so the detailed strip does not intersect a prematurely coarse surface; only its outer ring uses 256 m.

| Paired 30 s native flight, medium | FPS | Median ms | p95 ms | p99 ms | Frames >25 ms | Mean draws | Mean triangles |
|---|---:|---:|---:|---:|---:|---:|---:|
| Phase 1.1 build | 56.80 | 16.60 | 41.50 | 49.90 | 254/1704 | 1081 | 3018381 |
| Continuous far terrain | 77.41 | 8.50 | 17.00 | 41.70 | 82/2323 | 943 | 2805268 |

- Medium scene flicker: whole RMS 0.00156021, cliff RMS 0.00091276. The identical-camera LOD origin-change tests score zero image difference in all tiers.
- Validation: gameplay, graphics and temporal suites passed, alongside all three far-terrain checks. Personally inspected all four matched views: regional ridge silhouettes are preserved, the terrain join is closed, and the near landscape remains intact. The paired run removes about 138 average draws; long-tail stalls and the recording-resolution target remain for Phase 8.

### Phase 1.3 - clustered fairy chimneys

- Seeded clusters now follow the first cliff feet. Overlapping talus bases support related multi-headed columns, pointed cones and resistant dark basalt caps. Stronger V-shaped rills and chipped bedding joints break the silhouettes; mineral vertex bands vary their colour. Placement is fixed for a session and unrelated clusters do not reroll when terrain excludes a member.
- High has 175 formations across 41 clusters, medium 112 across 30, and lite 66 across 23. Their cap counts are 53, 29 and 18. Most are spatially instanced. Five/three/two selected cones respectively use projected skin cuts with actual chamber reveals and back walls; matching shadow materials preserve the holes. Smaller 512 x 768 masks keep this detail bounded.
- The final paired native medium flight measured 65.90 to 73.00 fps, p95 25.0 to 24.9 ms, p99 33.4 to 33.3 ms, and frames over 25 ms 75/1977 to 68/2190. Mean draws fell 983 to 887 and triangles 2.959M to 2.596M. Session-wide baseline variation remains substantial, so sustained 60 fps is still unproven.
- Medium scene flicker: whole RMS 0.00150975, cliff RMS 0.00097668. Content changed; this remains a new baseline, not an isolated filter comparison.
- Footings sample the whole sloping footprint while preserving summit heights; entrances follow local terrain. Browser checks test every actual base vertex against collision terrain. Minimum burial is 2.38 m on medium/lite and 0.17 m on high. The close-up harness waits for the launch fade before pausing.
- Validation: deterministic placement tests, all three formation browser checks, gameplay, graphics and temporal suites passed. Personally inspected all matched views and a close carved-cone view. The grouping and silhouettes improve, while the flat lighting, repeated surface appearance and snow coverage still need the following phases.

### Phase 2 - procedural materials

- Added height-aligned 4-12 m cream, ochre, pink and grey mineral beds, with derivative filtering once beds become subpixel. World-space triplanar mapping continues across steep faces. Broader mineral fields and slope-weighted soil/dry-grass patches break up the single beige surface. Material colours retain more of their original tint.
- All six maps remain deterministic procedural assets. Cavity visibility is now calculated from each height field along eight horizon directions and five radii with periodic boundaries; it affects indirect diffuse/specular light, not baked directional colour. Tuff has deeper pitted relief and broader roughness variation, with mipmaps, anisotropy and distance-faded bump normals. Mean cavity visibility is 0.887 for tuff, 0.819 for soil and 0.944 for masonry.
- The initial shader cost more than the baseline. Removed a redundant procedural grain layer and kept the extra soil surface sample on ridge tops high-only. Medium/lite use averaged soil roughness/cavity there; close valley terrain retains the full soil material on every tier. Distant rings use the averaged soil surface on every tier. No geometry or material swaps occur during flight.

| Final paired native flight, medium | FPS | Median ms | p95 ms | p99 ms | Frames >25 ms |
|---|---:|---:|---:|---:|---:|
| Phase 1.3 build | 61.73 | 16.60 | 27.29 | 41.50 | 147/1852 |
| Procedural strata and cavities | 67.47 | 16.60 | 25.00 | 25.10 | 36/2024 |

- Scene flicker: whole RMS 0.00147737, cliff RMS 0.00089886, about 2% and 8% below Phase 1.3 respectively. These are scene proxies with changed materials, not proof that every source of temporal instability is resolved. The remaining long-tail stalls and recording-resolution budget are still open.
- Validation: cavity-field unit tests, decoded material-channel checks, all three tier browser checks, gameplay, graphics and temporal suites passed. Personally inspected all four matched views: mineral beds and variation are visible, with the existing sky and scene layout preserved. Lighting remains too flat and is next.

### Phase 3.1 - sun, sky and exposure

- Removed the HemisphereLight fill; the procedural sky PMREM now supplies ambient illumination. Daylight sun intensity is 6.0, with warmer low-angle colour. Moon lighting remains separate from daytime sunlight.
- Added a 64-bin weighted log-luminance histogram, trimming the darkest 10% and brightest 2%, targeting middle grey and clamping exposure to 0.45-1.8. Adaptation is smooth in stops, faster when entering bright light, and its time step is bounded after stalls. The meter samples 32 x 18 pixels on medium/high and 16 x 9 on lite at up to 2 Hz. GPU readback uses an asynchronous PBO/fence; it never reads the full-resolution framebuffer synchronously in production.
- GPU tests render known HDR levels: 0.18 meters to about 0.975 exposure, dark 0.01 reaches the 1.8 clamp, and bright 4 reaches 0.45. Tests also exercise synchronous capture while the asynchronous fence is pending. No hemisphere lights remain and the environment map is present.
- Matched reviews wait for exposure to settle. The scene-flicker harness meters its actual fixed view and then locks exposure, recording the value, so camera adaptation is not scored as flicker. The temporal presentation comparison similarly fixes exposure between its two renders; its original colour-error limits are unchanged.

| Paired native flight, medium | FPS | Median ms | p95 ms | p99 ms | Frames >25 ms |
|---|---:|---:|---:|---:|---:|
| Phase 2 build | 71.33 | 16.60 | 17.48 | 25.20 | 51/2140 |
| Sun/sky and auto exposure | 77.94 | 8.60 | 24.42 | 25.26 | 55/2339 |

- Pacing is mixed: average FPS improves while p95 worsens; the rate above 25 ms remains about 2.4%. This does not establish a sustained-60 result. The new meter adds at most two tiny draws/readbacks per second.
- New lighting flicker baseline at locked exposure 0.7846: whole RMS 0.00155542, cliff RMS 0.00100941. The stronger lighting changes edge contrast, so these values are not an isolated shadow-filter comparison. Phase 4 will measure filtering against the updated lighting.
- Validation: histogram/adaptation units, known-luminance GPU metering, gameplay, graphics and temporal suites passed. Personally inspected all four matched views: shadows and cloud contrast deepen without clipped terrain or missing colour. Canyon-scale ambient occlusion and bounce remain the next lighting tasks.

### Phase 3.2 - terrain sky visibility and bounce

- Baked directional horizon angles across the 6 x 4.8 km valley. Sky visibility integrates about the local surface normal, so an unobstructed tilted plane stays fully lit while enclosed valleys lose ambient illumination. The minimum visibility is about 0.24 on medium; exposed terrain approaches 1. The height field includes the detailed ridges and continuous distant terrain, but not separate buildings or chimneys; their material/chamber occlusion remains separate.
- A low-resolution field estimates sunlit ground radiance from terrain normals, directional horizons, warm rock/soil albedo and snow coverage. A separable blur supplies approximate single-bounce light. High evaluates local visibility and radiance per pixel, fading with height above the ground; indirect reflections receive roughness-weighted occlusion. This is a height-field approximation, not multi-bounce global illumination.
- GPU texture evaluation regressed medium flight pacing, including a vertex-sampled prototype. The final medium/lite path instead bakes visibility and ground proximity into static stone/terrain attributes once; instanced formations sample their footings. Existing geometry buffers are shared. Their bounce uses the field's mean radiance, oriented toward surrounding ground, with no lighting texture reads per frame. Moving actors and far LOD rings retain neutral ambient on these tiers. High keeps full local evaluation on all standard materials.
- High/medium/lite visibility grids are 257/257/129 square with 16/8/8 horizon directions; bounce grids are 129/65/33 square. Radiance updates at most 2/2/1 Hz and skips unchanged lighting. Measured startup horizon baking was approximately 2.17/1.02/0.27 seconds; radiance updates were around 1.3/0.3/0.5 ms in the tier checks. These are local measurements, not guaranteed hardware budgets.

| Final paired native flight, medium | FPS | Median ms | p95 ms | p99 ms | Frames >25 ms |
|---|---:|---:|---:|---:|---:|
| Phase 3.1 build | 70.30 | 16.50 | 25.10 | 33.30 | 108/2109 |
| Baked visibility and approximate bounce | 68.39 | 16.50 | 25.10 | 35.56 | 126/2053 |

- Average pacing is about 2.7% lower in this pair, with unchanged p95 and a worse tail; session variability prevents attributing that entire difference to the feature. The expensive local lighting path is high-only. Sustained 60 fps remains an open Phase 8 requirement. The rejected texture-evaluation runs are not used as the final baseline.
- Medium scene flicker at locked exposure 0.7824: whole RMS 0.00155102, cliff RMS 0.00100691, essentially unchanged from Phase 3.1. No random sampling or camera-triggered geometry changes were added.
- Validation: flat/tilted-plane and canyon horizon units, all three tier browser checks, gameplay, graphics and temporal suites passed. Personally inspected all four matched pairs and the lighting toggle view: sheltered rock darkens and receives subtle warm fill; no missing surfaces or new noisy grain. Distant cast shadows and shadow filtering remain the next tasks.

### Phase 3.3 - distant terrain cast shadows

- A static 32.768 km square horizon field extends terrain cast shadows beyond the 1.9 km cascades. Each texel stores horizon slope, terrain height and inverse occluder distance. Azimuth occupies the depth axis of a 3D texture; one hardware-trilinear lookup interpolates space and sun direction continuously. Elevated receivers can see over the recorded occluder. No textures are regenerated as time advances.
- The shadow fades in over view depths 1.6-1.9 km, overlaps the cascades, and fades at the field boundary. It attenuates directional illumination only; local lamps, emission and ambient illumination remain separate. A derivative-aware penumbra filters the horizon threshold. The height-field approximation excludes independent chimney/building occluders and the separate distant volcano mesh.
- High uses 256 x 256 x 16 half-float RGBA texels (8 MiB); medium/lite use 128 x 128 x 8 (1 MiB). A 64-square lite prototype lost too much relief and was rejected. Measured baking took about 2.24 seconds on high and 0.20-0.28 seconds on lower tiers. All tiers verify finite data, visible shadow contribution and unchanged texture versions while the sun moves.
- High applies the effect to all standard surfaces. Medium/lite restrict it to terrain, stone and masonry and reuse their existing world-position interpolator. Other materials retain cascaded shadows. This replaces an all-material prototype that increased integrated-GPU cost.

| Final paired native flight, medium | FPS | Median ms | p95 ms | p99 ms | Frames >25 ms |
|---|---:|---:|---:|---:|---:|
| Phase 3.2 build | 67.30 | 16.60 | 25.00 | 40.04 | 70/2019 |
| Distant terrain shadows | 64.97 | 16.60 | 25.00 | 33.45 | 91/1949 |

- Average pacing is 3.5% lower in this pair, p95 is unchanged and p99 improves. The run has no skipped application renders, but does not prove sustained 60 fps. The larger high field and all-material path remain behind the tier switch.
- Medium scene flicker at locked exposure 0.7820: whole RMS 0.00155055, cliff RMS 0.00100619, effectively unchanged. Validation: analytical flat/ridge/elevated-receiver checks, all tier GPU checks, gameplay, graphics and temporal suites passed. Personally inspected all four matched pairs and the distant low-sun shadow toggle: nearby lighting is preserved; distant shadowing is subtle under the current haze. Cascade filtering and atmosphere are next.

### Phase 4 - filtered and temporally blended cascades

- Replaced the built-in PCFSoft path for sun shadows with native depth-comparison textures and fixed Poisson kernels. Hardware bilinear comparisons filter each tap. Sampling has no frame jitter or screen-space noise. Receiver-plane depth gradients correct the comparison depth across the kernel, suppressing striped self-shadowing on slopes. High near normal bias is 0.045 m; lower near bias remains 0.07 m, with 0.18/0.5 m for the other cascades.
- High renders every cascade every frame, with 4096/2048/2048 maps and 12 taps. Medium uses 2048/1024/1024 maps with 8 near and 4 middle/far taps. Lite uses 1024/512/512 maps and 4 taps. Lower-tier distant resolution was reduced after the full-size prototype regressed pacing. Near detail remains at its previous resolution on those tiers.
- Medium/lite retain the bounded staggered refresh schedule and blend previous/current depth maps over 0.10/0.22 seconds. GPU copies preserve the old map and its actual projection matrix; history is bypassed on cuts and major light/projection changes. Previous coordinates are evaluated only where history is needed, reusing terrain positions. A prototype carrying two extra coordinates per vertex was rejected for overhead.
- All tier checks verify update counts, actual history interpolation and texel alignment. Across 40 frames, high refreshes each cascade 40 times; medium/lite refresh the near map 40 times and the others 1-5 times. Alignment error is below 2e-9 texels. High does not allocate history maps. Shader checks now reject driver warnings too; corrected early-return translation warnings and initialized comparison-sampler bindings before the first history copy.

| Native medium flight, final shader | FPS | p95 ms | p99 ms | Frames >25 ms |
|---|---:|---:|---:|---:|
| Phase 3.3, measured first | 66.01 | 25.00 | 41.60 | 76/1981 |
| Filtered cascades, measured second | 59.27 | 33.51 | 50.10 | 195/1778 |
| Filtered cascades, reverse-order check | 63.27 | 33.40 | 66.16 | 188/1904 |
| Phase 3.3, reverse-order check | 63.58 | 25.20 | 58.30 | 150/1908 |

- Reversing order nearly equalizes average FPS, but the new filter still has a worse tail. The reverse baseline ended at dynamic quality 0.9; all runs retain the native 1440 x 900 framebuffer. Both orders are retained to expose variability instead of selecting the favourable pair. No observer callbacks skipped an application render.
- Added `gpu-budget.mjs` for asynchronous elapsed-GPU queries around the scene/composer render at a fixed camera/hour/exposure (240 frames, no disjoint events). Mean GPU time is 12.21 ms before and 13.34 ms after; p95 is 16.67 versus 20.68 ms. Mean CPU submission time is 11.77 versus 14.41 ms and may include GPU back-pressure; these durations must not be added as independent frame stages. The filter has a measurable cost despite the tier reductions. **Sustained 60 fps remains unmet**, and Phase 8 must recover the remaining rendering/submission budget.
- Final medium scene flicker at exposure 0.7802: whole RMS 0.00154405, cliff RMS 0.00099041 (about 0.4% and 1.6% below Phase 3.3). These are modest scene-level gains, not proof that all tree/shadow flicker is eliminated.
- Validation: quality-selection units, all three cascade browser checks, gameplay, graphics and temporal suites passed without shader errors or warnings. Personally inspected all four matched views: filtered shadows preserve the scene and fine structures. The atmosphere still washes distant relief together and is next.

### Phase 5 - aerial perspective and coherent cloud shadows

- Removed the single-colour exponential scene fog. The depth-aware HDR pass now integrates height fog and wavelength-dependent aerial extinction, using the sky model's blue upper atmosphere, horizon colour and warm forward scattering. Terrain sky visibility cools sheltered mist; cloud transmission reduces its direct warm illumination. Geometry receives aerial perspective while the existing sky/cloud rendering remains intact.
- Visible clouds and ground shadows share the exact seeded noise, density, height range, advection and extinction coefficient. A sun-projected transmittance field covers 12 km, with receiver-height correction and a soft outer boundary. High uses 256-square/12 steps at 4 Hz and blends maps; medium uses 192-square/8 steps at 2 Hz; lite uses 128-square/6 steps at 1 Hz. Weather/light cuts reset history. Lower tiers apply ground shadows to terrain, stone and masonry; high includes all standard materials. This is a coarse cloud projection, not volumetric light transport through every object.
- Lower-tier fog uses 6/4 single-noise samples instead of 10 three-octave samples, paying for the new field lookups. High retains 10 detailed fog samples. Cloud maps remain unchanged when time/weather are paused. Browser checks on all tiers verify finite maps, moving shadows, weather response, visible contribution and history resets; clear mean transmission is 0.77-0.79, storm transmission 0.17-0.19.

| Paired native medium flight | FPS | Median ms | p95 ms | p99 ms | Frames >25 ms |
|---|---:|---:|---:|---:|---:|
| Phase 4 | 68.73 | 8.40 | 41.70 | 50.10 | 248/2062 |
| Sky-coloured atmosphere/cloud shadows | 70.60 | 8.40 | 41.70 | 50.10 | 246/2118 |

- This pair improves average throughput with unchanged tail percentiles; long stalls still prevent a sustained-60 claim. No application renders were skipped. Flicker at the new metered exposure 1.1082 is whole RMS 0.00158795 (2.8% higher), cliff RMS 0.00090983 (8.1% lower). Cloud-driven lighting and exposure change the scene contrast, so this is a new content baseline rather than an isolated temporal-filter measurement.
- Validation: all three atmosphere tier checks, gameplay, graphics and temporal suites pass with no errors or warnings. Personally inspected all four matched pairs: distant ridges separate more clearly, sheltered rock is cooler, and cloud shapes remain consistent. The hard river ribbon, snow distribution and sparse vegetation are next.

### Phase 6.1 - river and wet banks

- The terrain channel now varies from about 9.6 to 23 m wide, with longitudinal depth variation up to 1.7 m, low bars and gently rising margins. The river follows the exact rendered/collision terrain intersections; all tiers measure shoreline errors below 0.003 m. Eight strips across the channel carry actual bed depth, with 6,129 fixed vertices and no runtime mesh changes.
- Water uses depth/angle-dependent absorption, silty olive-brown bed/body colour and Fresnel reflections. World-space waves have derivative filtering; rough reflections use 5/3/1 samples on high/medium/lite. Coverage softens over the first 0.16 m of depth. Wet margins darken and lower their roughness. Irregular shore frost is integrated into the water shader, replacing the two separate hard-edged ice strips. Reflection sizes and refresh limits are unchanged.

| Paired native medium flight | FPS | Median ms | p95 ms | p99 ms | Frames >25 ms |
|---|---:|---:|---:|---:|---:|
| Phase 5 | 71.13 | 8.40 | 41.70 | 50.00 | 233/2134 |
| Depth-aware river/banks | 70.05 | 8.40 | 41.70 | 50.10 | 249/2102 |

- Average throughput is 1.5% lower in this pair, with effectively unchanged tail times. Mean draws fall from 877.6 to 872.3 while rendered triangles rise by about 6,600. The richer reflection kernel is tiered; the remaining strict frame budget stays open. No application renders were skipped.
- Flicker at exposure 1.1309: whole RMS 0.00139122, cliff RMS 0.00091825. River/shore content changes lower the whole-frame score by about 12.4%; the cliff score is within 1% of Phase 5. Validation: all three river tier checks, gameplay, graphics and temporal suites pass without errors or warnings. Personally inspected the near-bank view and all four matched pairs. Water now changes from silt colour to reflected sky with depth and angle; vegetation and snow still need their own detail passes.

### Phase 6.2 - snow retention and filtered edges

- Shader snow now combines slope, northern aspect (+Z, away from the midday sun), procedural drift and terrain sky visibility. Sheltered hollows retain more snow; exposed southern slopes lose it. Vertical faces reject deposits. Wider derivative-filtered transitions reveal underlying rock instead of ending in hard white patches, with rough, slightly varied snow albedo and no sparkle noise.
- Snow reuses the existing terrain-lighting visibility. High evaluates that field once earlier in the fragment shader and shares it with indirect lighting; medium/lite reuse their baked attributes. There are no new texture lookups or geometry draws, and one old shelter-noise evaluation is removed.
- A GPU fixture executes the production coverage function: equal-slope north/south samples cover 0.62/0.00, exposed/sheltered horizontal samples 0.32/1.00, vertical and melted samples 0.00. A large pixel footprint averages coverage rather than producing a sharp binary deposit. All three quality tiers render successfully.

| Paired native medium flight | FPS | Median ms | p95 ms | p99 ms | Frames >25 ms |
|---|---:|---:|---:|---:|---:|
| Phase 6.1 | 83.26 | 8.40 | 33.40 | 41.70 | 221/2498 |
| Aspect/shelter snow | 81.77 | 8.40 | 33.40 | 41.90 | 227/2453 |

- Throughput differs by 1.8%, with effectively unchanged tails and no skipped application renders. These faster session averages do not remove the sustained frame-budget requirement. Flicker at exposure 1.1529: whole RMS 0.00136650, cliff RMS 0.00089529, about 1.8%/2.5% below Phase 6.1.
- Validation: production-shader coverage fixture, all-tier quality checks, gameplay, graphics and temporal suites pass with no errors or warnings. Personally inspected all four matched pairs: deposits are softer and less uniform, with more exposed rock on sunny slopes. The remaining scene details are vegetation and fleet designs.

### Phase 6.3 - riverbank trees, cultivated terraces and ground cover

- Poplar lines now contain 720/480/320 trees on high/medium/lite. Lower tiers simplify connected opaque branch geometry: medium doubles the population while reducing total poplar triangles from 472,320 to 408,960. The high silhouette retains 24 primary limbs; medium/lite use 18/14. Four seeded crown variants, static instance matrices, padded bounds and identical colour/depth wind deformation remain; trees never swap geometry or alpha masks while flying.
- Added terraced apricot orchards, woody vines on existing trellises and plateau scrub. Final high/medium/lite orchard counts are 89/93/53; scrub counts are 2,200/1,300/600. Placement rejects steep slopes, river margins and nearby building/formation obstacles. Browser checks measure at least 3 m obstacle clearance and root-height error below 0.00005 m.
- Ground cover uses 330 fixed 96 m terrain patches. High/medium/lite store roughly 240k/120k/60k small clumps (about 15.4/7.7/3.8 MB of instance transforms), with only nearby patches submitted; 14 patches are active at the bank review camera. Clumps shrink continuously between 80 and 140 m before whole-patch culling. They do not cast shadows or enter reflections. The initial sparse scatter was replaced after close-up review. Corrected reflection-layer initialization so the ground-cover exclusion is actually respected.

| Final paired native medium flight | FPS | Median ms | p95 ms | p99 ms | Frames >25 ms |
|---|---:|---:|---:|---:|---:|
| Phase 6.2 | 68.13 | 8.40 | 41.70 | 50.10 | 249/2044 |
| Dense vegetation with obstacle clearance | 66.23 | 8.40 | 41.60 | 50.00 | 238/1987 |

- Mean draws fall from 878.5 to 864.9; rendered triangles remain about 2.56M. Average throughput is 2.8% lower, while tail times are effectively unchanged. Higher population/detail is tiered. No application renders were skipped. Earlier prototype runs are not used as the final baseline.
- Flicker at exposure 1.1569: whole RMS 0.00153388, cliff RMS 0.00090899. These rise about 12.2%/1.5% as additional fine branches and grass enter the scene; the content changed, and these scores do not establish that all subpixel vegetation shimmer is gone. Static matrices and opaque, fixed tree geometry eliminate population/LOD switching as a cause.
- Validation: all tier vegetation/quality checks, gameplay, graphics and temporal suites pass without errors or warnings. Personally inspected the bank close-up and all four final matched pairs. Added a snapshot helper that rejects stale/failed suite reports before recording the build hash and historical comparison build. Fleet pattern variety is next.

### Phase 6.4 - seven procedural balloon designs

- Added gores, chevrons, diamonds, latitude bands, sunbursts, stepped panels and checker weave to the seven seeded fabric textures. Every design retains panel seams, gore shading and fine woven detail. Hero, launch and fleet balloons use the designs through their existing texture slots; texture dimensions, shaders, geometry and draw counts are unchanged.
- A browser fixture paints every design with the same palette and weave seed. The minimum pairwise low-resolution pattern difference is 0.111 RMS (required >0.06), confirming that the variety comes from layout rather than colour alone. The actual fleet uses all seven designs.

| Paired native medium flight | FPS | Median ms | p95 ms | p99 ms | Frames >25 ms |
|---|---:|---:|---:|---:|---:|
| Phase 6.3 | 71.00 | 8.40 | 41.70 | 50.10 | 232/2130 |
| Patterned fabrics | 65.61 | 8.40 | 41.70 | 50.00 | 225/1970 |

- Average FPS is 7.6% lower in this pair despite unchanged rendering work. A paired fixed-view GPU measurement finds mean render cost 11.27 versus 11.39 ms (about 1% higher), p95 15.58 versus 16.12 ms. CPU submission p95 remains 38.9 ms. The flight difference is recorded rather than dismissed; long stalls and the strict frame budget remain Phase 8 work. No application renders were skipped.
- Flicker at exposure 1.1576: whole RMS 0.00153467, cliff RMS 0.00091066, within 0.2% of Phase 6.3. Validation: pattern fixture, gameplay, graphics and temporal suites pass without errors or warnings. Personally inspected the seven-design sheet and all four matched scene views. The assets remain entirely procedural and offline.
