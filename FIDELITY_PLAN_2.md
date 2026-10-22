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
