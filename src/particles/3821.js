import * as THREE from 'three';
import * as QUARKS from 'three.quarks';
import { RandomColorIndependent } from '../RandomColorIndependent.ts';
import { UniformSphereEmitter } from '../emitters/UniformSphereEmitter.js';
import { Keyframes } from '../Keyframes.js';
import { OpacityOverLife } from '../OpacityOverLife.js';

export function Particles_3821() {
  const particleSystem = new QUARKS.ParticleSystem({
    uTileCount: 2,
    vTileCount: 2,
    blendTiles: true,
    // Duration of the particle system in seconds
    duration: 200,

    // Whether the particle system should loop
    looping: true, // FOR DEMO ONLY

    // Emission shape (where particles are emitted from)
    shape: new UniformSphereEmitter({
      radius: 50,
      thickness: 1,
    }),
    emissionOverTime: new QUARKS.ConstantValue(0),

    emissionBursts: [
      {
        time: 0,
        count: new QUARKS.ConstantValue(10),
        cycle: 1,
        interval: 0.1, // Interval between cycles
        probability: 1, // Probability of the burst occurring
      },
    ],

    // Initial particle properties
    startLife: new QUARKS.IntervalValue(200 - 50, 200 + 50),
    // prewarm: true,
    startSpeed: new QUARKS.ConstantValue(0),
    startSize: new QUARKS.IntervalValue(250*(1 - 0.2), 250*(1 + 0.2)),
    startRotation: new QUARKS.IntervalValue(0, 2 * Math.PI),
    startColor: new RandomColorIndependent(
      new THREE.Vector4(0.60, 0.60, 0.60, 0.125),
      new THREE.Vector4(1.00, 1.00, 1.00, 0.125),
    ),

    // Whether to use world space coordinates
    worldSpace: true,

    // Material for particles
    material: new THREE.MeshBasicMaterial({
      map: new THREE.TextureLoader().load("images/SG_mini_galaxy_4pack.png"),
      transparent: true,
      blending: THREE.AdditiveBlending,
    }),

    // Behaviors controlling particle evolution over time
    behaviors: [
      new QUARKS.FrameOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0, 1, 2, 3), 0]])), // tile index 0 from the 4x4 grid
    ],
  });

  return particleSystem;
}
