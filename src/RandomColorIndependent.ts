// src/vfx/generators/RandomColorIndependent.ts
import { Vector4, ColorGenerator, GeneratorMemory, FunctionJSON } from 'three.quarks';
// (or 'quarks.core' — whichever one is your direct dependency; three.quarks re-exports quarks.core's public types)

export class RandomColorIndependent implements ColorGenerator {
    constructor(
        public a: Vector4,
        public b: Vector4
    ) {
        this.type = 'value';
    }

    startGen(memory: GeneratorMemory): void {}

    genColor(memory: GeneratorMemory, color: Vector4): Vector4 {
        color.x = this.a.x + (this.b.x - this.a.x) * Math.random();
        color.y = this.a.y + (this.b.y - this.a.y) * Math.random();
        color.z = this.a.z + (this.b.z - this.a.z) * Math.random();
        color.w = this.a.w + (this.b.w - this.a.w) * Math.random();
        return color;
    }

    type: 'value';

    toJSON(): FunctionJSON {
        return {
            type: 'RandomColorIndependent',
            a: [this.a.x, this.a.y, this.a.z, this.a.w],
            b: [this.b.x, this.b.y, this.b.z, this.b.w],
        };
    }

    static fromJSON(json: any): RandomColorIndependent {
        return new RandomColorIndependent(
            new Vector4(json.a[0], json.a[1], json.a[2], json.a[3]),
            new Vector4(json.b[0], json.b[1], json.b[2], json.b[3])
        );
    }

    clone(): ColorGenerator {
        return new RandomColorIndependent(this.a.clone(), this.b.clone());
    }
}
