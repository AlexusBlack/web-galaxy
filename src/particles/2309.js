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
export function Particles_2309() {
  const particleSystem = new QUARKS.ParticleSystem({
    uTileCount: 1,
    vTileCount: 8,
    blendTiles: true,
    // Duration of the particle system in seconds
    duration: 2,

    // Whether the particle system should loop
    looping: true, // FOR DEMO ONLY

    // Emission shape (where particles are emitted from)
    shape: new MapFilteredEmitter({
      inner: new DiscEmitter({
        radius: [1000, 7.5, 1000],
        thickness: 1,
      }),
      map: galaxyMaps.get('0x8E960553'),
      aboveHeight: 0.1,
    }),
    emissionOverTime: new QUARKS.ConstantValue(0),

    emissionBursts: [
      {
        time: 0,
        count: new QUARKS.ConstantValue(3000),
        cycle: 1,
        interval: 0.1, // Interval between cycles
        probability: 1, // Probability of the burst occurring
      },
    ],

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
      new MapPin({ map: galaxyMaps.get('0x6F3E772B') }),
      new OpacityOverLife(
        new Keyframes([0, 0.5, 2, 1, 0.8, 0.6, 0.4, 0.2, 0], { vary: 0.5 })
      ),
    ],
  });

  return particleSystem;
}
