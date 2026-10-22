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

---

## Results

### Baseline (before any fix), `tools/pacing.mjs`, 2525×1295 at 1×, 120 Hz display

| | leg | interval median / p95 / p99 | over 20 ms | odd/even | GPU median / p99 | scale |
|---|---|---|---|---|---|---|
| high, RTX 5070 Ti | straight | 8.5 / 34.5 / 38.2 | 434 of 2253 | 2.8 | 13.3 / 18.7 | 0.85 → 0.77, 3 changes |
| | side to side | 8.3 / 17.3 / 25.8 | 91 of 3272 | 0.1 | | 0.77 |
| medium, 890M | straight | 8.5 / 62.7 / 65.7 | 368 of 1416 | 5.8 | 19.8 / 25.6 | 0.67 (floor) |
| | side to side | 8.3 / 41.8 / 52.4 | 586 of 2070 | 1.1 | 13.2 / 21.5 | 0.67 → 0.76, 4 changes |

What it shows:
- The display runs at 120 Hz and both GPUs now take 13–20 ms a frame, so frames land on a mix of one and two refreshes, and the CPU blocks for 35–65 ms every few frames waiting on queued GPU work. That's the judder. Before the fidelity pass the frame fitted in 8.3 ms and ran a steady 120.
- The river reflection adds 1.7–3 ms GPU on alternate frames (and on medium, the far cascade skips on the opposite frames). Medium's terrain shadow rebuild (every 3rd frame) adds 1.5 ms, the bounce rebuild (every 4th) 2.2 ms.
- The resolution governor changed scale 3–4 times in 30 s of steady flight.

### After the fixes

| | leg | interval median / p95 / p99 | over 20 ms | odd/even | GPU median / p99 | scale |
|---|---|---|---|---|---|---|
| high, RTX 5070 Ti | straight | 16.7 / 16.9 / 17.0 | 1 of 1802 | 0.1 | 13.7 / 19.7 | 0.95 → 0.8, 2 changes |
| | side to side | 16.7 / 16.9 / 17.0 | 0 of 1809 | 0.1 | 10.4 / 15.3 | 0.8 → 1, 2 changes |
| medium, 890M | straight | 25.0 / 27.0 / 28.1 | (paced at 40) | 0.2 | 19.5 / 23.6 | 0.67 (floor) |
| | side to side | 24.9 / 25.6 / 27.9 | (paced at 40) | 0.2 | 15.0 / 19.9 | 0.67 (floor) |

What each item came to:
- **Pacing (new, the main one).** The loop reads the display's refresh from the frame callbacks and renders on every second one when a frame doesn't fit in one refresh: an even 60 on 120 Hz, and an even 40 when even the lowest render scale can't make 60. No more CPU stalls on queued GPU work.
- **2.1 river reflection.** Every frame now, on a cheap shading path (heightmap shadows only, no sky visibility, bounce or scanned textures), a third of the render size, and only the trees and houses near the water. It was vertex-bound, not pixel-bound: drawing the whole scene every frame cost more than before. On the 890M at the bridge: 1.0 ms every frame against 1.9 ms every other frame. Side by side, the water looks the same.
- **2.2 resolution changes.** Measured with `tools/rescale.mjs`: a scale change doesn't hitch on either GPU, and the TAA history already survives it (only the render targets are reallocated, not the output). The lite fallback needs 2 s of frames over 55 ms at the floor, so a short spike can't trip it. No change made.
- **2.3 debug hooks.** Removed before committing; the test switches left are parsed once at boot.
- **2.4 per-frame CPU work.** CPU is 5 ms median and under 10 ms at p99 on both GPUs, with no GC spikes in the logs, so nothing was changed.
- **2.5 every-Nth-frame work.** The terrain shadow rebuild and the bounce map are now spread over their frames in even slices; the far cascade renders every frame on medium (0.46 ms); lite refreshes one cascade per frame in turn.
- **2.6 straight vs side to side.** Weaving is lighter than the straight leg (the straight leg sits over the launch field with the fleet in view).

The GPU timer still shows an odd/even split of 1–5 ms with pacing on, but nothing in the code alternates any more and the frame intervals don't, so it reads as an artefact of timing frames with idle gaps between them.

**Not met:** medium doesn't hold 60. At Cassia's window size (2525×1295) the 890M needs 15–20 ms at the 0.67 floor, so it paces at an even 40 instead of juddering between 60 and 40. The medium cost work in `FIDELITY_PLAN_2.md` phase 3 is what gets it to 60.
