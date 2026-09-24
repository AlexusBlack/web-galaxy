# Web Galaxy animation project

## TODO
- Three.Quarks doesn't allow independent alpha control
- Three.Quarks seems to have bug in alpha over time sequence
- ~~Need LOD control~~ done: see `src/Effect.js`

## Layout
- `src/emitters/` — our own three.quarks emitter shapes, sharing `EmitterBase`:
  `UniformSphereEmitter` (volume-uniform, unlike the stock one) is the isotropic case of
  `EllipsoidEmitter`. New custom shapes belong here.
