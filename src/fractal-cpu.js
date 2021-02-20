class Fractal {
	constructor(target, points, fraction, { maxAgents, palette }) {
		const size = target.width;
		this.ctx = target.getContext('2d');
		this.outData = this.ctx.createImageData(size, size);
		this.outBuffer = new Uint32Array(this.outData.data.buffer);

    this.palette = palette;
		this.fraction = fraction;
		this.size = size;
		this.half = Math.floor(size / 2) + 1;
		this.buckets = new Uint32Array(this.half * size);
		this.vertices = makeVertices(points);
		this.projections = makeProjections(points, size * 0.5 - 2);
		this.agents = makeAgents(maxAgents, this.vertices, fraction);
	}

	step(steps) {
		const {
			projections,
			buckets,
			half,
			agents,
			vertices,
			fraction,
		} = this;
		const ifraction = 1.0 - fraction;
		const cy = half - 0.5;
		const points = vertices.length / 2;
		const A = agents.length;
		for (let i = 0; i < steps; ++i) {
			for (let a = 0; a < A; a += 2) {
				const target = ((Math.random() * points) | 0) * 2;
				const x = agents[a    ] = agents[a    ] * ifraction + vertices[target    ] * fraction;
				const y = agents[a + 1] = agents[a + 1] * ifraction + vertices[target + 1] * fraction;
				for (let j = 0; j < projections.length; j += 4) {
					const px = Math.abs(x * projections[j    ] + y * projections[j + 1]) + 0.5;
					const py =          x * projections[j + 2] + y * projections[j + 3] + cy;
					++buckets[(py | 0) * half + (px | 0)];
				}
			}
		}
	}

	render() {
		const { half, size, buckets, palette } = this;
		const N = half * size;
		let max = 0;
		let sum = 0;
		for (let p = 0; p < N; ++p) {
			const v = buckets[p];
			sum += v;
			max = Math.max(max, v);
		}
		for (let y = 0; y < size; ++y) {
			// pixels on the boundary count double since they would contain their own reflection
			const v = buckets[y * half];
			sum += v;
			max = Math.max(max, v * 2);
		}
		const m = (palette.length - 1) / max;
		const out = this.outBuffer;
		for (let y = 0; y < size; ++y) {
			const p = y * size + half;
			// pixels on the boundary count double since they would contain their own reflection
			out[p] = palette[(buckets[y * half] * 2 * m) | 0];
			for (let x = 1; x < half; ++x) {
				out[p + x] = out[p - x] = palette[(buckets[y * half + x] * m) | 0];
			}
		}
		this.ctx.putImageData(this.outData, 0, 0);
		return [max, sum / (N + size)];
	}
}
