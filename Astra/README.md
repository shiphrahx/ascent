# Ascent — Astra

The Astra implementation of Ascent, a procedural Three.js hot-air balloon journey through late-winter Cappadocia.

Canonical repository: [shiphrahx/ascent](https://github.com/shiphrahx/ascent). This implementation and its future changes belong under `Astra/`, alongside the separate Opus implementation.

## Run the game

Open [`Ascent.html`](Ascent.html) in a browser. It includes its runtime assets and works offline.

Controls: Space/W for the burner, V/S to vent, A/D to rotate, C to change camera, drag to look or orbit, wheel to zoom, T to accelerate time, M for sound, and F for fullscreen.

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

Screenshots, validation reports, performance measurements, and historical comparison builds are in `captures/`. Open `captures/procedural-comparison.html` locally to compare the procedural graphics pass with its previous build. The current findings and remaining realism gaps are recorded in `captures/realism-summary.json`.

## Repository scope

Commit source, assets, scripts, the standalone game, and review artifacts under `Astra/`. Dependencies and local environment files are ignored. Use the shared repository root for Git operations; do not create a nested repository here or overwrite the Opus implementation.
