import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as QUARKS from 'three.quarks';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
const renderer = new THREE.WebGLRenderer();
const controls = new OrbitControls(camera, renderer.domElement);
camera.position.set(0, 100, 100);

renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

// Create a batched renderer for efficient particle rendering
const batchedRenderer = new QUARKS.BatchedRenderer();
scene.add(batchedRenderer);

// Create a particle system
const particleSystem = new QUARKS.ParticleSystem({
  // Duration of the particle system in seconds
  duration: 10,

  // Whether the particle system should loop
  looping: false,

  // Emission shape (where particles are emitted from)
  shape: new QUARKS.SphereEmitter({
    radius: 500,
    thickness: 1,
  }),
  emissionOverTime: new QUARKS.ConstantValue(0),

  emissionBursts: [
    {
      time: 0,
      count: new QUARKS.ConstantValue(500),
      cycle: 1,
      interval: 0.1, // Interval between cycles
      probability: 1, // Probability of the burst occurring
    },
  ],

  // emissionOverTime: new QUARKS.ConstantValue(500),

  // Initial particle properties
  startLife: new QUARKS.ConstantValue(30000000),
  // prewarm: true,
  startSpeed: new QUARKS.ConstantValue(0),
  startSize: new QUARKS.ConstantValue(30),
  startColor: new QUARKS.ConstantColor(new THREE.Vector4(1, 1, 1, 1)),

  // Whether to use world space coordinates
  worldSpace: true,

  // Material for particles
  material: new THREE.MeshBasicMaterial({
    // color: 0xffffff,
    map: new THREE.TextureLoader().load("images/SG_star.png"),
    transparent: true,
    blending: THREE.AdditiveBlending,
  }),

  // Behaviors controlling particle evolution over time
  behaviors: [
    // new QUARKS.SizeOverLife(
    //   new QUARKS.PiecewiseBezier([[new QUARKS.Bezier(1, 0.8, 0.2, 0), 0]]),
    // ),
    // new QUARKS.ColorOverLife(
    //   new QUARKS.Gradient(
    //     [
    //       [new THREE.Vector3(1, 0.5, 0.1), 0],
    //       [new THREE.Vector3(0.1, 0.1, 0.1), 1],
    //     ],
    //     [
    //       [1, 0],
    //       [0, 1],
    //     ],
    //   ),
    // ),
  ],
});

particleSystem.addEventListener('emitEnd', (event) => {
  console.log("Emission ended");
});

// Add the particle system to the scene
scene.add(particleSystem.emitter);

// Add the particle system to the batched renderer
batchedRenderer.addSystem(particleSystem);

controls.update();
function animate() {
  requestAnimationFrame( animate );

  batchedRenderer.update(0.016); // Update the batched renderer with a fixed delta time (16ms for ~60fps)
  controls.update();

  renderer.render( scene, camera );
}

animate();
