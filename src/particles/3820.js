import * as THREE from 'three';
import * as QUARKS from 'three.quarks';
import { RandomColorIndependent } from '../RandomColorIndependent.ts';
import { UniformSphereEmitter } from '../UniformSphereEmitter.js';
import { Keyframes } from '../Keyframes.js';
import { OpacityOverLife } from '../OpacityOverLife.js';

export function Particles_3820() {
  const particleSystem = new QUARKS.ParticleSystem({
    uTileCount: 4,
    vTileCount: 4,
    blendTiles: true,
    // Duration of the particle system in seconds
    duration: 30,

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
        count: new QUARKS.ConstantValue(50),
        cycle: 1,
        interval: 0.1, // Interval between cycles
        probability: 1, // Probability of the burst occurring
      },
    ],

    // Initial particle properties
    startLife: new QUARKS.ConstantValue(30),
    // prewarm: true,
    startSpeed: new QUARKS.ConstantValue(0),
    startSize: new QUARKS.IntervalValue(6*(1 - 0.25), 6*(1 + 0.25)),
    startRotation: new QUARKS.IntervalValue(0, 2 * Math.PI),
    startColor: new RandomColorIndependent(
      new THREE.Vector4(0.65, 0.65, 0.65, 1),
      new THREE.Vector4(1.00, 1.00, 1.00, 1),
    ),

    // Whether to use world space coordinates
    worldSpace: true,

    // Material for particles
    material: new THREE.MeshBasicMaterial({
      map: new THREE.TextureLoader().load("images/SG_star_16pack.png"),
      transparent: true,
      blending: THREE.AdditiveBlending,
    }),

    // Behaviors controlling particle evolution over time
    behaviors: [
      new QUARKS.FrameOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0, 5, 10, 15), 0]])), // tile index 0 from the 4x4 grid
      new OpacityOverLife(new Keyframes([0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0], 0.2)),
    ],
  });

  return particleSystem;
}
