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


### Phase 0.3 — frame pacing baseline

Extended benchmark.mjs with --sunrise: a normal-speed 6.0–7.5 sunrise during the existing 30-second scripted flight. --recording also matches the reported 2538 x 1380 window. Every frame is logged, separately counting completed application renders.

| Tier (1440 x 900, DPR 1) | FPS | Median ms | p95 ms | p99 ms | Frames >25 ms |
|---|---:|---:|---:|---:|---:|
| medium | 59.78 | 16.70 | 16.90 | 17.10 | 5/1794 |
| lite | 59.92 | 16.70 | 16.90 | 17.10 | 1/1798 |
| high | 39.76 | 16.80 | 49.90 | 66.61 | 522/1193 |

The recording-size medium run renders at the existing fixed 2269 x 1233 cap: 43.76 FPS, median 16.70 ms, p95 33.60 ms, p99 50.20 ms; 438/1314 frames exceed 25 ms. All four runs have zero observer frames without an application render. The reported 22% recorder duplication is not reproduced by application scheduling; these counters cannot certify an external recorder. High remains over budget on the 890M.

Baseline build hash: 7e713aee04644620f1f9ecd92181770fe2bb224f94cab10c345fac3962899f10. The original standalone build is preserved as captures/plan2-baseline.html.


### Phase 1.1 — smooth hero burner light

Removed the 19 rad/s modulation from the burner command. The hero light and envelope now use a frame-rate-independent 0.25 s attack / 0.6 s release. Only the point light receives a bounded 3.8% variation made from frequencies below 0.71 Hz. Visible flame shader flicker remains. Reduced point-light intensity from 22 to 12 and range from 38 m to 22 m.

Burner tests verify timing at 30/60/144 Hz and the modulation bound. Rebuilt the standalone game; all 51 gameplay/graphics/temporal checks pass. Personally inspected the matched sunrise captures (plan2-0-3-sunrise.png / plan2-1-1-sunrise.png). Full sunrise acceptance will be remeasured after the remaining lighting fixes.


### Phase 1.2 — deliberate autopilot burns

Added proportional thermal demand with separate on/off thresholds and a 1.5-second minimum dwell in either state. Burn strength follows demand during a blast; the smoothed light remains continuous. Controller diagnostics are available in __state.burnerController.

Synthetic rapid demand reversals obey the dwell bound. All 51 regression checks pass, including the full 700-second landing/restart simulation (maximum measured touchdown speed 0.266 m/s). Rebuilt Ascent.html and personally inspected the matched sunrise capture.


### Phase 1.3 — fleet and launch ramps

All fleet burners now use the same 0.25 s attack / 0.6 s release as the hero, driven by simulation time rather than a frame-count lerp. Grounded launch balloons use the ramp too. Pausing stops burner animation consistently. Rebuilt the offline game; burner units and all 51 regression checks pass. Personally inspected the matched sunrise capture.


### Phase 1.4 — continuous cached lighting

PMREM refreshes now cross-fade in a small HDR atlas for 1.2 s. The input is 256 pixels wide on medium/lite and 512 on high, down from 1024; surfaces retain a single environment lookup. Interrupted fades start from the displayed result. Terrain bounce blends its mean on lower tiers and its field on high. Cloud-shadow fields also blend on every tier; their previously hard lower-tier refresh was another measured flicker source. Review-time lighting fades finish even when simulation is paused.

GPU transition tests cover HDR preservation, interrupted fades, settled work and render-state restoration. All 51 core regression checks plus medium/high cloud and high terrain-lighting fixtures pass. Matched sunrise captures inspected. Medium native pacing: **59.95 FPS**, median **16.70 ms**, p95 **16.90 ms**, p99 **17.00 ms**, **0/1799** frames over 25 ms (baseline 5/1794).


### Phase 1.5 — finer, symmetric exposure metering

Metering now uses 256 bins (0.094 EV spacing), an asynchronous sample every 150 ms, and the same 1.3/s adaptation rate in both directions. Tests verify adjacent-bin spacing, symmetric adaptation, outlier rejection and async GPU readbacks; middle grey meters to 1.014x. All 51 regression checks pass; the standalone game is rebuilt and the matched capture inspected.

The repeated sunrise test removes the dominant 3.03 Hz envelope pulse. Largest detrended jumps are now 0.171 envelope, 0.513 whole, 0.067 ground and 1.259 far crop, versus 0.566 / 1.205 / 7.689 / 1.387 initially. **Phase 1 acceptance remains open** because the visible sky cache still changes in tiles. A small 6.23 Hz envelope peak also needs checking for crop-tracking quantisation before it can be attributed to lighting. These remaining causes will be addressed before moving to Phase 2.


### Phase 1.6 ? remaining sky-cache steps and measurement correction

The visible sky changed abruptly once per cache sweep (about 61 frames). Tiles now fade over 0.4 s between two alternating caches. Cache swapping avoids a full-size copy on every update; environment generation samples the displayed blend.

The 6.23 Hz envelope peak was caused by rounding its tracked crop to whole pixels during ascent. The light harness now samples the moving crop bilinearly; a synthetic moving-gradient test verifies that tracking adds no steps. Re-ran the original build and current build with the same corrected metric, retaining both reports.

| Largest detrended jump (levels) | Corrected baseline | After Phase 1 |
|---|---:|---:|
| whole | 1.2674 | 0.0145 |
| envelope | 0.5325 | 0.0402 |
| ground | 7.7241 | 0.0720 |
| far | 1.4730 | 0.0223 |

Every crop is below the 0.5-level jump limit. The old 3.03 Hz envelope pulse falls from approximately 1.239 to 0.002 levels amplitude. The largest residual 1?10 Hz envelope maximum is 0.022 levels at 1.50 Hz; the full spectrum is retained rather than claiming a mathematically zero spectrum. No visible periodic burner pulse remains.

All 51 regression checks and crop-tracking units pass; matched captures inspected. Pacing varies across the session: a fresh original-build run reaches 50.62 FPS and the new build 48.69 FPS, versus approximately 60 earlier. Paired fixed-view GPU means are 17.20 / 17.03 ms (baseline/current), with p99 34.64 / 24.77 ms; CPU submission means are 7.63 / 9.96 ms. These measurements do not establish a sustained-60 guarantee or certify every tier. The pacing gate remains open for Phase 4. Raw traces are retained.

### Phase 2 � centred chase camera

Chase view now aims at the rotated envelope centre, slightly above it for a lower-screen composition. An exact critically damped spring follows position without overshoot; released mouse orbit returns over approximately 1.5 s. Terrain, fleet and envelope exclusions remain active, and basket/cinematic views retain their previous paths.

The 601-frame turning-flight capture moves from a maximum 16.98% horizontal offset to below 0.000001% (the camera always looks at the envelope centre), passing the �5% limit. Inspected the turn and matched sunrise captures. Frame-independent spring checks and all 51 gameplay/graphics/temporal checks pass. Rebuilt the standalone game.

### Phase 3.1 � camera-relative key map

All bindings live in src/controls.js. Arrows/WASD translate relative to the view; Space climbs, Shift/V descends and Q/E orbits. Camera, sound, fullscreen and time bindings are preserved. The high-DPI rotation check now measures Q/E camera orbit instead of the removed A-key balloon yaw.

Rebuilt the standalone game. All 51 core checks and eight high-DPI checks pass, with no browser errors. Inspected the matched sunrise capture. Response speed and the idle handoff are deliberately tuned in the next two commits.

### Phase 3.2 � direct acceleration and braking

Manual input now drives a camera-relative target velocity: 10 m/s horizontally and 4 m/s vertically, 0.24 s acceleration and 0.20 s braking constants. Wind is capped at 2 m/s during input and 0.25 m/s while braking; it cannot reverse a held direction. The envelope leans into travel and the basket follows with a gentler lag. The burner retains its smooth light ramp while climbing.

The actual browser key handlers and flight code reach 7.10 m/s in camera-right after 0.3 s, slow to 0.345 m/s after 0.7 s release, and climb at 2.854 m/s after 0.3 s. Replaced the obsolete inertialLift expectation with releaseBrakes and added the requested response assertions. Unit checks also cover 30/60/144 Hz with opposing wind. Full response traces are retained in captures/plan2-response-3-2.json.

All 54 gameplay/graphics/temporal checks pass. Rebuilt the offline game and inspected the matched capture.

### Phase 3.3 � deliberate autopilot handoff

Flight keys refresh a 60-second manual window while held and on release. The initial journey still starts in attract mode. After the idle window, automatic burner demand and velocity response blend in over three seconds; a flight key immediately sets automatic contribution to zero.

Browser tests exercise the real key handlers and flight integration: automatic weight is 0 at 59.9 s, 0.033 at 60.1 s, 0.500 at 61.5 s and 1 after 63 s. Immediate takeover and a key held for 61 s both retain weight 0. All 58 regression checks pass, including the existing 700-second landing/restart simulation. Rebuilt the game and inspected the matched sunrise capture; response traces are retained.

### Phase 3.4 � soft obstacle approach

An eight-metre approach field adjusts velocity normal to rock, building and fleet boundaries, preserving tangential movement so the balloon can slide around them. Manual descent slows near the ground. Existing terrain/envelope projections, fleet separation and landing guards remain in place; exact coincident centres now have a finite escape direction.

Sustained input toward all three obstacle shapes settles outside the collision boundary at 30/60/144 Hz without positional teleportation. All 58 regression checks pass, including terrain clearance and the 700-second automatic landing/restart. Rebuilt and inspected the matched sunrise capture. Phase 3's response and handoff acceptance checks are complete.

### Phase 4.1 � stable shadow caches and low-angle filtering

The isolated repeat after Phase 3 gives A/B/C/D whole RMS 0.000051 / 0.000777 / 0.001189 / 0.001667 and foreground RMS 0.000027 / 0.000280 / 0.001211 / 0.001458. Lighting fixes reduce the still-camera running case, but ascent still dominates; the 70% D target is not yet met.

Verified that high updates all three cascades every frame (40/40/40), while medium/lite interpolate their staggered distant depth maps (40/7/3 updates during ascent). Rendered shadow cameras remain texel-snapped within 2.1e-9 texels while both camera and sun move. The probe uses the cached map's actual rendering pose; comparing a queued light position to an older cached orientation was an invalid initial measurement. No synchronous unpack-state queries occur.

Low sunlight now widens the existing fixed Poisson filter by up to 65%, with no additional taps or maps. All 58 core checks and the shadow fixtures on all three tiers pass. Rebuilt and inspected the matched sunrise capture.

### Phase 4.2 � motion-independent static history

Removed the 0.65-pixel motion cutoff. Static surfaces now retain depth-reprojected, variance-clipped history at every ordinary camera speed. Broad surfaces use 90% history; high-contrast silhouettes use 25% to preserve fine coverage. Depth mismatches now reject history completely, and moving actors/flames retain their reactive rejection. The closest-depth silhouette rule remains.

All six supersampled-reference cases improve or preserve coverage and flicker, including fast translation and rotation. Branch contrast stays within 99.7�103.5% of the reference; actor trail error is zero. A new movingHistory assertion prevents restoring the old cutoff. The full 59-check regression suite passes; rebuilt and inspected the matched capture. A projection-jitter experiment failed reference accuracy and was discarded.

The landscape harness now seeds simulation time identically through the API shared with the archived build; case D alone and case D in the full suite start at 193 seconds. The earlier per-pixel metric is unchanged, with optional regional diagnostics tested to preserve its value. The matched D pair measures 0.002146 ? 0.001749 whole and 0.001687 ? 0.001448 foreground: **18.5% / 14.2% reduction**, still below 70%. The temporal audit confirms approximately 85�90% history on broad foreground surfaces. The full four-case pair is being retained for further diagnosis; Phase 4 acceptance remains open.

### Phase 4.3 � bounded near-shadow work and pacing

Medium/lite now refresh at most one cascade per normal frame and cross-fade the near map as well as the two distant maps. Near updates are capped at 30 Hz, with minimum frame spacing to avoid expanding cached work on slow devices. High continues to render all three maps every frame. The first render is explicitly forced so cached scheduling cannot cancel initialization. Updated the slow-frame assertion to verify the new per-frame work bound, rather than demanding every-frame near updates on lower tiers.

Latest 30-second sunrise flight on the Radeon 890M at 1440 x 900, DPR 1: **59.78 FPS**, median **16.70 ms**, p95 **16.90 ms**, p99 **17.00 ms**, **5/1794** frames over 25 ms and no skipped application renders. This run meets the pacing target; earlier session variability remains documented. The instrumented scene-pass GPU mean falls from 11.57 to 10.82 ms; these diagnostic runs include query overhead and are not presentation benchmarks.

The four-case harness now uses a fresh scene and the same 100-second simulation seed for each case. Seeding also advances ordinary frames long enough to finish the opening fade, and scoring asserts that fade is zero. This corrects the intermediate seeded A/C runs, which could retain part of that fade; the D pairs were running long enough to clear it. Retained earlier reports are historical diagnostics, not the final per-tier comparison.

Correctly isolated D: baseline **0.002188 whole / 0.001723 foreground**; current **0.001750 / 0.001434**, reductions **20.0% / 16.8%**. The **70% flicker gate remains open**. On 28 October the owner explicitly authorized proceeding with Phase 5 while retaining this shortfall in the results.

All 59 core checks and medium/lite/high shadow fixtures pass. Rebuilt the standalone game and inspected the matched sunrise and near-terrain review captures.

### Phase 5.1 � erosion in the near corridor

Terracing now begins 24 m from the flight path and reaches full strength by 115 m, rather than 65�170 m. Gullies extend into the nearer slopes, with widths that survive the existing grid. Broad, low talus fans add deposited material at their feet while preserving the central channel. These fields are baked into the same terrain triangles used by collision; the grid size and runtime shader cost are unchanged.

Landform tests confirm substantial near-corridor cuts and fans, bounded deposition and a clear central channel. All 59 core checks pass, including rendered-terrain/collision agreement and landing. Rebuilt and personally compared the near-terrain and sunrise captures. The lower slopes are more segmented, although the medium tier's eight-metre grid still limits fine erosion detail.

### Phase 5.2 � irregular river surface and wet margins

World-space ripples now combine several scales with noise-warped phases instead of two regular bands. Reflection filtering is broader, grazing reflections are less dominant, silty colour varies independently of the waves, and shore ice uses an irregular field. Wet soil transitions over a wider, uneven margin with a less abrupt colour/roughness change.

All 59 core checks and the river depth/shoreline fixture pass, with finite HDR output and shoreline error below 0.003 m. Reflection sample counts and update frequency are unchanged. Rebuilt and compared the low river view and matched sunrise capture. The river reads less regularly striped, though its narrow channel and simplified reflection still fall short of a detailed water simulation.


### Phase 5.3 ? broad, sheltered snow deposits

Snow now accumulates in broader drifts, favours sheltered northern faces more strongly and recedes on steep slopes. A wider derivative-filtered edge replaces the small speckles, with slightly darker snow albedo and higher roughness. Coverage reuses the existing terrain visibility field.

The snow fixture confirms north/south coverage 0.592 / 0.012, sheltered/open 1.000 / 0.318, no cliff or melted coverage and soft subpixel transitions. All 59 core checks pass. Rebuilt the game and inspected the close snow pair and sunrise capture: deposits form continuous patches with exposed rock between them. Fine wind-carved snow geometry remains outside this material treatment.
