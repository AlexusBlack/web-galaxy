# Web Galaxy animation project

## TODO
- Three.Quarks doesn't allow independent alpha control
- Three.Quarks seems to have bug in alpha over time sequence
- ~~Need LOD control~~ done: see `src/Effect.js`

## Layout
- `src/emitters/` — our own three.quarks emitter shapes, sharing `EmitterBase` (which owns the
  radius accessor, the LOD size seam and the unit samplers). `UniformSphereEmitter`
  (volume-uniform, unlike the stock one) is the isotropic case of `EllipsoidEmitter`;
  `DiscEmitter` samples a plane uniformly by *area*, which an ellipsoid cannot do.
  `MapFilteredEmitter` is a decorator, not a shape: it wraps any of the above and gates its
  output through an effect map by rejection. New custom shapes belong here.
- `src/effectmaps/` — Spore's `effectMap` system: textures combined by a small expression tree
  (`-op multiply|add`) and sampled at a particle's spawn position. `EffectMapTexture` decodes and
  mips, `EffectMap` is a tree node, `EffectMapRegistry` resolves and bakes the graph, and
  `galaxyMaps.js` transcribes the galaxy's declarations from the original Swarm source.
  **Maps must be preloaded** — `await loadGalaxyMaps()` before any effect is constructed; see
  `src/main.js`. `docs/spore-effectmap-system-spec.md` is the reverse-engineered spec, with the
  places measurement contradicts it noted in the code.
- `src/behaviors/` — our own three.quarks behaviors. `MapColor` (`mapEmitColor`) and `MapPin`
  (`mapPin`) are behaviors rather than emitter features because `ParticleSystem` applies the
  world-space transform *between* `emitterShape.initialize()` and `behaviors[].initialize()`, so
  only a behavior sees the true world position a `-worldSpace` rect is expressed in.
- `public/images/` — textures. They live under `public/` so `vite build` copies them; URLs stay
  `images/...` in both dev and the build.
