# Ascent — Smoothness fix (do this before continuing FIDELITY_PLAN_2)

The game feels less fluid since the fidelity pass, and frame rate drops when the balloon moves or turns to the sides. These are the likely causes, from a code review (not yet measured). Measure first, then fix.

## Rules
- Same as the fidelity plans: one task = one commit, `npm run build` + `node tools/verify.mjs`, GPU and CPU timings before and after.
- **Smoothness means even frame times**, not just a good average. Every check below reports frame-time spread.

---

## 1. Measure frame pacing

Add `tools/pacing.mjs`:
- A scripted flight that **turns and drifts left and right** along the valley for 30 s (river in and out of view), plus a straight-line flight for comparison.
- Log **every frame's** CPU time, GPU time (existing timer) and total time. Also log `pipe.scale` changes and when each "every Nth frame" pass runs.
- Report median, p95, p99, frames over 20 ms, and the **odd/even frame difference** (detects alternating heavy/light frames).
- Run on `high` (RTX) and `medium` (890M). Record the results here.

**Target:** p99 ≤ 1.5 × median, no alternating pattern, no scale changes during steady flight.

---

## 2. Likely causes, in order

### 2.1 River reflection renders the whole scene every other frame
File: `src/world/river.js`
- When the river is in view, the mirrored camera re-renders the scene **on alternate frames**. That makes frames alternate heavy/light: judder.
- Turning to the sides brings the river into view along the valley, which matches what the player sees.
- It got much worse after the fidelity pass: the reflection uses the **same, now much heavier** materials (16-tap PCSS, bounce, sky visibility…).

**Fix:**
- Give the reflection pass a **cheap shading path**: single-tap shadows (or heightmap shadow only), no PCSS, no contact shadows, no bounce, simplified materials.
- Render it **every frame at lower cost** (e.g. quarter resolution, fewer layers, smaller far plane), or split it into halves across frames so the cost per frame is even.
- Cull more aggressively for the reflection camera (only objects near the river banks and tall formations).

### 2.2 Resolution changes cause hitches
File: `src/main.js` (adaptive resolution)
- Every scale change **reallocates all render targets** and resets TAA history. A cost spike (like 2.1) drops the scale, then it climbs back: repeated hitches plus blurry/sharp jumps.
- **Fix:** allocate targets once at full size and render into a **viewport** of the current scale (no reallocation, history kept). Add hysteresis so scale only changes on sustained load, and smooth the change over several frames.
- Check the "too slow at the floor → switch to lite for the session" path never fires from a short spike.

### 2.3 Debug code in hot loops (current uncommitted work)
- `src/world/rocks.js` runs `/nocull/.test(location.hash)` **once per rock per frame**, and `/rockhi/` per variant. `src/world/shadows.js` and `src/main.js` have similar `/*XP*/` hooks.
- **Fix:** parse the hash once at boot into flags. Remove experiment hooks before committing.

### 2.4 Per-frame CPU work that doesn't need to happen every frame
- `rocks.update`, `veg.update`, `village.update`, `landmarks.update` rebuild and re-upload **every instance matrix every frame**. `veg.update` also allocates new vectors and arrays each frame (garbage collection pauses).
- **Fix:** only rebuild when the camera has moved or turned past a small threshold; reuse allocations; upload only changed ranges. Spread the work so it's even across frames.

### 2.5 Other "every Nth frame" work
- Medium/lite skip the far cascade on alternate frames and rebuild terrain shadows every third frame. Same alternating-cost problem.
- **Fix:** spread these as evenly sized slices every frame (e.g. a strip of the map per frame) rather than whole updates on some frames.

### 2.6 Check what else rises when turning
- With the pacing tool, compare straight vs side-to-side flight per pass (`tools/passes.mjs`). Look at: number of rock/tree instances and LOD cross-fades in view, shadow cascade caster counts, terrain chunks at the detailed LOD.

---

## Done when
- Side-to-side flight on `high` holds 60 fps with p99 ≤ 1.5 × median and no alternating pattern.
- `medium` holds 60 fps at its current scale or better.
- No visual loss compared with the latest shots (river reflection checked side by side).
- Results recorded at the bottom of this file. Then continue with `FIDELITY_PLAN_2.md`.
