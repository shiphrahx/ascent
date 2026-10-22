# Ascent — Astra

The Astra implementation of Ascent, a procedural Three.js hot-air balloon journey through late-winter Cappadocia.

Canonical repository: [shiphrahx/ascent](https://github.com/shiphrahx/ascent). This implementation and its future changes belong under `Astra/`, alongside the separate Opus implementation.

## Run the game

Open [`Ascent.html`](Ascent.html) in a browser. It includes its runtime assets and works offline.

Controls: Space/W for the burner, V/S to vent, A/D to rotate, C to change camera, drag to look or orbit, wheel to zoom, T to accelerate time, M for sound, and F for fullscreen.

Quality is selected from the reported GPU: discrete graphics use `high`, integrated or unknown adapters use `medium`, and software renderers use `lite`. Override detection by opening `Ascent.html?quality=high`, `?quality=medium`, or `?quality=lite`; reload to apply a different tier. The selected tier and GPU are available in `window.__ascent.tier` for diagnostics. Medium preserves the original rendering budget; lite reduces shadow, reflection, cloud-cache and MSAA costs. High permits a larger pixel budget, reflection map, and 4 m terrain grid near the valley. Tiers retain stable geometry and a native CSS-pixel resolution floor.

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

Screenshots, validation reports, performance measurements, and historical comparison builds are in `captures/`. The phase-by-phase results and remaining realism work are recorded in [FIDELITY_PLAN.md](FIDELITY_PLAN.md). Open `captures/fidelity-1-3-comparison.html` for matched landform views. Run `node benchmark.mjs --flight --tier=medium` for a 30-second frame-pacing trace; add `--recording` for 2848×1590. Run `node flicker.mjs --tier=medium` for the fixed-step scene flicker metric. Use `--tag=name` to retain successive reports. Run GPU harnesses sequentially.

## Repository scope

Commit source, assets, scripts, the standalone game, and review artifacts under `Astra/`. Dependencies and local environment files are ignored. Use the shared repository root for Git operations; do not create a nested repository here or overwrite the Opus implementation.
