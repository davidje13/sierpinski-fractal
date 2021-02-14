const GOLD_RATIO = (1 + Math.sqrt(5)) / 2;

window.addEventListener('DOMContentLoaded', () => {
	const size = 701;
	const dpr = window.devicePixelRatio;
	const specialFractions = [
		1 / 3,
		GOLD_RATIO ** -2, // appears significant for 3, 4, 5, 6, 10 points
		0.5,
	];

	const points = document.getElementsByName('points')[0];
	const fraction = document.getElementsByName('fraction')[0];
	const fractionOut = document.getElementById('fraction-display');
	const out = document.getElementById('out');

	const fractionValues = document.getElementById('fraction-values');
	specialFractions.sort((a, b) => (a - b)).forEach((f) => {
		const o = document.createElement('option');
		o.setAttribute('value', f);
		fractionValues.appendChild(o);
	});

	out.width = size * dpr;
	out.height = size * dpr;
	out.style.width = size + 'px';

	const offscreenCanvas = out.transferControlToOffscreen();

	const renderer = new Worker('src/render-worker.js');
	renderer.postMessage({ canvas: offscreenCanvas }, [offscreenCanvas]);
	renderer.addEventListener('message', ({ data }) => {
		if (data === 'complete') {
			out.classList.remove('live');
		}
	});

	function update() {
		const pts = Number(points.value) | 0;
		const frac = Number(fraction.value);
		fractionOut.innerText = frac.toFixed(6);

		out.classList.add('live');
		renderer.postMessage({ points: pts, fraction: frac, agents: 10000 });
	}

	for (const o of document.getElementsByTagName('input')) {
		o.addEventListener('input', update);
	}
	update();
});
