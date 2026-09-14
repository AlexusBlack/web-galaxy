/**
 * Drop-in replacement for QUARKS.SphereEmitter that is uniform in *volume*.
 *
 * three.quarks' SphereEmitter samples the radius linearly (r = R * random()),
 * which gives density proportional to 1/r^2 and piles particles up at the
 * centre. Sampling the cube root spreads them evenly through the ball.
 *
 * thickness: 1 = filled ball, 0 = thin shell at `radius` (same meaning as the
 * built-in emitter).
 */
export class UniformSphereEmitter {
  type = 'sphere';

  constructor({ radius = 10, thickness = 1, arc = 2 * Math.PI } = {}) {
    this.radius = radius;
    this.thickness = thickness;
    this.arc = arc;
  }

  initialize(p) {
    // uniform direction: acos(2u-1) avoids the clustering at the poles that
    // a naive uniform phi would produce
    const theta = Math.random() * this.arc;
    const phi = Math.acos(2 * Math.random() - 1);
    const sinPhi = Math.sin(phi);

    p.position.set(sinPhi * Math.cos(theta), sinPhi * Math.sin(theta), Math.cos(phi));
    p.velocity.copy(p.position).multiplyScalar(p.startSpeed);

    // uniform in volume across the shell [inner*R, R]
    const inner = 1 - this.thickness;
    const r = Math.cbrt(inner ** 3 + (1 - inner ** 3) * Math.random());
    p.position.multiplyScalar(this.radius * r);
  }

  update() {}

  toJSON() {
    return { type: 'sphere', radius: this.radius, thickness: this.thickness, arc: this.arc };
  }

  clone() {
    return new UniformSphereEmitter(this);
  }
}
