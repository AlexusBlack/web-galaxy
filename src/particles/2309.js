import * as THREE from 'three';
import * as QUARKS from 'three.quarks';
import { RandomColorIndependent } from '../RandomColorIndependent.ts';
import { DiscEmitter } from '../emitters/DiscEmitter.js';
import { MapFilteredEmitter } from '../emitters/MapFilteredEmitter.js';
import { MapColor } from '../behaviors/MapColor.js';
import { MapPin } from '../behaviors/MapPin.js';
import { galaxyMaps } from '../effectmaps/galaxyRegistry.js';
import { Keyframes } from '../Keyframes.js';
import { OpacityOverLife } from '../OpacityOverLife.js';

// Requires loadGalaxyMaps() to have resolved -- see src/main.js.
//
// THE RADIUS IS 1000, NOT 2000. The Swarm source reads `source -ellipse (2000, 2000, 15)`,
// and those numbers are the FULL EXTENT, not radii: every map this system reads declares
// `-rect (-1000,-1000,1000,1000)`, i.e. 2000 units across. Taking 2000 as a radius puts 56%
// of all proposals outside the map entirely and drops rejection acceptance from 14.7% to
// 3.97%. Corroborated by the artwork: 0x8E960553's lit content spans px 238..1747 of 2048,
// reaching radius ~755 world units -- a comfortable fit inside 1000, impossible inside 2000.
//
// FIDELITY NOTE. 2309's own source declares only `mapEmit 0x8E960553 -aboveHeight 0.1`. The
// colour and height layers below are borrowed from its sibling systems in the same galaxy
// effect (particles-2186 uses `mapEmitColor 0x86601D55`; distribute-72 uses
// `mapPin 0x6F3E772B`), so that this one system shows the whole map pipeline while those
// siblings do not exist yet. Drop the two behaviors to get back to the literal source.
// `rate 3000 -loop 1` from the Swarm source, kept literal. The effective rate is this
// times the map's acceptance -- see EMISSION below.
const SWARM_RATE = 3000;

export function Particles_2309() {
  const shape = new MapFilteredEmitter({
    inner: new DiscEmitter({
      // HALF-HEIGHT 15, NOT 7.5. `source -ellipse (2000, 2000, 15)`: the first two are full
      // extents (radius 1000 -- confirmed three ways now, see the header), but the third
      // reads as a half-height. Taking it as a full extent too made the disc visibly ~2x
      // too flat against the original. Nothing in the maps can supply the difference: the
      // height map's variance is exactly 0 beyond radius ~700 (see MapPin below), so out in
      // the arms the pin is a constant offset and the ellipse is the ONLY source of
      // thickness. Spore evidently specifies a flat emitter's thickness as a half-extent.
      radius: [1000, 15, 1000],
      thickness: 1,
    }),
    map: galaxyMaps.get('0x8E960553'),
    aboveHeight: 0.1,
  });

  const particleSystem = new QUARKS.ParticleSystem({
    uTileCount: 1,
    vTileCount: 8,
    blendTiles: true,
    // Duration of the particle system in seconds
    duration: 1,

    // Whether the particle system should loop
    looping: true, // FOR DEMO ONLY

    // Emission shape (where particles are emitted from)
    shape,

    // EMISSION. Swarm's mapEmit is a one-shot cull -- a proposal that fails the map is
    // simply never born -- so the authored rate is DIVIDED by the map. Our emitter
    // resamples instead, which reproduces the same spatial distribution but would emit the
    // full 3000/s, about 10x too many. Scaling the rate by the measured acceptance
    // reproduces the cull exactly and costs nothing: 3000 * 0.0997 = 299/s.
    //
    // Written this way rather than as a literal 300 so the authored Swarm number survives
    // in the source, and so -aboveHeight keeps its real effect on the count.
    emissionOverTime: new QUARKS.ConstantValue(Math.round(SWARM_RATE * shape.acceptance)),

    // emissionBursts: [
    //   {
    //     time: 0,
    //     count: new QUARKS.ConstantValue(3000),
    //     cycle: 1,
    //     interval: 0.1, // Interval between cycles
    //     probability: 1, // Probability of the burst occurring
    //   },
    // ],

    // Initial particle properties
    startLife: new QUARKS.IntervalValue(1, 3),
    // prewarm: true,
    startSpeed: new QUARKS.ConstantValue(0),
    startSize: new QUARKS.IntervalValue(2, 33),
    startRotation: new QUARKS.IntervalValue(0, 2 * Math.PI),
    startColor: new RandomColorIndependent(
      new THREE.Vector4(0.40, 0.18, 0.24, 1),
      new THREE.Vector4(1.00, 1.00, 1.00, 1),
    ),

    // Whether to use world space coordinates
    worldSpace: true,

    // Material for particles
    material: new THREE.MeshBasicMaterial({
      map: new THREE.TextureLoader().load("images/SG_star_column_8pack.png"),
      transparent: true,
      blending: THREE.AdditiveBlending,
    }),

    // Behaviors controlling particle evolution over time
    behaviors: [
      new QUARKS.FrameOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0, 7/3, 14/3, 7), 0]])), // tile index 0 from the 4x4 grid
      new MapColor({ map: galaxyMaps.get('0x86601D55') }),
      // Borrowed, and it does less than it looks: SG_galaxy_heights is flat to the byte
      // beyond world radius ~700 and its variance only becomes significant inside ~300, so
      // over most of the arms this is a constant -1.76 unit shift, not added thickness.
      new MapPin({ map: galaxyMaps.get('0x6F3E772B') }),
      new OpacityOverLife(
        new Keyframes([0, 0.5, 2, 1, 0.8, 0.6, 0.4, 0.2, 0], { vary: 0.5 })
      ),
    ],
  });

  return particleSystem;
}
