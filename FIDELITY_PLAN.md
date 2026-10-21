# Ascent — Visual Fidelity Plan (target: Unreal Engine 5 look)

Work through this file top to bottom. Phase 1 fixes the shadow flicker the player sees. Later phases close the gap to a UE5 look.

## How to work

- **One task = one commit.** Match the existing style: `fix: ...`, `feat: ...`, `perf: ...`, lowercase, plain sentence.
- **After every task:**
  1. `npm run build`
  2. `node tools/verify.mjs` must pass (no console errors, no external requests).
  3. Take before/after screenshots with `node tools/shot.mjs` from the **same camera and hour**. Look at them yourself before committing.
  4. Check the GPU cost with `tools/profile.mjs` / `tools/gpu.mjs`.
- **Budget:** the `high` tier must hold 60 fps at 1600×900 with the existing dynamic resolution. If one task costs more than ~1.5 ms GPU, stop, make a cheaper version, and note the trade-off.
- **Don't break `lite` or `medium` tiers.** Each new feature gets a tier switch.
- **Keep the fast day cycle.** It is a deliberate timelapse. The goal is shadows that *sweep smoothly*, never shimmer, crawl or pop.
- **Start with a screenshot review.** The author of this plan only read the code. Take shots at sunrise, clear afternoon, golden hour and night, and add any visual problem you see that this plan misses.

---

## Phase 0 — A way to measure flicker

**0.1 Add `tools/shimmer.mjs`.**
- Add debug hash options if missing: freeze time (`#hour=15&freeze`), and a scripted slow camera move.
- Test A: sun frozen, camera translating slowly at balloon speed for 5 s.
- Test B: camera frozen, sun moving at normal timelapse speed for 5 s.
- Capture every frame. For each pixel, measure frame-to-frame luminance change that is *not* explained by the smooth trend (e.g. second difference). Report the mean over the frame and over a cliff-heavy crop.
- Record baseline numbers in this file before Phase 1.

**Done when:** the script prints two stable numbers you can compare after each fix.

**How it measures (rev 3).** Each pixel is reprojected through depth into the two frames before, like TAA does, and the second difference along that track is scored; surfaces not seen in all three frames are left out. Raw screen diffs (rev 1) scored textures sliding past as flicker. Even reprojected, a moving camera scores hard edges (a world-fixed painted pattern that can't flicker scored 1.7), so:
- **A** keeps the camera still and slides every shadow centre at 5 m/s (`shadowpan`), which is what a moving balloon does to the shadows.
- **B** still camera, sun moving at the normal timelapse rate from 15:00.
- **C** nothing moving: the floor.
- **F** 60 s of the real chase camera following the balloon's flight. Includes camera-motion edge noise, so only compare F with F.
- **P** the camera itself sliding 5 m/s (kept for reference, edge-dominated).

Every run is paired with a flat-grey control (`shadowview=flat`); the number tracked is the shadow view minus the control. Church cliffs from 150 m (`at=church&d=150&up=55`), crop = top 60% of the frame, RTX 5070 Ti laptop, headless, 1600×900, res pinned at 1. Repeat runs agree to ±0.01.

| test (frame / crop, 8-bit levels) | baseline | after Phase 1 | change |
|---|---|---|---|
| A: shadow cascades sliding 5 m/s | 0.22 / 0.28 | 0.05 / 0.05 | −77% / −82% |
| B: sun moving | 0.11 / 0.12 | 0.08 / 0.08 | −27% / −33% |
| C: floor | 0.08 / 0.09 | 0.05 / 0.05 | |
| F: 60 s flight | 0.60 / 0.47 | 0.46 / 0.23 | −23% / −51% |

What moved A: the texel snap (0.22 → 0.15), frustum-sphere slices (0.14), always-on heightmap shadow with a matched caster grid (0.06), PCSS + blue noise (0.05). B starts and ends within 0.03 of the floor: the moving sun never caused much beyond the static fizz, and the static fizz is what dropped. F's heat map lost the bright patches on the cliffs where ridge shadows used to pop; what's left is the hero balloon and edge noise from the camera moving, which isn't shadow work. Short of the 80% target on F and B, for those reasons.

## Screenshot review: problems the plan missed

- **A fresh browser profile drops to the lite tier on first load.** Shader compiles stall the first seconds, the governor sees >55 ms frames at the scale floor and sheds volumetrics, AO, grass and reflections for the rest of the session. Every first headless shot came back `tier: lite`, and so would a player's first visit.
- **Blotchy dark patches on lit cliff faces** (church facade at 15:00). *Checked in the shadow-only view: not shadows. It's the scanned tuff albedo and cavity AO.*
- **A hard straight shadow edge on the right of the church cliff.** *Checked: a real ridge shadow. The caster grid's skirt could cast a straight wall at its edge, though; removed in 1.3.*
- **SSAO leaves a fixed crosshatch on distant slopes** (only visible in the shadow-only view, the textures hide it in the real image). Half-res AO with depth-weighted upsampling breaks on grazing slopes. Phase 2.1's large-scale visibility should let the SSAO fade out with distance.
- **Shadow noise with nothing moving** (floor above): the shadow term isn't converged even on a still frame.

---

## Phase 1 — Shadow stability (the flicker)

### 1.1 Fix the texel snapping — it currently does nothing
File: `src/world/shadows.js`

**Bug:** the cascade camera is placed at `centre + L*back` and looks at `centre`. So, in its own view space, `centre` is always at (0,0). `sx` and `sy` are always ~0, and the shadow grid slides by sub-texel amounts every frame. Cliff edges crawl.

**Fix:** build the light view from a **fixed world anchor**, snap the centre in that space, then move the ortho bounds:

```js
// light basis anchored at the world origin: the texel grid stays put as the centre moves
cam.up.copy(this._up);
cam.position.copy(L).multiplyScalar(FAR_BACK);   // e.g. 100 km, so near stays positive
cam.lookAt(0, 0, 0);
cam.updateMatrixWorld();
this._v.copy(centers[i]).applyMatrix4(cam.matrixWorldInverse);
const texel = (2 * half) / c.res;
const cx = Math.round(this._v.x / texel) * texel;
const cy = Math.round(this._v.y / texel) * texel;
cam.left = cx - half; cam.right = cx + half;
cam.bottom = cy - half; cam.top = cy + half;
cam.near = -this._v.z - back;
cam.far  = -this._v.z + half * 1.5 + 600;
cam.updateProjectionMatrix();
```
Check depth precision with the float depth texture, and that `uShadowK` (1/(far-near)) still matches.

### 1.2 Stable cascade fitting
- Today the main cascade centres on a point 500 m ahead of the camera, so **turning the camera** swings the cascade across the mountains.
- Replace with a **bounding sphere of each view-frustum slice**. The radius is fixed per cascade (it doesn't change with rotation), so only the centre moves, and 1.1 snaps that.
- Use a practical split (log/linear blend, λ≈0.7). Consider 4 cascades on `high`: basket detail, ~250 m, ~1.2 km, far.
- Blend cascades over a band (dithered + TAA is fine), as cascade 0 already does.

### 1.3 Mountains lose their shadows inside the main cascade
Files: `src/world/terrain.js` (shadow caster grid), `src/glsl/common.js` (`keyShadow`)

**Bug:** the terrain shadow-caster mesh is a 1300 m square at 4 m spacing. With a low sun, the cascade's ground footprint stretches roughly `1/tan(sunElevation)` along the sun direction (about 7 km at 10°). Ridges outside the 1300 m mesh cast nothing into the cascade. Inside the cascade, `cover≈1`, so the heightmap terrain shadow is ignored. As the mesh snaps along, big ridge shadows appear and vanish.

**Fix:**
- In `keyShadow`, **always** combine the heightmap terrain shadow: `min(terrainShadow(P), cascade)`. Don't fade it out inside the cascade. Soften its edge a little so the two don't double-darken.
- Stretch or orient the caster grid along the sun's azimuth so it covers the cascade's footprint, or drop terrain from cascade casters beyond ~600 m and rely on the heightmap shadow there.
- Make sure the caster terrain matches the rendered terrain closely enough that slopes don't self-shadow in bands (bias tuning, or use the same LOD as the visible terrain near the camera).

### 1.4 Heightmap shadow quality
File: `src/world/terrainShadow.js`
- Raise core map from 1024×512 to **2048×1024** (matches the heightmap).
- The march grows its step by ×1.105 per step, so thin ridges get skipped and edges jitter as the sun moves. Cap the step at ~2 heightmap texels for the first ~1 km, then grow.
- Update both maps **every frame** on `high`. The outer map currently updates every 4th frame, and `lite` every 30th — with a timelapse sun that shows as jumps. Where a map must update less often, keep two copies and **blend** between them over the gap instead of jumping.
- Consider a soft penumbra: store the max horizon angle, then `smoothstep` around the sun's angle, scaled by distance to the occluder.

### 1.5 Everything follows the sun in the same frame
- Check every pass that reads `uKeyDir` (cascades, terrain shadow, volumetrics, probe, sky) updates in the same frame. Remove any remaining "every Nth frame" on `high`.
- Optional: slow the sun ~2× only when its elevation is under ~12°, when shadows are longest.
- If some crawl remains under a moving sun after 1.1–1.4, try quantising the light direction to tiny steps and cross-fading the last two shadow maps.

### 1.6 Shadow filtering (UE-style soft shadows)
- The Poisson pattern rotates per pixel per frame, relying on TAA. During motion TAA trusts the new frame more, so edges fizz. Use a **blue-noise** rotation and more taps (12–16) on `high`.
- Make the PCF radius a **world-space** size, consistent across cascades, so softness doesn't jump at cascade boundaries.
- Add **contact-hardening** (PCSS-style blocker search): sharp near contact, softer further away. This is a big part of the UE look.
- Re-tune normal-offset and slope bias after the above. Check for acne on gentle slopes and peter-panning under the chimneys.

### 1.7 TAA history in motion
File: `src/post/taa.js`
- Swap the min/max box clip for **variance clipping in YCoCg** (γ ≈ 1.0–1.25).
- The velocity term raises alpha up to +0.12 when moving. For static world pixels that reproject well, keep alpha lower so shadow noise still averages out.
- Check there's no ghosting on the hero balloon and fleet.

**Phase 1 done when:** both shimmer numbers drop by at least 80%, and a 60-second scripted flight (`tools/fly.mjs`) shows no shadow popping on cliffs when you watch the frames.

---

## Phase 2 — Lighting (the biggest gap to UE: bounce light)

UE's Lumen look comes from coloured bounce light and large-scale occlusion. The scene currently has a sky ambient cube, a crude ground bounce, and SSAO with a 2.2 m radius.

### 2.1 Terrain sky visibility + bent normals
- Precompute from the heightmap: horizon angles in 8–16 directions per texel → **sky visibility** and **bent normal**. Store in a texture.
- Use it for ambient and specular occlusion on terrain, rocks, vegetation, village. Canyons and valley floors should darken at large scale, not just in 2 m creases.

### 2.2 Single-bounce GI from the ground
- A low-res texture over the core (e.g. 512×256): `albedo × sunIrradiance × shadow × N·L` per texel.
- Blur it at several radii (mip chain).
- When shading, add bounce = sample at the surface, along the bent normal, weighted by `(1 − skyVisibility)`.
- Result: warm tuff light filling shaded canyon walls and chimney undersides. Update when the sun moves (it's cheap).
- The balloon envelope and basket should pick up ground bounce from below too.

### 2.3 Screen-space contact shadows
- A short depth-buffer ray march toward the sun (8–16 steps, ~1–3 m) for chimneys, crew, basket ropes, village. UE uses these to ground small objects.

### 2.4 Burner light
- When the burner fires: a strong warm point light lighting the envelope interior, the crew and the basket, with flicker. Shadowing optional (one cube or a cheap screen-space trace).

---

## Phase 3 — Atmosphere

### 3.1 Proper aerial perspective
File: `src/glsl/common.js` (`applyHaze`)
- Today the transmittance is one grey number. Real air scatters blue more than red. Use **RGB extinction** (Rayleigh + Mie), consistent with the sky LUT model.
- Better: an **aerial-perspective LUT** (froxels, Hillaire 2020) built from the same sky model, so distant valleys and the sky match at the horizon.
- In-scatter should respect the terrain shadow, so shaded valleys stay cooler and darker in the haze.

### 3.2 Volumetrics
- Shafts read the cascades, so they benefit from Phase 1. Check shaft edges are stable when flying.
- Add temporal reprojection to the quarter-res clouds if they still shimmer.
- Make cloud shadows on the ground move with the wind.

---

## Phase 4 — Surface detail

### 4.1 Near-camera terrain detail
- The heightmap is ~2.5 m per texel. Close up, cliffs look soft.
- Within ~150 m of the camera: extra vertex displacement from the tuff height maps on a finer LOD, plus **parallax occlusion mapping** on cliffs.
- Use triplanar mapping on steep faces to avoid stretched textures.

### 4.2 Kill tiling and sparkle
- Two-scale texture sampling plus stochastic/hex tiling so repeats don't show from the air.
- **Specular anti-aliasing** (Toksvig, or raise roughness from normal-map variance) to stop distant ground sparkling.
- Max anisotropic filtering on the texture arrays.

### 4.3 LOD transitions
- **Dithered cross-fades** for rocks, vegetation and village LOD switches (UE does this), instead of hard pops. TAA smooths the dither.

---

## Phase 5 — Camera and post (UE5 defaults)

### 5.1 Tonemapper
- Replace the fitted ACES with **UE5's filmic curve** at its default settings: Slope 0.88, Toe 0.55, Shoulder 0.26, Black clip 0, White clip 0.04. Keep the existing log-space contrast grade before it.

### 5.2 Exposure
- **Histogram** auto-exposure (ignore the darkest and brightest few %), with min/max clamps.
- Add **local exposure** (UE5 feature) so shaded cliffs stay readable next to bright snow and sky.

### 5.3 Bloom
- Wider and softer, lower intensity, no threshold, energy conserving. It should glow, not haze.

### 5.4 Motion blur
- Camera + object motion blur from the velocity the TAA already computes. Subtle (half shutter). Clamp it so slow drifting has none.

### 5.5 Lens finishing
- Very subtle depth of field for close-up cameras only.
- Tiny chromatic aberration at the frame edges.
- Light film grain, scaled by luminance.
- Check the unsharp mask doesn't leave halos on cliff silhouettes against the sky.

---

## Final check

- Shots at sunrise, clear afternoon, snowstorm, golden hour, sunset, blue hour and night, same cameras as the baseline. Put a before/after contact sheet in `shots/` (`tools/sheet.py` exists).
- Shimmer numbers and GPU timings for each tier, added to the bottom of this file.
- A short list of anything still short of the UE look, ranked, for the next pass.
