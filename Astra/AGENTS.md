# Astra implementation

- The canonical repository is `https://github.com/shiphrahx/ascent`.
- This implementation belongs entirely under the repository's `Astra/` directory. Keep source, assets, build scripts, tests, generated game, and review artifacts here.
- Preserve sibling implementations, including Opus. Do not modify their files unless the user explicitly requests it.
- Run this implementation's commands from `Astra/`. Stage its changes with explicit `Astra/` paths from the repository root.
- Use the shared repository's Git history. Do not initialize a separate repository inside `Astra/` or replace the remote history.
- Rebuild `Ascent.html` with `npm run build` after changes to runtime sources or material generation. The standalone game embeds its runtime assets and works offline.
- Use the relevant existing validation scripts for the change. Keep `node_modules` and local environment files out of commits.
