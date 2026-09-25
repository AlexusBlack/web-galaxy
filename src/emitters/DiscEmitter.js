import { EmitterBase, sampleAnnulusFraction } from './EmitterBase.js';
import { planeOf } from '../effectmaps/planes.js';

// Emits from a flat elliptical disc (or an annulus), uniform per unit AREA in the plane.
//
//   new DiscEmitter({ radius: [1000, 7.5, 1000] })              // the galaxy disc
//   new DiscEmitter({ radius: [500, 0, 500], thickness: 0.3 })  // a flat outer ring
//
// `radius` is per-axis as everywhere else: the two in-plane components are the ellipse's
// semi-axes and the third is the HALF-THICKNESS along the normal, filled uniformly.
//
// WHY THIS EXISTS RATHER THAN EllipsoidEmitter WITH A SMALL Y. A volume-uniform ellipsoid's
// density projected onto its wide plane is not flat: it follows the chord through the body,
// sqrt(1 - rho^2), and the flattening factors out entirely, so squashing an ellipsoid never
// removes it. Measured relative areal density 1.000 / 0.954 / 0.866 / 0.714 / 0.656 at
// rho = 0 / 0.3 / 0.5 / 0.7 / 0.755 -- a 34% falloff by the arm tips, which is a real
// vignette and moves whenever anyone touches the radius. Sampling the plane directly makes
// the marginal exactly flat. (Correcting the ellipsoid by dividing acceptance by
// sqrt(1 - rho^2) is not an option: it diverges at the rim.)
//
// This overrides initialize() rather than implementing place(), because the base template
// is parameterised as "direction on a sphere x radial fraction" and a disc is not. It keeps
// the same three-draw budget, in the order theta, rho, normal.
export class DiscEmitter extends EmitterBase {
  type = 'disc';

  constructor({ radius = 10, thickness = 1, arc = 2 * Math.PI, plane = 'xz' } = {}) {
    super({ radius, thickness, arc });
    this.plane = plane;
    this._axes = planeOf(plane, this.constructor.name);
  }

  initialize(particle) {
    const { u, v, n } = this._axes;
    const theta = Math.random() * this.arc;
    // sqrt, not cbrt: uniform by AREA. The cube root would be the 3D answer and would pile
    // particles toward the centre of a disc exactly as stock SphereEmitter does in a ball.
    const rho = sampleAnnulusFraction(this.thickness);
    const half = (2 * Math.random() - 1) * this._radius[n];

    const ru = this._radius[u];
    const rv = this._radius[v];
    particle.position[u] = Math.cos(theta) * (ru * rho);
    particle.position[v] = Math.sin(theta) * (rv * rho);
    particle.position[n] = half;

    // Radial in-plane, matching the other shapes' "outward from the centre" convention. The
    // normal component is deliberately excluded: a disc that also blew particles along its
    // own thickness would read as a puff, not a plane. normalize() divides by
    // `length() || 1`, so the centre yields zero velocity rather than NaN.
    particle.velocity[u] = particle.position[u];
    particle.velocity[v] = particle.position[v];
    particle.velocity[n] = 0;
    particle.velocity.normalize().multiplyScalar(particle.startSpeed);
  }

  toJSON() {
    throw new Error("DiscEmitter.toJSON: not supported (no EmitterShapes loader for 'disc')");
  }
}
