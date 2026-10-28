# Astra — Plan 2: blinking, camera, controls, flicker

Follows `FIDELITY_PLAN.md`. Based on a 21 s screen recording of the current build (chase camera, sunrise, balloon ascending), measured frame by frame, with each cause traced to the code.

Work top to bottom. **Phases 1–3 come before any new visual work.**

## How to work

- Follow `AGENTS.md`: run from `Astra/`, rebuild with `npm run build`, one `Co-authored-by: Codex <noreply@openai.com>` trailer per commit.
- **One task = one commit.** After each: `npm test`, `npm run test:graphics`, `npm run test:temporal`, plus before/after captures from the same camera and hour. Look at them yourself.
- **Performance budget:** the Radeon 890M holds 60 fps at 1440×900, DPR 1. No task may make any tier slower without a tier switch.
- Update existing tests whose expectations change (e.g. `inertialLift`, `autopilotResumes` in `verify.mjs`). Don't delete a test to make it pass.

---

## Phase 0 — Measure what the player sees

**0.1 Light-stability test** (`tools/light-stability.mjs`)
- Fixed camera, time running at normal speed through sunrise (hour 6.0 → 7.5), balloon ascending with the burner in use.
- Per frame, log mean luminance of: whole frame, the hero envelope, the ground under the balloon, a far landscape crop.
- Report: (a) largest single-frame jump not explained by the smooth trend, (b) the frequency spectrum of the envelope signal.
- Record the baseline below. Expected today: a peak at ~3 Hz on the envelope, and steps every ~1.2 s on the whole frame.

**0.2 Flicker test**
- 10 s captures: (A) camera still, time frozen; (B) camera still, time running; (C) camera ascending, time frozen; (D) ascending, time running.
- Score per-pixel frame-to-frame change not explained by the smooth trend, for the whole frame and a foreground-terrain crop.

**0.3 Frame pacing test**
- Log every frame's time during a scripted 30 s flight. Report median, p95, p99 and frames over 25 ms.
- The recording had ~22% duplicate frames (about 23 fps at 2538×1380). Confirm with this test, not the recorder.

---

## Phase 1 — Stop the blinking (causes confirmed)

### 1.1 Burner light pulses at 3 Hz
Files: `src/main.js` (`hero.update(elapsed, burn ? (.85 + .15*Math.sin(elapsed*19)) : 0, ...)`), `src/balloon.js` (`light.intensity = burn.value*22`)
- `sin(elapsed*19)` is a 3.0 Hz, ±15% pulse on a point light of intensity 22. The recording shows a 3 Hz pulse on the envelope.
- **Fix:**
  - Drive the light from a **smoothed burner level**: attack ~0.25 s, release ~0.6 s. Never switch intensity in one frame.
  - Replace the sine with gentle, low-frequency noise: ≤ 4% amplitude, nothing above ~1.5 Hz.
  - Keep the visible flame flicker in the flame shader (fast flicker is fine on the flame itself, not on the light it casts).
  - Review the light's intensity and 38 m range so it warms the envelope interior and basket without washing the ground.

### 1.2 Autopilot switches the burner on and off repeatedly
File: `src/main.js` (`burn = target - heroPos.y - vy*5 > 4 && thermal < 1.4`)
- This is bang-bang control: the burner toggles fully on/off many times while climbing, so the light flashes.
- **Fix:** proportional control with hysteresis and **minimum on/off times** (≥ 1.5 s), so burns are deliberate blasts. Combined with 1.1, no light change is ever instant.

### 1.3 Fleet burners switch hard
File: `src/main.js` (`const flare = Math.sin(elapsed*.45 + b.phase) > .75 ? 1 : 0`)
- Replace the hard threshold with a smooth ramp (attack/release as in 1.1).

### 1.4 Sky lighting swaps in jumps every ~1.2 s
File: `src/atmosphere.js` (`if (!environment || Math.abs(hour - environmentHour) > .06 || ...) { ... pmrem.fromEquirectangular(...) }`)
- The PMREM environment is rebuilt every 0.06 game hours (~1.2 s at normal speed) and replaced at once. At sunrise each swap visibly jumps the whole scene, then exposure drifts back: a sawtooth in the recording.
- **Fix (pick the cheapest that passes 0.1):**
  - Keep **two** PMREM results and **cross-fade** between them over the refresh interval (patch the env-map shader chunk to sample both and `mix`), **or**
  - Rebuild a small environment (e.g. 128–256 px input) far more often, spreading the PMREM work across frames so no single frame spikes.
- Same treatment for any other lighting that refreshes in steps:
  - `src/terrain-lighting.js` bounce/visibility update (every 0.5 s or on threshold): blend old and new.
  - `src/lighting.js` staggered cascade refresh (0.1 s / 0.22 s intervals): see Phase 4.

### 1.5 Exposure metering
Files: `src/exposure.js`, `src/exposure-histogram.js`
- 64 bins over 24 EV = 0.375 EV per bin, sampled every 500 ms. The target moves in coarse steps.
- **Fix:** 256 bins (or interpolate within bins), sample every 100–200 ms, and adapt at the same, slower speed up and down (no 2.8 vs 1.3 asymmetry that makes it hunt after every lighting step).

**Phase 1 done when:** test 0.1 shows no peak between 1–10 Hz on the envelope, and no single-frame jump above 0.5 luminance levels beyond the smooth trend, through the whole sunrise.

---

## Phase 2 — Centre the balloon

File: `src/main.js` (camera update)
- Chase mode aims at `focus + (-cos(a)*17, 7, sin(a)*17)`: a point **17 m to the side** of the balloon, so it sits on the right of the screen.
- **Fix:**
  - Aim at the **balloon's centre** (envelope mid-height). The balloon sits in the horizontal centre, slightly below the vertical centre so the landscape ahead is visible.
  - Place the camera **behind** the balloon relative to the camera-relative "forward" used by the controls (Phase 3), at a slightly raised angle.
  - Follow with a **critically damped spring**: responsive, no overshoot. The balloon must never drift off-centre when it moves.
  - Mouse drag can still orbit; after release, ease back behind the balloon over ~1.5 s.
  - Keep the existing collision push-outs (terrain, fleet, own envelope).
- Cinematic and basket cameras unchanged.

**Done when:** in a capture of a scripted flight with turns, the envelope centre stays within ±5% of screen width from centre.

---

## Phase 3 — Arcade controls ("you ask to go right, and it goes")

File: `src/main.js` (`flight()`, key handling)

The owner wants responsiveness over realism. Today:
- A/D only **spin** the balloon at 0.12 rad/s (7°/s). Sideways motion comes only from wind (`vx = lerp(vx, w.x, dt*.35)`).
- Burner → `thermal` → `vy` is a slow chain: several seconds before the balloon climbs or stops.
- Any key hands control back to the autopilot after 10 s.

### 3.1 New control scheme
Put the key map in one config object so the owner can change it.
- **Arrow keys / WASD:** move left, right, forward, back, **relative to the camera view**.
- **Space:** climb. **Shift** (and V): descend.
- **Q / E:** rotate the view around the balloon.
- C (camera), M (sound), F (fullscreen), T (time) unchanged.

### 3.2 Response
- Input sets a **target velocity**; the balloon reaches it with a time constant of ~0.2–0.3 s and eases to a stop ~0.5 s after release.
- Horizontal top speed ~10 m/s (tune by feel); vertical ~4 m/s.
- Wind adds a **small** drift (~20% of top speed), never enough to override input.
- Visual feedback so it feels driven: the balloon **tilts slightly** into the direction of travel, the basket swings a little, the burner fires (with the smoothed light from 1.1) while climbing.

### 3.3 Autopilot
- Off while the player is flying. Only takes over after **60 s** without input (or as an "attract mode" before the first key press), and **blends in over 3 s**, never snapping.
- The first key press takes control instantly.

### 3.4 Safety
- Keep terrain floor, rock and fleet collision, and the landing sequence. Soft-push away from obstacles rather than hard stops.

**Done when** (scripted input test in `verify.mjs`):
- Press right: the balloon reaches 50% of top speed within **0.3 s**, in the camera's right direction.
- Release: speed below 10% within **0.7 s**.
- Press Space: climbing starts within **0.3 s**.
- No autopilot input while keys were pressed in the last 60 s.

---

## Phase 4 — Landscape flicker

Use test 0.2 first to find which cause dominates, and record the scores.

### 4.1 Shadows under a moving sun
- At sunrise the sun moves fast, so cascades re-rasterise at a new angle every frame.
- Check three's CSM texel snapping holds while the camera ascends (test C vs A).
- Refresh every cascade every frame on `high`; on lower tiers **blend** old and new maps rather than stepping (the staggered 0.1 s / 0.22 s refresh steps visibly).
- Soften the filter slightly at low sun angles if crawl remains.

### 4.2 Temporal smoothing turns off when moving
File: `src/temporal.js` ("Reprojection is deliberately limited to slow motion")
- During the climb the history is discarded, so per-frame noise shows on the whole landscape.
- **Fix:** keep history for **static** surfaces at any camera speed, using depth reprojection with variance clipping; only reject history for moving actors (hero, fleet, flames). Protect thin branches with the closest-depth rule already there.

### 4.3 Frame pacing
- Fix any periodic heavy frames found in 0.3 (PMREM rebuilds, terrain bounce bakes, shadow staggering) by spreading the work evenly.
- **Target:** 60 fps at DPR 1 on the 890M; p99 ≤ 1.5 × median.

**Phase 4 done when:** test 0.2 scores for (D) drop by ≥ 70% from baseline, and pacing meets the target.

---

## Phase 5 — Remaining visuals

Only after Phases 1–4.
- **Foreground hills** still read as smooth blobs: make sure strata terracing, gullies and talus from `landforms.js` apply to the near terrain along the flight path, not just distant cliffs.
- **River** looks like a pale striped road: remove the repeating bands (world-space, multi-scale ripples, not UV-aligned scrolling), add depth-based silty colour, soft wet banks, rougher reflections.
- **Snow** patches look pasted on: generate in the shader from slope, aspect and shade, with soft edges.
- **Sunrise grade** is a flat purple-grey: check sun colour, ambient balance and exposure once 1.4–1.5 are done.

---

## Final check

- Captures at sunrise, midday, snowstorm, golden hour, sunset and night, matching cameras, with a before/after page in `captures/`.
- A short screen capture of the scripted flight showing the centred balloon and the controls responding.
- Light-stability, flicker and pacing numbers per tier, at the bottom of this file.
- A ranked list of what's still short of the UE look.

## Results

### Phase 0.1 — light baseline (28 October 2026)

Implemented tools/light-stability.mjs: 1,801 frames at 60 Hz, normal-speed 6.0–7.5 sunrise, fixed camera, ascending hero and continuous burner. Reports include build hash, GPU, every sample, four luminance signals, detrended jumps and Hann-windowed spectra. Synthetic trend, 3 Hz pulse and step tests pass.

Medium baseline: envelope peak **3.032 Hz / 1.243 levels amplitude**; largest trend-subtracted jump **0.566** envelope, **1.205** whole frame, **7.689** ground, **1.387** far landscape (8-bit display luminance). The expected burner pulse is confirmed. See captures/plan2-light-medium-baseline.json. Personally inspected the matched 6.55-hour image.

Gameplay (17), graphics (23), temporal (11) checks pass without errors/warnings. Runtime unchanged. Commit publication uses the GitHub connector against the existing main tree because this workspace has no Git metadata; all published paths remain under Astra/.


### Phase 0.2 — isolated landscape baseline

Added tools/landscape-stability.mjs: four ten-second, 601-frame cases, linear-luminance residuals over the whole frame and the same foreground crop. Frozen time freezes simulation as well as the sun. Exposure is held at 1.8 in every case, and moving actors/particles are excluded.

| Case | Whole RMS | Foreground RMS |
|---|---:|---:|
| A: still / frozen | 0.00004816 | 0.00002614 |
| B: still / running | 0.00166887 | 0.00082225 |
| C: ascending / frozen | 0.00118831 | 0.00121097 |
| D: ascending / running | 0.00219242 | 0.00171506 |

Both light progression and camera movement contribute; motion dominates the foreground crop. Phase 4 targets for D are at most 0.00065773 whole / 0.00051452 foreground (70% reduction). Baseline captures and raw samples are retained.
