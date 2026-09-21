import * as THREE from 'three';
import * as QUARKS from 'three.quarks';
import { RandomColorIndependent } from '../RandomColorIndependent.ts';
import { UniformSphereEmitter } from '../UniformSphereEmitter.js';
import { Keyframes } from '../Keyframes.js';
import { OpacityOverLife } from '../OpacityOverLife.js';

export function Particles_3816() {
  const particleSystem = new QUARKS.ParticleSystem({
    uTileCount: 2,
    vTileCount: 2,
    blendTiles: true,
    // Duration of the particle system in seconds
    duration: 30,

    // Whether the particle system should loop
    looping: true, // FOR DEMO ONLY

    // Emission shape (where particles are emitted from)
    shape: new UniformSphereEmitter({
      radius: 800,
      thickness: 1,
    }),
    emissionOverTime: new QUARKS.ConstantValue(0),

    emissionBursts: [
      {
        time: 0,
        count: new QUARKS.ConstantValue(300),
        cycle: 1,
        interval: 0.1, // Interval between cycles
        probability: 1, // Probability of the burst occurring
      },
    ],

    // Initial particle properties
    startLife: new QUARKS.ConstantValue(30),
    // prewarm: true,
    startSpeed: new QUARKS.ConstantValue(0),
    startSize: new QUARKS.ConstantValue(300),
    startRotation: new QUARKS.IntervalValue(0, 2 * Math.PI),
    startColor: new QUARKS.RandomColor(
      new THREE.Vector4(0.5176471, 0.4784314, 0.9803922, 0.15),
      new THREE.Vector4(0.5176471, 0.4784314, 0.9803922, 0.375)
    ),

    // Whether to use world space coordinates
    worldSpace: true,

    // Material for particles
    material: new THREE.MeshBasicMaterial({
      map: new THREE.TextureLoader().load("images/SG_cloud_4pack.png"),
      // color: new THREE.Color(0xffffff),
      transparent: true,
      blending: THREE.AdditiveBlending,
    }),

    // Behaviors controlling particle evolution over time
    behaviors: [
      new QUARKS.FrameOverLife(new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(0, 1, 2, 3), 0]])), // tile index 0 from the 4x4 grid
      new OpacityOverLife(
        // vary: 0.25 gives every particle its own +/-25%-jittered copy of this curve,
        // so they stop fading in lockstep. Zero keyframes stay exactly zero, so the
        // fade in and fade out are still clean.
        new Keyframes([0, 0.25, 0.25, 0.3, 0.25, 0.2, 0.25, 0.15, 0.25, 0.2, 0.25, 0], { vary: 0.25 })
      ),
    ],
  });

  return particleSystem;
}
