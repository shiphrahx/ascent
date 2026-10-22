# Ascent — Fidelity Plan, part 2

Follows `FIDELITY_PLAN.md`. Same working rules: one task = one commit, `npm run build` + `node tools/verify.mjs` after each, before/after shots from the same camera and hour, GPU cost checked.

## Ground rules for this pass

- **Lower-tier laptops come first.** Nothing in this pass may make `medium` or `lite` slower. Anything expensive is `high` only, behind a tier switch.
- **Medium target:** the Radeon 890M holds 60 fps at **render scale ≥ 0.9** (it's at 0.8 now; it was 1.0 before part 1).
- **No crew or basket-occupant model work.** Out of scope.
- Report shimmer numbers and GPU timings at the end of this file, as in part 1.

---

## Phase 1 — Find the leftover flicker in real flight

Test F (60 s chase flight, shadow-only view) only fell from 0.60 → 0.49 on the whole frame, while the lab tests fell ~85%. Find out what the rest is before fixing anything.

### 1.1 Split test F by source
- Add a mask pass to `tools/shimmer.mjs` so test F can score these separately: **hero balloon** (envelope, basket, ropes), **fleet balloons**, **terrain + rocks**, **vegetation**, **village**, **sky/edges against sky**.
- Run with `SHOT=1` and look at the heat map yourself.
- Add a per-feature A/B: run F with each of these toggled off in turn — PCSS, contact shadows, SSAO, motion blur, TAA history (alpha forced high), cascade blend band. Record the score change for each.

**Done when:** a table in this file shows the F score per source and per feature, and the top 2–3 causes are named.

### 1.2 Fix the top causes
- Fix the biggest causes from 1.1, in order, re-running F after each.
- Likely suspects to check: the hero balloon's own self-shadow (cascade 0 moves with it every frame), noise patterns not anchored to the moving balloon, TAA rejecting history on the balloon's fast-moving fabric, contact shadows' screen-space march changing with the camera.
- **Target:** F whole-frame ≤ 0.30 on `high`, cliff crop ≤ 0.20, with no new cost on `medium`/`lite`.

---

## Phase 2 — Small fixes from the review

### 2.1 Anchor jump causes a one-frame shadow tick
File: `src/world/shadows.js`
- When the anchor catches up (`distanceToSquared > half² × 0.0625`), it jumps to the **unsnapped** centre. That shifts the texel grid by a sub-texel amount, so shadow edges tick once every ~¼ cascade of travel.
- **Fix:** move the anchor only by whole texels in the light's x/y axes (plus any amount along `L`, which doesn't move the grid). Keep the grid phase continuous across the jump.
- Verify: test A with the cascades sliding far enough to trigger several jumps; the per-frame score must show no spikes at the jump frames.

### 2.2 Burner light shines through things
- The 90 m burner point light has no occlusion. Add a **cheap** one: e.g. limit it to the hemisphere below/beside the burner, and attenuate by the basket wall and envelope using analytic shapes (cylinder/ellipsoid tests in the shader). No shadow map.
- `high` only if it costs more than ~0.1 ms.

### 2.3 Tonemapper input fudge
- The UE5 curve's input is scaled by 0.72 to keep each hour's brightness. Move that into the per-hour exposure/grade values instead, so the curve runs at its true defaults. Check every hour's shot looks the same as now or better.

---

## Phase 3 — Win back medium and lite

### 3.1 Medium: back to ≥ 0.9 scale on the 890M
- Profile every pass added in part 1 on `medium` (`tools/gpu.mjs`, `tools/passes.mjs`).
- Fold per-pixel lookups: pack **sky visibility, ground bounce and heightmap terrain shadow** into as few textures/fetches as possible (one RGBA lookup if it fits).
- Run sky visibility and bounce at lower resolution or per-vertex on `medium` where the difference doesn't show from the air.
- Use the cheapest shadow filter on `medium` (no PCSS; fixed small kernel with blue noise).
- Local exposure on `medium`: lower-res, or every other frame with blending.

### 3.2 Lite: stop the every-3rd-frame shadow steps
- Lite refreshes shadows every third frame, which shows as steps under the moving sun.
- Keep the last two shadow results and **blend** between them over the gap (as the heightmap shadow already does on slow tiers), or spread one cascade per frame so each refresh is smaller.
- Must not add GPU cost on a software rasteriser: measure before and after.

---

## Phase 4 — Next visual step (high only)

Only start this after Phases 1–3 are done and committed.

### 4.1 Cliff shape between 150 m and 1 km
- This is most of the frame from a balloon, and it's still a 2.5 m heightmap.
- Add a **higher-resolution heightmap for the canyon areas only** (e.g. 1 m or 1.25 m tiles where the cliffs are), streamed or built at load, used for geometry within ~1 km on `high`.
- Add erosion detail (gullies, ledges, talus at cliff feet) into that heightmap at build time, matching the tuff strata already in the shader.
- `medium`/`lite` keep the current heightmap.

### 4.2 Clouds with structure
- Replace the soft quarter-res blobs on `high` with a proper cumulus march: base shape + detail erosion noise, higher resolution, temporal reprojection.
- Keep the current clouds for `medium`/`lite`.
- Shimmer test K must not get worse.

---

## Final check

- Shots at sunrise, clear afternoon, snowstorm, golden hour, sunset, blue hour and night, same cameras as before. Add a before/after contact sheet to `shots/`.
- Shimmer table (A, B, C, F split by source, K) and GPU timings per tier, at the bottom of this file.
- An updated ranked list of what's still short of the UE look.

---

## Results

### Phase 1: the leftover flicker in flight

Test F (60 s chase flight, shadow view, high, RTX), split by source with `tools/shimmer.mjs`'s new mask pass. "Over flat" is the old measure; "over held" compares with the same flight with the cascades frozen in the world (`#shadowhold`), which has every shadow edge but nothing that changes.

| source | share of pixels | shadow view | over flat | over held |
|---|---|---|---|---|
| hero balloon | 9.9% | 0.51 | 0.01 | 0.01 |
| fleet | 0.2% | 5.26 | 0.04 | 0.02 |
| terrain + rocks | 88.7% | 1.06 | 0.61 | 0.10 |
| village | 0.7% | 1.66 | 0.11 | 0.08 |
| sky edges | 0.5% | 3.28 | 0.43 | 0.17 |
| **whole frame / cliff crop** | | 1.04 / 0.77 | 0.55 / 0.30 | **0.09 / 0.05** |

Vegetation was under 0.1% of the pixels in this flight. Per feature (20 s runs of F, terrain score over flat; run-to-run noise about ±0.03):

| switched off | terrain over flat | flat control (whole frame) |
|---|---|---|
| nothing | 0.50 | 1.03 |
| PCSS (16 taps kept) | 0.53 | 1.03 |
| contact shadows | 0.47 | 1.03 |
| SSAO | 0.66 | **0.36** |
| TAA history (alpha 0.5) | 0.51 | 1.51 |
| cascade blend band | 0.48 | 1.03 |
| motion blur | 0.47 | 1.03 (the probe reads before the blur) |
| rock LOD swap in shadows | 0.56 | |
| rock culling outside the view | 0.53 | |
| terrain LODs (bias 3) | 0.48 | |
| old anchor jumps | 0.49 | |
| cascades held still | 0.42 | |

The top causes:
1. **SSAO noise under camera motion** was most of the real flicker in flight: switched off, the flat control fell from 1.03 to 0.36. Each pixel's samples turn a different way every frame, and a moving camera resamples the TAA history so it can't average them out.
2. **The probe itself, on the hero balloon.** It reprojected the envelope as if it were static, so the fabric scored 3.7. Following the balloon the way TAA does, it scores 0.47, the same in both views.
3. **Shadow edges moving across the screen.** No shadow feature moved the score; held still in the world, the cascades still scored 0.38 of the 0.44. What the live cascades add is 0.06 (20 s) to 0.09 (60 s).

### Phase 1.2: fixes

- SSAO: the upsample's four taps moved onto texel corners, so each averages a 2×2 block and the four cover 4×4 half-res pixels, depth weighted. Same cost; flat control in flight 0.72 → 0.46. A separate two-pass blur did less (0.52) and cost the 890M 0.24 ms.
- The probe follows the hero's envelope and basket.
- F's control is now the held cascades. **F on high: 0.09 / 0.05** over held (target 0.30 / 0.20). No new cost on any tier.

### Phase 2: small fixes

| item | status |
|---|---|
| 2.1 anchor jump | done; the anchor moves by whole texels across the light and freely along it. Test A slid fast enough to jump: a two-frame +0.15 spike before, none after |
| 2.2 burner light | done; the line to the flame is tested against an ellipsoid for the envelope and an upright cylinder for the basket, soft at the edges. Only pixels within 90 m of a lit burner pay, so every tier has it |
| 2.3 tone curve | done; the curve runs at UE's defaults, and each hour's exposure and shadow tint carry 0.72^(1/contrast). The storm changes contrast on top of the table, so it adjusts its exposure too. Seven hours from the same camera: mean colour within a level, sky and ground |

### Phase 3: medium and lite

All on the 890M at the reference view (1600×900, `#h=15`), unless it says otherwise.

| change | where | saved |
|---|---|---|
| frame pacing to the refresh (from `PERF_FIX.md`) | all | smoothness, not ms: an even 60 or 40 instead of 60/120 or 40/60 mixes |
| river reflection every frame on a cheap path | all | 1.9 ms every other frame → 1.0 ms every frame |
| near rocks cast and reflect with the simple shape | medium shadows, every reflection | main slice 1.90 → 1.54, reflection 1.98 → 1.46 |
| no shadow-casting ground grid | medium, lite | main slice 0.9 ms; the heightmap shadow already resolves 5 m there |
| height above ground from the instance, not the heightmap | all | eight fetches per rock, tree and house pixel |
| terrain shadow rebuild and bounce spread over their frames | medium, lite | no heavy third or fourth frame |
| far cascade every frame, lite one cascade a frame | medium, lite | no alternating frames |

What I didn't do from the plan's list: packing sky visibility, bounce and terrain shadow into one texture (they're at different resolutions, and the bounce needs its mips; switched off one at a time, only the bounce measured above the noise, about 1 ms), and local exposure at lower res (it measured nothing: it already reads a 64×36 map). Medium already had the cheapest shadow filter (8 taps, no blocker search).

Lite was done in the smoothness work: one cascade a frame in turn, which costs the same as all three every third frame. On SwiftShader it runs at about 1 fps before and after at 1600×900, so no regression, but lite isn't really playable on a software rasteriser at that size.

### Phase 4: high only

- **4.1 cliff shape.** A 1.25 m relief over the core, built on the GPU at load: a bicubic fit through the heightmap (the 2.5 m facets go), gullies about 14 m apart down the faces, the harder strata standing out as ledges, scree at the cliff feet. Gullies and ledges are worked out as depth into the face and turned into height through the slope, since that's the only way a heightmap can move a steep face. Stored in the core normal map's alpha, so no new texture unit. The 1.25 m mesh reaches 350 m and the 2.5 m one a kilometre, each taking coarser mips toward its switch. About 0.4 ms on the RTX.
- **4.2 clouds.** Their own pass at a third of the render size: the same broad shapes and places as before, two worley octaves of erosion, four light steps with Beer, powder and three multiple-scattering octaves, averaged over frames by view direction. K went from 0.13 / 0.05 to 0.06 / 0.02. 0.35 ms more at 15 h, 0.7 ms more under full overcast.

Also on the way: the shimmer probe's hero fix; `verify.mjs` now counts console warnings (puppeteer calls them 'warn', so it never had), which turned up the D3D X3595 warnings in SSAO and depth of field that had been there since part 1, now fixed; a stray early return in `shadeSurf` I'd added was making the 890M's compiler warn too.

### Before and after

`shots/fidelity2_before_after.png` (gitignored, on this machine): sunrise, clear afternoon, snowstorm, golden hour, sunset, blue hour and night from one fixed camera, then the dove cliff and the basket, start of part 2 on the left. Same colour at every hour; the cliffs and clouds are where it differs.

### GPU, 1600×900, render scale 1, `#h=15`

| tier / GPU | part 1 | now | notes |
|---|---|---|---|
| high / RTX 5070 Ti laptop | 8.6 ms* | 9.9 ms | +0.4 the cliffs, +0.35 the clouds; 16.4 ms at Cassia's 2525×1295, where the governor holds about 0.9 |
| medium / Radeon 890M | 17.7 ms (16.6 at 0.9) | 15.5 ms (14.4 at 0.9) | holds 60 at 0.9 scale or better, under the governor's 15.5 ms ceiling |
| lite on the 890M | 8.2 ms | 7.9 ms | |

\* Part 1's write-up said 7.4 ms; the same build measures 8.6 today. The laptop has been running tests all day and throttles, so compare within a column.

Read the per-pass numbers with care: since the pacer, `#gpuprof` runs at 60 fps where it used to run at 120, and passes that only work when the sun has moved (the terrain shadow) now work every frame instead of every other one, so their averages roughly doubled with no change per frame.

At Cassia's own window size the 890M still can't make 60 in flight (15–20 ms at the 0.67 floor); it paces at an even 40. See `PERF_FIX.md`.

### Shimmer, final (frame / crop, 8-bit levels)

Shadow view, flat control, and the difference (part 1's "flicker"). F's last column is over the held cascades instead.

| test | part 2 start (high) | high | medium | lite |
|---|---|---|---|---|
| A cascades sliding | 0.38 − 0.34 = 0.04 | 0.29 − 0.23 = 0.07 / 0.07 | 0.06 / 0.04 | 0.13 / 0.11 |
| B sun moving | | 0.34 − 0.23 = 0.11 / 0.11 | 0.13 / 0.10 | 0.21 / 0.16 |
| C floor | 0.38 − 0.34 = 0.04 | 0.29 − 0.23 = 0.07 / 0.07 | | |
| F 60 s flight | 0.49 / 0.26 over flat | 0.56 / 0.31 over flat, **0.10 / 0.04 over held** | | |
| K clouds (full image / sky) | 0.13 / 0.05 | 0.06 / 0.02 | | |

The differences went up a little while the image got steadier. The shadow view itself fell from 0.38 to 0.29 at the church cliff, but the flat control fell further (0.34 to 0.23) once SSAO stopped fizzing, and the subtraction undercounted while that noise sat in both. A sits on its own floor (C), as it did. The finer cliffs add 0.01 to the floor. F by source over the held cascades: hero −0.02, fleet 0.03, terrain and rocks 0.12, village 0.08, sky edges 0.07. Lite's control still renders without noise, so its numbers aren't comparable with the others.

### Still short of the UE look, ranked

1. **Village and crew models.** Houses are boxes and the crew is primitives. With the cliffs eroded, these are now what breaks the photoreal read first, up close.
2. **Medium at Cassia's own window.** The 890M holds 60 at the reference size but not at 2525×1295 in flight (15–20 ms at the 0.67 floor), so it paces at an even 40. The scene pass is 7–8 ms of it, mostly the terrain shader.
3. **GI richness.** One bounce, off the ground only: nothing off chimneys and houses, no colour bleed between objects, and the bounce isn't occluded.
4. **Cliffs are still a heightfield.** No overhangs, undercuts or real vertical walls; the new relief stops at a kilometre, and medium and lite don't get it at all.
5. **Shadows past 250 m.** Terrain self-shadow there comes from the heightmap shadow only (and medium and lite now rely on it inside the near slice too), so distant cliff shadows are soft next to virtual shadow maps.
6. **Clouds.** Structure now, but one cumulus layer only, no high cirrus, and the history doesn't follow the clouds' own drift (fine at today's wind, would smear in a gale).
7. **Outer terrain beyond 2.5 km.** 160 m texels, no sky visibility or bounce, flat far fields.
8. **Ground cover.** Sparse grass tufts; UE scenes carry dense foliage scatter.
9. **Lite on a real software rasteriser** runs at about 1 fps at 1600×900. Nobody on a GPU sees it, but the fallback isn't usable as it stands.
