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

const COL_SCALE_NUM = 16384;
const COL_SCALE = new Uint32Array(COL_SCALE_NUM + 1);
for (let i = 0; i < COL_SCALE_NUM; ++ i) {
	const v = i / (COL_SCALE_NUM - 1);
	const r = Math.max(0, 255 - Math.floor(Math.pow(v, 0.2) * 256));
	const g = Math.max(0, 255 - Math.floor(Math.pow(v, 0.5) * 256));
	const b = Math.max(0, 255 - Math.floor(Math.pow(v, 0.8) * 256));
	const a = 255;
	COL_SCALE[i] = (a << 24) | (b << 16) | (g << 8) | r;
}
COL_SCALE[0] = 0;
COL_SCALE[COL_SCALE_NUM] = COL_SCALE[COL_SCALE_NUM - 1];

class Fractal {
	constructor(points, fraction, size) {
		this.points = points;
		this.fraction = fraction;
		this.size = size;
		this.half = Math.floor(size / 2) + 1;
		this.buckets = new Uint32Array(this.half * size);
		this.centre = this.half - 0.5;
		this.projections = makeProjections(points, size * 0.5 - 2);
		this.vertices = makeVertices(points);
	}

	accumulate(agents, n) {
		const { projections, buckets, half, centre } = this;
		for (let i = 0; i < n; ++ i) {
			const x = agents[i * 2    ];
			const y = agents[i * 2 + 1];
			for (let j = 0; j < projections.length; j += 4) {
				const px = Math.abs(x * projections[j    ] + y * projections[j + 1]) + 0.5;
				const py =          x * projections[j + 2] + y * projections[j + 3] + centre;
				++buckets[(py | 0) * half + (px | 0)];
			}
		}
	}

	spawnAgents(maxAgents) {
		const { points, vertices, fraction } = this;
		const ifraction = 1.0 - fraction;
		if (points < 2) {
			return;
		}
		let agents = new Float32Array(2);
		agents[0] = vertices[0];
		agents[1] = vertices[1];
		let count = 1;
		this.accumulate(agents, count);
		while (count * points < maxAgents) {
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
			this.accumulate(agents, count);
		}
		this.agents = agents;
		this.agentCount = count;
	}

	step(steps) {
		const { agents, agentCount, points, vertices, fraction } = this;
		const ifraction = 1.0 - fraction;
		for (let i = 0; i < steps; ++i) {
			for (let a = 0; a < agentCount; ++ a) {
				const target = ((Math.random() * points) | 0) * 2;
				agents[a * 2    ] = agents[a * 2    ] * ifraction + vertices[target    ] * fraction;
				agents[a * 2 + 1] = agents[a * 2 + 1] * ifraction + vertices[target + 1] * fraction;
			}
			this.accumulate(agents, agentCount);
		}
	}

	render(target) {
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
		const out = new Uint32Array(target.data.buffer);
		for (let y = 0; y < size; ++y) {
			const p = y * size + half;
			// pixels on the boundary count double since they would contain their own reflection
			out[p] = COL_SCALE[(buckets[y * half] * 2 * m) | 0];
			for (let x = 1; x < half; ++x) {
				out[p + x] = out[p - x] = COL_SCALE[(buckets[y * half + x] * m) | 0];
			}
		}
		return [max, sum / (N + size)];
	}
}

let out = null;
let ctx = null;
let outData = null;
let fractal = null;
let change = null;
let interval = null;
let lastRatio = null;
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
		fractal = new Fractal(Number(change.points) | 0, Number(change.fraction), out.width);
		ctx = out.getContext('2d');
		outData = ctx.createImageData(fractal.size, fractal.size);
		fractal.spawnAgents(change.agents);
		change = null;
		lastRatio = -1;
		stopThresh = 0;
	}
	fractal.step(10);
	const [max, avg] = fractal.render(outData);
	const ratio = avg / max;
	if (Math.abs(ratio - lastRatio) < 0.0001) {
		if ((++stopThresh) > 20) {
			stop();
		}
	} else {
		stopThresh = 0;
		lastRatio = ratio;
	}
	ctx.putImageData(outData, 0, 0);
}
