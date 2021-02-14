function makeVertices(sides) {
	const vertices = new Float32Array(sides * 2);
	for (let i = 0; i < sides; ++i) {
		const angle = Math.PI * 2 * i / sides;
		const cc = Math.cos(angle);
		const ss = Math.sin(angle);
		vertices[i * 2    ] = ss;
		vertices[i * 2 + 1] = -cc;
	}
	return vertices;
}

function makeProjections(sides, scale) {
	const projections = new Float32Array(sides * 4);
	for (let i = 0; i < sides; ++i) {
		const angle = Math.PI * 2 * i / sides;
		const cc = Math.cos(angle);
		const ss = Math.sin(angle);
		projections[i * 4    ] = cc * scale;
		projections[i * 4 + 1] = -ss * scale;
		projections[i * 4 + 2] = ss * scale;
		projections[i * 4 + 3] = cc * scale;
	}
	return projections;
}

function makeAgents(maxAgents, vertices, fraction) {
	const points = vertices.length / 2;
	const ifraction = 1.0 - fraction;
	let agents = new Float32Array(2);
	agents[0] = vertices[0];
	agents[1] = vertices[1];
	let count = 1;
	while (points >= 2 && count * points < maxAgents) {
		const next = new Float32Array(count * points * 2);
		for (let a = 0; a < count; ++ a) {
			const x = agents[a * 2    ];
			const y = agents[a * 2 + 1];
			for (let i = 0; i < points; ++i) {
				const p = (a * points + i) * 2;
				next[p    ] = x * ifraction + vertices[i * 2    ] * fraction;
				next[p + 1] = y * ifraction + vertices[i * 2 + 1] * fraction;
			}
		}
		agents = next;
		count *= points;
	}
	return agents;
}

function makeScale(sampleCount, powR, powG, powB) {
	const scale = new Uint32Array(sampleCount + 1);
	const scaleRGBA = new Uint8ClampedArray(scale.buffer);
	for (let i = 0; i < sampleCount; ++ i) {
		const v = i / (sampleCount - 1);
		scaleRGBA[i * 4    ] = (1 - Math.pow(v, powR)) * 256;
		scaleRGBA[i * 4 + 1] = (1 - Math.pow(v, powG)) * 256;
		scaleRGBA[i * 4 + 2] = (1 - Math.pow(v, powB)) * 256;
		scaleRGBA[i * 4 + 3] = 255;
	}
	scaleRGBA[3] = 0;
	scale[sampleCount] = scale[sampleCount - 1];
	return scale;
}

const COL_SCALE_NUM = 16384;
const COL_SCALE = makeScale(COL_SCALE_NUM, 0.2, 0.5, 0.8);

class Fractal {
	constructor(target, points, fraction, { maxAgents = 1000 } = {}) {
		const size = target.width;
		this.ctx = target.getContext('2d');
		this.outData = this.ctx.createImageData(size, size);
		this.outBuffer = new Uint32Array(this.outData.data.buffer);

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
		const { half, size, buckets } = this;
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
		const m = COL_SCALE_NUM / max;
		const out = this.outBuffer;
		for (let y = 0; y < size; ++y) {
			const p = y * size + half;
			// pixels on the boundary count double since they would contain their own reflection
			out[p] = COL_SCALE[(buckets[y * half] * 2 * m) | 0];
			for (let x = 1; x < half; ++x) {
				out[p + x] = out[p - x] = COL_SCALE[(buckets[y * half + x] * m) | 0];
			}
		}
		this.ctx.putImageData(this.outData, 0, 0);
		return [max, sum / (N + size)];
	}
}

let out = null;
let fractal = null;
let change = null;
let interval = null;
let lastRatio = -1;
let stopThresh = 0;

self.addEventListener('message', ({ data }) => {
	if (data.canvas) {
		out = data.canvas;
	}
	if (data.points) {
		start(data);
	}
});

function start(data) {
	change = data;
	if (!interval) {
		interval = setInterval(step, 0);
	}
}

function stop() {
	clearInterval(interval);
	interval = null;
	fractal = null;
	self.postMessage('complete');
}

function step() {
	if (change) {
		fractal = new Fractal(
			out,
			Number(change.points) | 0,
			Number(change.fraction),
			{ maxAgents: change.agents },
		);
		change = null;
		lastRatio = -1;
		stopThresh = 0;
	}
	fractal.step(20);
	const [max, avg] = fractal.render();
	const ratio = avg / max;
	if (Math.abs(ratio - lastRatio) < 0.0001) {
		if ((++stopThresh) > 20) {
			stop();
		}
	} else {
		stopThresh = 0;
		lastRatio = ratio;
	}
}
