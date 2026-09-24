import * as THREE from 'three';
import * as QUARKS from 'three.quarks';
import { RandomColorIndependent } from '../RandomColorIndependent.ts';
import { UniformSphereEmitter } from '../UniformSphereEmitter.js';
import { Keyframes } from '../Keyframes.js';
import { OpacityOverLife } from '../OpacityOverLife.js';

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
    shape: new UniformSphereEmitter({
      radius: 1000,
      thickness: 1,
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
      new OpacityOverLife(
        new Keyframes([0, 0.5, 2, 1, 0.8, 0.6, 0.4, 0.2, 0], { vary: 0.5 })
      ),
    ],
  });

  return particleSystem;
}
