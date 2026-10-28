# Ascent — Astra

The Astra implementation of Ascent, a procedural Three.js hot-air balloon journey through late-winter Cappadocia.

Canonical repository: [shiphrahx/ascent](https://github.com/shiphrahx/ascent). This implementation and its future changes belong under `Astra/`, alongside the separate Opus implementation.

## Run the game

Open [`Ascent.html`](Ascent.html) in a browser. It includes its runtime assets and works offline.

Controls: arrows or WASD move relative to the camera; Space climbs; Shift or V descends; Q/E rotate the view. C changes camera, drag looks or orbits, the wheel zooms, T accelerates time, M toggles sound, and F toggles fullscreen. Remap keys in src/controls.js. Manual flight accelerates toward 10 m/s horizontally or 4 m/s vertically and brakes on release. Autopilot waits for 60 seconds without flight input, then blends in over three seconds; pressing a flight key takes control immediately.

Quality is selected from the reported GPU: discrete graphics use `high`, integrated or unknown adapters use `medium`, and software renderers use `lite`. Override detection by opening `Ascent.html?quality=high`, `?quality=medium`, or `?quality=lite`; reload to apply a different tier. The selected tier and GPU are available in `window.__ascent.tier` for diagnostics. Medium targets the integrated-GPU budget; lite further reduces shadows, reflections, cloud-cache and MSAA costs. High permits a larger pixel budget, reflection map, 4 m terrain grid, and 4096-pixel near shadows with every cascade refreshed each frame. Lower tiers blend all three cached shadow maps and refresh at most one cascade per frame, with near updates capped at 30 Hz. Tiers retain stable geometry and native resolution at 1440 x 900. Oversized windows use the tier's fixed pixel budget; medium and lite may upscale there, without repeatedly changing scale as frame rate varies.

## Build

Run these commands from the repository root:

```sh
cd Astra
npm ci
npm run build
```

The build generates seamless material maps from seeded mathematical fields and bundles the application into `Ascent.html`. Source files are in `src/`; the material generator is `tools/generate-materials.mjs`.

## Validate and capture

Install the Chromium browser used by the Playwright harness once:

```sh
npx playwright install chromium
```

Then run the appropriate checks from `Astra/`:

```sh
npm test
npm run test:graphics
npm run test:retina
npm run test:temporal
npm run preview
```

Screenshots, validation reports, performance measurements, and historical comparison builds are in `captures/`. The latest phase-by-phase results, per-tier measurements and remaining realism work are recorded in [FIDELITY_PLAN_2.md](FIDELITY_PLAN_2.md). Open [the Plan 2 review](captures/plan2-comparison.html) for task comparisons, six matched lighting views, a flight recording and final stability/pacing tables. The 70% landscape-flicker reduction target remains open; visual work continued with the owner's approval. The earlier [fidelity plan](FIDELITY_PLAN.md) and its captures remain available. Run `node benchmark.mjs --flight --tier=medium` for a 30-second frame-pacing trace; add `--recording` for 2848×1590. Run `node flicker.mjs --tier=medium` for the fixed-step scene flicker metric. Use `--tag=name` to retain successive reports. Use `node gpu-budget.mjs --tier=medium --tag=name` for asynchronous GPU timing at a fixed view. For the Plan 2 metrics, run `node tools/light-stability.mjs --tier=medium --tag=review`, `node tools/landscape-stability.mjs --tier=medium --tag=review`, and `node benchmark.mjs --flight --sunrise --tier=medium --tag=review`. Use lite or high for the other tiers. Run GPU harnesses sequentially.

Reproduce all three tiers and regenerate the final tables/review page with:

```sh
node tools/plan2-final-suite.mjs
node tools/plan2-final-metrics.mjs
node tools/plan2-report.mjs
```

The suite uses the archived original build for matched flicker baselines. Reports include the standalone build hash so the summary rejects stale measurements. Add `--sunrise --recording` to the flight benchmark to match the original 2538 x 1380 recording window.

## Repository scope

Commit source, assets, scripts, the standalone game, and review artifacts under `Astra/`. Dependencies and local environment files are ignored. Use the shared repository root for Git operations; do not create a nested repository here or overwrite the Opus implementation.
