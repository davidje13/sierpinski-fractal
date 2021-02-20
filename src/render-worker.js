importScripts('fractal-utils.js', 'fractal-cpu.js');

const PALETTE = makeScale(
	Math.min(WebGL2RenderingContext.MAX_TEXTURE_SIZE, 16384),
	0.2, 0.5, 0.8,
);

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
		const data = change;
		change = null;
		try {
			fractal = new Fractal(
				out,
				Number(data.points) | 0,
				Number(data.fraction),
				{ maxAgents: data.agents, palette: PALETTE },
			);
			lastRatio = -1;
			stopThresh = 0;
		} catch (e) {
			console.log('failed to begin render', e);
			stop();
			return;
		}
	}
	try {
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
	} catch (e) {
		console.log('failed to step render', e);
		stop();
		return;
	}
}
