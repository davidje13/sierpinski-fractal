function makeVertices(sides) {
	const vertices = [];
	for (let i = 0; i < sides; ++i) {
		const angle = Math.PI * 2 * i / sides;
		const cc = Math.cos(angle);
		const ss = Math.sin(angle);
		vertices.push({ x: ss, y: -cc });
	}
	return vertices;
}

function makeProjections(sides, scale) {
	const projections = new Float32Array(sides * 2 * 4);
	for (let i = 0; i < sides; ++i) {
		const angle = Math.PI * 2 * i / sides;
		const cc = Math.cos(angle);
		const ss = Math.sin(angle);
		projections[i * 8    ] = cc * scale;
		projections[i * 8 + 1] = -ss * scale;
		projections[i * 8 + 2] = ss * scale;
		projections[i * 8 + 3] = cc * scale;

		projections[i * 8 + 4] = -cc * scale;
		projections[i * 8 + 5] = ss * scale;
		projections[i * 8 + 6] = ss * scale;
		projections[i * 8 + 7] = cc * scale;
	}
	return projections;
}

function blend(pt1, pt2, fraction) {
	const ifraction = 1.0 - fraction;
	return {
		x: pt1.x * ifraction + pt2.x * fraction,
		y: pt1.y * ifraction + pt2.y * fraction,
	};
}

const COL_SCALE_NUM = 4096;
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
		this.buckets = new Uint32Array(size * size);
		this.centre = Math.floor(size / 2) + 0.5;
		this.projections = makeProjections(points, size * 0.5 - 2);
		this.vertices = makeVertices(points);
		this.agents = [Object.assign({}, this.vertices[0])];
		this.accumulate(this.agents);
	}

	accumulate(agents) {
		const { projections, buckets, size, centre } = this;
		for (const pt of agents) {
			for (let i = 0; i < projections.length; i += 4) {
				const x = pt.x * projections[i    ] + pt.y * projections[i + 1] + centre;
				const y = pt.x * projections[i + 2] + pt.y * projections[i + 3] + centre;
				++buckets[(y | 0) * size + (x | 0)];
			}
		}
	}

	stepGrowAgents(maxAgents) {
		if (this.points < 2) {
			return;
		}
		while (this.agents.length * this.points < maxAgents) {
			this.agents = this.agents.map((agent) => this.vertices.map((vertex) => blend(
				agent,
				vertex,
				this.fraction,
			))).flat(1);
			this.accumulate(this.agents);
		}
	}

	step(steps) {
		const { agents, points, vertices, fraction } = this;
		const ifraction = 1.0 - fraction;
		for (let i = 0; i < steps; ++i) {
			for (const agent of agents) {
				const target = vertices[(Math.random() * points) | 0];
				agent.x = agent.x * ifraction + target.x * fraction;
				agent.y = agent.y * ifraction + target.y * fraction;
			}
			this.accumulate(agents);
		}
	}

	render(target) {
		const { size, buckets } = this;
		const N = size * size;
		let max = 0;
		let sum = 0;
		for (let p = 0; p < N; ++p) {
			const v = buckets[p];
			sum += v;
			max = Math.max(max, v);
		}
		const m = COL_SCALE_NUM / max;
		const out = new Uint32Array(target.data.buffer);
		for (let p = 0; p < N; ++p) {
			out[p] = COL_SCALE[(buckets[p] * m) | 0];
		}
		return [max, sum / N];
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
		fractal.stepGrowAgents(change.agents);
		change = null;
		lastRatio = -1;
		stopThresh = 0;
	}
	fractal.step(10);
	const [max, avg] = fractal.render(outData);
	const ratio = avg / max;
	if (Math.abs(ratio - lastRatio) < 0.0001) {
		if ((++stopThresh) > 50) {
			stop();
		}
	} else {
		stopThresh = 0;
		lastRatio = ratio;
	}
	ctx.putImageData(outData, 0, 0);
}
